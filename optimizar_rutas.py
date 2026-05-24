import pandas as pd
import numpy as np
import math
import json
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp

# 1. Función matemática para calcular distancia real (Haversine)
def calcular_distancia_metros(lat1, lon1, lat2, lon2):
    R = 6371000  # Radio de la Tierra en metros
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi/2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2.0)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return int(R * c)  # OR-Tools exige enteros

# 2. Cargar datos y preparar el modelo
def crear_modelo_datos():
    df = pd.read_csv('pedidos_elche_alicante_mock.csv')
    df_veh = pd.read_csv('vehiculos_mock.csv')

    # Creamos la matriz de distancias NxN
    num_nodos = len(df)
    matriz_distancias = np.zeros((num_nodos, num_nodos), dtype=int)
    for i in range(num_nodos):
        for j in range(num_nodos):
            if i != j:
                matriz_distancias[i][j] = calcular_distancia_metros(
                    df.loc[i, 'lat'], df.loc[i, 'lon'],
                    df.loc[j, 'lat'], df.loc[j, 'lon']
                )

    data = {}
    data['distance_matrix'] = matriz_distancias.tolist()
    data['demands'] = df['peso'].tolist()
    # Convertimos las horas a minutos (ej: 9h -> 540 min)
    data['time_windows'] = [(int(row['franja_inicio'] * 60), int(row['franja_fin'] * 60)) for _, row in df.iterrows()]
    # Leemos la flota del CSV de vehículos: así ambos CSV quedan conectados
    data['num_vehicles'] = len(df_veh)
    data['vehicle_capacities'] = df_veh['capacidad_kg'].astype(int).tolist()
    data['depot'] = 0  # El índice 0 es nuestro almacén central

    return data, df

# 3. La función principal de OR-Tools
def main():
    # Instanciamos los datos
    data, df = crear_modelo_datos()

    # Gestor de rutas: (número total de nodos, número de vehículos, nodo de salida)
    manager = pywrapcp.RoutingIndexManager(len(data['distance_matrix']), data['num_vehicles'], data['depot'])
    routing = pywrapcp.RoutingModel(manager)

    # --- CALLBACK DE DISTANCIA ---
    def distance_callback(from_index, to_index):
        # Convierte los índices internos de OR-Tools a los índices de nuestra matriz
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return data['distance_matrix'][from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # --- RESTRICCIÓN DE CAPACIDAD (PESO) ---
    def demand_callback(from_index):
        from_node = manager.IndexToNode(from_index)
        return data['demands'][from_node]

    demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index,
        0,  # null capacity slack
        data['vehicle_capacities'],  # array de capacidades de los vehículos
        True,  # empezar en cero
        'Capacity'
    )

    # --- EQUILIBRADO DE CARGA ENTRE FURGONETAS ---
    # SetGlobalSpanCostCoefficient penaliza la furgoneta MÁS cargada.
    # Como el peso total es fijo (425 kg), minimizar el máximo empuja
    # al solver a repartir la carga de forma más pareja entre conductores.
    # Coeficiente moderado (200): equilibra el reparto sin disparar los km
    # (un coeficiente alto, p.ej. 1000, iguala la carga pero suma ~16% de
    # distancia). Es el punto medio entre justicia laboral y eficiencia.
    capacity_dimension = routing.GetDimensionOrDie('Capacity')
    capacity_dimension.SetGlobalSpanCostCoefficient(200)

    # --- RESTRICCIÓN DE TIEMPO (VENTANAS HORARIAS) ---
    # Asumimos que la furgoneta va a 40km/h (aprox 666 metros/minuto)
    def time_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        distancia = data['distance_matrix'][from_node][to_node]
        tiempo_viaje = int(distancia / 666)
        tiempo_servicio = 10  # Sumamos 10 minutos por cada entrega (aparcar, subir paquete)
        return tiempo_viaje + tiempo_servicio

    time_callback_index = routing.RegisterTransitCallback(time_callback)
    # El tiempo se mide en minutos desde medianoche (08:00 = 480, 21:00 = 1260).
    # El horizonte (1260) debe cubrir la franja más tardía del dataset.
    routing.AddDimension(
        time_callback_index,
        1260,  # Holgura de espera: el vehículo puede esperar a que abra una franja
        1260,  # Horizonte total: hasta las 21:00 (1260 min)
        False,  # NO empezar el acumulador en cero: arranca en la hora del almacén
        'Time'
    )
    time_dimension = routing.GetDimensionOrDie('Time')
    # Añadir los rangos de tiempo de cada cliente
    for location_idx, time_window in enumerate(data['time_windows']):
        if location_idx == data['depot']:
            continue
        index = manager.NodeToIndex(location_idx)
        time_dimension.CumulVar(index).SetRange(time_window[0], time_window[1])

    # Fijamos la hora de salida/regreso al horario del almacén (08:00-20:00)
    depot_tw = data['time_windows'][data['depot']]
    for vehicle_id in range(data['num_vehicles']):
        index = routing.Start(vehicle_id)
        time_dimension.CumulVar(index).SetRange(depot_tw[0], depot_tw[1])

    # Pedimos al solver que minimice también el tiempo (rutas más compactas)
    for vehicle_id in range(data['num_vehicles']):
        routing.AddVariableMinimizedByFinalizer(time_dimension.CumulVar(routing.Start(vehicle_id)))
        routing.AddVariableMinimizedByFinalizer(time_dimension.CumulVar(routing.End(vehicle_id)))

    # --- CONFIGURACIÓN DE IA / HEURÍSTICA ---
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    # Fase 1: Enrutamiento inicial (Estrategia circular/pétalos)
    search_parameters.first_solution_strategy = (routing_enums_pb2.FirstSolutionStrategy.SAVINGS)
    # Fase 2: Optimización profunda (Escapar de mínimos locales)
    search_parameters.local_search_metaheuristic = (routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH)
    # Límite por NÚMERO DE SOLUCIONES, no por reloj.
    # time_limit corta la búsqueda según la carga del equipo -> resultado
    # distinto en cada ejecución. solution_limit explora siempre la misma
    # secuencia de soluciones -> demo 100% reproducible (junto al seed 42).
    search_parameters.solution_limit = 100

    # --- RESOLVER Y MOSTRAR RESULTADOS ---
    print("Optimizando rutas...")
    solution = routing.SolveWithParameters(search_parameters)

    if solution:
        paradas, resumen = extraer_solucion(data, manager, routing, solution, df)
        imprimir_solucion(resumen)
        guardar_resultados(paradas, resumen)
    else:
        print("El algoritmo no ha podido encontrar una solución que cumpla todas las restricciones.")

