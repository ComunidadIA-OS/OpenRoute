import os
import json
import numpy as np
import pandas as pd

class DataProcessor:
    """
    Clase encargada de cargar, validar y procesar la información de pedidos y vehículos.
    Calcula matrices de distancia y tiempo utilizando fórmulas geodésicas (Haversine)
    ajustadas con coeficientes reales de circulación urbana.
    """
    def __init__(self, earth_radius_km=6371.0, traffic_delay_factor=1.3, speed_kmh=35.0):
        self.earth_radius_km = earth_radius_km
        self.traffic_delay_factor = traffic_delay_factor # Factor multiplicador de distancia real urbana (callejero vs línea recta)
        self.speed_kmh = speed_kmh # Velocidad promedio de reparto en ciudad (km/h)
        self.average_service_time_min = 10.0 # Tiempo fijo estimado por entrega en paradas (minutos)

    def load_orders(self, file_path):
        """
        Carga y limpia el CSV de pedidos.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"No se encontró el archivo de pedidos en: {file_path}")
        
        df = pd.read_csv(file_path)
        return self.validate_orders(df)

    def validate_orders(self, df):
        """
        Valida que el DataFrame contenga las columnas obligatorias y que sus valores sean congruentes.
        """
        required_cols = ['id_pedido', 'cliente', 'lat', 'lon', 'prioridad', 'peso_kg', 'franja_inicio', 'franja_fin']
        for col in required_cols:
            if col not in df.columns:
                raise ValueError(f"Falta la columna obligatoria '{col}' en los datos de pedidos.")

        # Limpieza de tipos y valores nulos
        df = df.dropna(subset=['id_pedido', 'lat', 'lon', 'peso_kg'])
        df['prioridad'] = df['prioridad'].fillna(1).astype(int)
        df['peso_kg'] = df['peso_kg'].astype(float)
        
        # Validar rangos de coordenadas
        df = df[(df['lat'].between(37.5, 39.5)) & (df['lon'].between(-1.5, 0.5))]
        
        # Convertir franjas horarias a minutos desde medianoche
        df['minutos_inicio'] = df['franja_inicio'].apply(self._time_to_minutes)
        df['minutos_fin'] = df['franja_fin'].apply(self._time_to_minutes)
        
        # Validar consistencia de ventanas de tiempo
        invalid_windows = df['minutos_inicio'] > df['minutos_fin']
        if invalid_windows.any():
            print(f"Advertencia: Se detectaron ventanas horarias inválidas (inicio > fin) en pedidos: {df.loc[invalid_windows, 'id_pedido'].tolist()}. Ajustando a ventana completa.")
            df.loc[invalid_windows, 'minutos_fin'] = 1439 # 23:59
            
        return df.reset_index(drop=True)

    def load_vehicles(self, file_path):
        """
        Carga la configuración de la flota desde un archivo JSON.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"No se encontró el archivo de vehículos en: {file_path}")
            
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        df = pd.DataFrame(data)
        required_cols = ['id_vehiculo', 'nombre', 'capacidad_kg', 'coste_por_km', 'hora_inicio', 'hora_fin', 'deposito_lat', 'deposito_lon']
        for col in required_cols:
            if col not in df.columns:
                raise ValueError(f"Falta el campo obligatorio '{col}' en la configuración de vehículos.")
                
        df['minutos_inicio'] = df['hora_inicio'].apply(self._time_to_minutes)
        df['minutos_fin'] = df['hora_fin'].apply(self._time_to_minutes)
        
        return df

    def _time_to_minutes(self, time_str):
        """
        Convierte una cadena formato HH:MM en minutos totales desde medianoche.
        """
        if pd.isna(time_str) or not isinstance(time_str, str) or ':' not in time_str:
            return 480 # 08:00 por defecto
        try:
            parts = time_str.split(':')
            hours = int(parts[0])
            minutes = int(parts[1])
            return hours * 60 + minutes
        except Exception:
            return 480

    def calculate_haversine_distance(self, lat1, lon1, lat2, lon2):
        """
        Calcula la distancia geodésica entre dos puntos en la Tierra usando la fórmula de Haversine.
        Multiplica el resultado por un factor urbano para simular trazado real de calles.
        """
        # Conversión a radianes
        lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
        
        # Diferencias
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        # Fórmula Haversine
        a = np.sin(dlat/2.0)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2.0)**2
        c = 2.0 * np.arcsin(np.sqrt(a))
        distance_straight = self.earth_radius_km * c
        
        # Retornar distancia ajustada por factor de trazado real urbano
        return distance_straight * self.traffic_delay_factor

    def build_distance_matrix(self, depot_lat, depot_lon, orders_df):
        """
        Construye una matriz de distancias completa (Km) e intervalos de tiempo de viaje (Min).
        El índice 0 representa el depósito (depot) de salida/llegada.
        Los índices 1 a N representan los pedidos correspondientes a las filas del orders_df.
        """
        n = len(orders_df) + 1
        dist_matrix = np.zeros((n, n))
        
        # Generamos array de coordenadas para facilidad
        lats = np.zeros(n)
        lons = np.zeros(n)
        
        lats[0] = depot_lat
        lons[0] = depot_lon
        
        lats[1:] = orders_df['lat'].values
        lons[1:] = orders_df['lon'].values
        
        # Rellenar matriz de distancias
        for i in range(n):
            for j in range(n):
                if i == j:
                    dist_matrix[i, j] = 0.0
                else:
                    dist_matrix[i, j] = self.calculate_haversine_distance(
                        lats[i], lons[i], lats[j], lons[j]
                    )
        
        # Matriz de tiempos (en minutos) basados en velocidad promedio
        # velocidad (km/h) / 60 = km por minuto. tiempo (min) = distancia (km) / (velocidad_km_min)
        speed_km_min = self.speed_kmh / 60.0
        time_matrix = dist_matrix / speed_km_min
        
        return dist_matrix, time_matrix

    def add_manual_order(self, orders_df, id_pedido, cliente, direccion, lat, lon, prioridad, peso_kg, franja_inicio, franja_fin, observaciones=""):
        """
        Permite añadir un pedido ingresado manualmente por el usuario.
        Especialmente útil para la opción de añadir paradas con coordenadas directas.
        """
        new_row = pd.DataFrame([{
            'id_pedido': id_pedido,
            'cliente': cliente,
            'direccion': direccion,
            'lat': float(lat),
            'lon': float(lon),
            'prioridad': int(prioridad),
            'peso_kg': float(peso_kg),
            'franja_inicio': franja_inicio,
            'franja_fin': franja_fin,
            'observaciones': observaciones,
            'minutos_inicio': self._time_to_minutes(franja_inicio),
            'minutos_fin': self._time_to_minutes(franja_fin)
        }])
        
        return pd.concat([orders_df, new_row], ignore_index=True)


if __name__ == "__main__":
    # Test sencillo de ejecución local
    processor = DataProcessor()
    workspace_dir = "/Users/samuelparraechague/Developer/3_Workspace_Cloudecode"
    
    try:
        orders = processor.load_orders(os.path.join(workspace_dir, "data/pedidos_ejemplo.csv"))
        vehicles = processor.load_vehicles(os.path.join(workspace_dir, "data/vehiculos_config.json"))
        
        print(f"Pedidos cargados exitosamente: {len(orders)} registros.")
        print(f"Vehículos de flota cargados: {len(vehicles)} vehículos.")
        
        # Probar matriz de distancias para el depósito del primer vehículo
        dep_lat = vehicles.loc[0, 'deposito_lat']
        dep_lon = vehicles.loc[0, 'deposito_lon']
        dist, times = processor.build_distance_matrix(dep_lat, dep_lon, orders)
        
        print(f"Matriz de distancias construida con dimensiones: {dist.shape}")
        print(f"Distancia depósito -> Primer pedido: {dist[0, 1]:.2f} km")
        print(f"Tiempo estimado depósito -> Primer pedido: {times[0, 1]:.2f} min")
        
    except Exception as e:
        print(f"Error durante pruebas: {e}")
