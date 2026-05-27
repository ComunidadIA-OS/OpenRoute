import os
import json
import numpy as np
import pandas as pd

from osrm_client import OSRMClientError, get_default_client, is_disabled as osrm_globally_disabled


class DataProcessor:
    """
    Clase encargada de cargar, validar y procesar la información de pedidos y vehículos.

    Para la matriz de distancias usa OSRM /table por defecto (callejero real),
    cayendo a Haversine × factor_urbano si OSRM no responde. Esto permite que el
    motor optimice sobre distancias verdaderas en lugar de líneas rectas — un
    cambio importante porque OR-Tools/heurística minimizan exactamente la suma
    de la matriz, así que si la matriz es Haversine, el "plan óptimo" lo es
    sobre una aproximación, no sobre la conducción real.

    El fallback Haversine se conserva como red de seguridad: tests offline, CI
    sin red, jurado evaluando en una sala sin Wi-Fi, OSRM público caído.
    """
    # Bounding box por defecto: Alicante/Elche, donde se desarrolló el MVP y vive
    # el dataset de demostración. Se conserva por compatibilidad histórica; una
    # pyme de otra zona puede ampliar el bbox sin tocar código.
    DEFAULT_BBOX = (37.5, 39.5, -1.5, 0.5)  # (lat_min, lat_max, lon_min, lon_max)
    # Equivalente a "sin restricción" — útil para CSVs internacionales o para
    # validar sin filtrar nada (delega la confianza al usuario que sube el CSV).
    WORLDWIDE_BBOX = (-90.0, 90.0, -180.0, 180.0)

    def __init__(self, earth_radius_km=6371.0, traffic_delay_factor=1.3, speed_kmh=35.0, bbox=None):
        self.earth_radius_km = earth_radius_km
        self.traffic_delay_factor = traffic_delay_factor # Factor multiplicador de distancia real urbana (callejero vs línea recta)
        self.speed_kmh = speed_kmh # Velocidad promedio de reparto en ciudad (km/h)
        self.average_service_time_min = 10.0 # Tiempo fijo estimado por entrega en paradas (minutos)
        # Resolución del bbox: argumento explícito > env var > default Alicante/Elche.
        # El env var es muy útil en despliegues: un docker-compose para una pyme
        # de Sevilla solo necesita OPENROUTE_BBOX=37.0,38.0,-6.5,-5.5 y todo el
        # resto del sistema sigue funcionando sin un cambio de código.
        self.bbox = bbox if bbox is not None else self._resolve_bbox_from_env()

    @classmethod
    def _resolve_bbox_from_env(cls):
        """Lee OPENROUTE_BBOX si está definido; si no, usa DEFAULT_BBOX.

        Formatos aceptados:
          - "lat_min,lat_max,lon_min,lon_max"  → tupla literal.
          - "worldwide"                         → sin restricción.

        Si el formato es inválido, lanza ValueError con un mensaje claro: mejor
        fallar pronto que silenciosamente ignorar la configuración del operador.
        """
        raw = os.getenv("OPENROUTE_BBOX", "").strip()
        if not raw:
            return cls.DEFAULT_BBOX
        if raw.lower() == "worldwide":
            return cls.WORLDWIDE_BBOX
        parts = [p.strip() for p in raw.split(",")]
        if len(parts) != 4:
            raise ValueError(
                f"OPENROUTE_BBOX inválido: {raw!r}. Esperado 'lat_min,lat_max,lon_min,lon_max' o 'worldwide'."
            )
        try:
            lat_min, lat_max, lon_min, lon_max = (float(p) for p in parts)
        except ValueError as e:
            raise ValueError(f"OPENROUTE_BBOX inválido: {raw!r} ({e})") from e
        if lat_min >= lat_max or lon_min >= lon_max:
            raise ValueError(
                f"OPENROUTE_BBOX inválido: {raw!r}. Cada min debe ser menor que su max."
            )
        return (lat_min, lat_max, lon_min, lon_max)

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

        # Validar rangos de coordenadas contra el bbox configurado.
        # Pedidos fuera del bbox se descartan silenciosamente; la cuenta de
        # descartados queda visible para el caller (len antes vs len después).
        lat_min, lat_max, lon_min, lon_max = self.bbox
        df = df[(df['lat'].between(lat_min, lat_max)) & (df['lon'].between(lon_min, lon_max))]
        
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

    def build_distance_matrix(self, depot_lat, depot_lon, orders_df, use_osrm=None):
        """
        Construye una matriz de distancias completa (km) e intervalos de tiempo de viaje (min).
        El índice 0 representa el depósito (depot) de salida/llegada.
        Los índices 1..N representan los pedidos correspondientes a las filas de ``orders_df``.

        Parámetros:
          use_osrm:
            - ``None`` (default): intenta OSRM /table; si falla (o si está globalmente
              desactivado vía ``OPENROUTE_DISABLE_OSRM``), cae silenciosamente a Haversine
              y devuelve la matriz aproximada. Este es el comportamiento recomendado para
              producción: real cuando hay red, robusto cuando no.
            - ``True``: fuerza OSRM. Si OSRM falla, propaga la excepción (útil para
              validar que la infraestructura está sana).
            - ``False``: fuerza Haversine (modo previo). Útil en tests deterministas
              y en CI sin red.

        Devuelve ``(dist_matrix_km, time_matrix_min)``. La etiqueta del método se
        devuelve por logging via ``self.last_matrix_source`` ('osrm' | 'haversine').
        """
        coords = self._coords_with_depot(depot_lat, depot_lon, orders_df)

        # Si el llamador fuerza Haversine, ni siquiera intentamos OSRM. Misma
        # rama si el flag global lo desactiva (CI/tests offline, jurado sin red).
        if use_osrm is False or (use_osrm is None and osrm_globally_disabled()):
            self.last_matrix_source = "haversine"
            return self._haversine_matrix(coords)

        try:
            client = get_default_client()
            dist_km, time_min = client.table(coords)
            # OSRM puede devolver inf si dos puntos no están conectados por calle.
            # Si toda la matriz es finita, perfecto. Si hay algún inf, lo dejamos
            # tal cual: el solver lo evitará, y el fallback Haversine alteraría el
            # resultado de forma silenciosa cuando lo que el usuario querría es saberlo.
            self.last_matrix_source = "osrm"
            return dist_km, time_min
        except OSRMClientError as e:
            if use_osrm is True:
                # Modo estricto: el usuario quiere asegurar que OSRM funciona.
                raise
            # Modo auto: caída silenciosa pero registrada. El operador puede
            # comprobar self.last_matrix_source para saber qué se usó.
            print(f"[OSRM] no disponible, fallback a Haversine: {e}")
            self.last_matrix_source = "haversine"
            return self._haversine_matrix(coords)

    def _coords_with_depot(self, depot_lat, depot_lon, orders_df):
        """Devuelve la lista de tuplas (lat, lon) con el depósito en el índice 0."""
        coords = [(float(depot_lat), float(depot_lon))]
        for _, row in orders_df.iterrows():
            coords.append((float(row["lat"]), float(row["lon"])))
        return coords

    def _haversine_matrix(self, coords):
        """Fallback Haversine clásico, idéntico al modo previo del repo."""
        n = len(coords)
        lats = np.array([c[0] for c in coords])
        lons = np.array([c[1] for c in coords])
        dist_matrix = np.zeros((n, n))
        for i in range(n):
            for j in range(n):
                if i == j:
                    dist_matrix[i, j] = 0.0
                else:
                    dist_matrix[i, j] = self.calculate_haversine_distance(
                        lats[i], lons[i], lats[j], lons[j]
                    )
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
    # Smoke test contra el dataset por defecto del repo.
    here = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(here, os.pardir))

    processor = DataProcessor()
    orders = processor.load_orders(os.path.join(repo_root, "data", "pedidos_ejemplo.csv"))
    vehicles = processor.load_vehicles(os.path.join(repo_root, "data", "vehiculos_config.json"))

    print(f"Pedidos cargados: {len(orders)} | Vehículos: {len(vehicles)}")

    dep_lat = vehicles.loc[0, "deposito_lat"]
    dep_lon = vehicles.loc[0, "deposito_lon"]
    dist, times = processor.build_distance_matrix(dep_lat, dep_lon, orders)
    print(f"Matriz {dist.shape} | depot->P1: {dist[0, 1]:.2f} km, {times[0, 1]:.1f} min")