def extraer_solucion(data, manager, routing, solution, df):
    """Recorre la solución de OR-Tools y la vuelca en estructuras de datos
    reutilizables: una lista plana de paradas (tabla/mapa) y un resumen
    anidado con métricas (explicación IA)."""
    time_dimension = routing.GetDimensionOrDie('Time')
    paradas = []   # una fila por parada -> formato tabla / CSV
    rutas = []     # resumen por vehículo -> anidado para JSON / IA
    total_distance = 0
    total_load = 0

    for vehicle_id in range(data['num_vehicles']):
        index = routing.Start(vehicle_id)
        route_distance = 0
        route_load = 0
        orden = 0
        paradas_ruta = []

        while True:
            node_index = manager.IndexToNode(index)
            route_load += data['demands'][node_index]
            min_llegada = solution.Min(time_dimension.CumulVar(index))
            fila = {
                'vehiculo': vehicle_id + 1,
                'orden': orden,
                'id_pedido': int(df.loc[node_index, 'id_pedido']),
                'cliente': str(df.loc[node_index, 'cliente']),
                'lat': float(df.loc[node_index, 'lat']),
                'lon': float(df.loc[node_index, 'lon']),
                'prioridad': str(df.loc[node_index, 'prioridad']),
                'peso': int(df.loc[node_index, 'peso']),
                'hora_llegada': f"{min_llegada // 60:02d}:{min_llegada % 60:02d}",
                'minuto_llegada': int(min_llegada),
                'carga_acumulada': int(route_load),
                'es_deposito': bool(node_index == data['depot']),
            }
            paradas.append(fila)
            paradas_ruta.append(fila)
            orden += 1

            if routing.IsEnd(index):
                break
            previous_index = index
            index = solution.Value(routing.NextVar(index))
            # GetArcCostForVehicle devuelve la distancia pura (el coste de
            # equilibrado se suma al objetivo, no a los arcos).
            route_distance += routing.GetArcCostForVehicle(previous_index, index, vehicle_id)

        rutas.append({
            'vehiculo': vehicle_id + 1,
            'num_paradas': sum(1 for p in paradas_ruta if not p['es_deposito']),
            'distancia_km': round(route_distance / 1000, 2),
            'carga_kg': int(route_load),
            'hora_salida': paradas_ruta[0]['hora_llegada'],
            'hora_regreso': paradas_ruta[-1]['hora_llegada'],
            'paradas': paradas_ruta,
        })
        total_distance += route_distance
        total_load += route_load

    cargas = [r['carga_kg'] for r in rutas]
    resumen = {
        'num_vehiculos': data['num_vehicles'],
        'num_pedidos': len(df) - 1,
        'distancia_total_km': round(total_distance / 1000, 2),
        'carga_total_kg': int(total_load),
        'desequilibrio_carga_kg': max(cargas) - min(cargas),
        'rutas': rutas,
    }
    return paradas, resumen

def imprimir_solucion(resumen):
    print("\n--- RESULTADO DE LA OPTIMIZACIÓN ---")
    for ruta in resumen['rutas']:
        print(f"Ruta para Furgoneta {ruta['vehiculo']}:")
        for p in ruta['paradas']:
            print(f"  [{p['cliente']}] (Hora: {p['hora_llegada']}, Carga: {p['carga_acumulada']}kg)")
        print(f"  Distancia de la ruta: {ruta['distancia_km']:.2f} km | Carga: {ruta['carga_kg']} kg\n")
    print(f"Total de kilómetros recorridos: {resumen['distancia_total_km']:.2f} km")
    print(f"Carga total entregada: {resumen['carga_total_kg']} kg")
    print(f"Desequilibrio de carga entre furgonetas: {resumen['desequilibrio_carga_kg']} kg")

def guardar_resultados(paradas, resumen):
    """Persiste la solución en dos formatos: CSV plano (interfaz/mapa) y
    JSON con métricas (explicación IA)."""
    pd.DataFrame(paradas).to_csv('rutas_optimizadas.csv', index=False, encoding='utf-8')
    with open('resumen_optimizacion.json', 'w', encoding='utf-8') as f:
        json.dump(resumen, f, ensure_ascii=False, indent=2)
    print("\nArchivos generados:")
    print("  - rutas_optimizadas.csv     (tabla de paradas para interfaz y mapa)")
    print("  - resumen_optimizacion.json (métricas y rutas para la explicación IA)")

if __name__ == '__main__':
    main()
