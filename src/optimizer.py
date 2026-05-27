import numpy as np
import pandas as pd
from abc import ABC, abstractmethod
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp

# Factores de CO2 (g/km).
# Diésel: media medida en furgonetas N1 de reparto cargadas (no turismo ligero).
# Eléctrico: derivado del mix eléctrico español 2024 (~150 g CO2/kWh) y consumo
# típico de furgoneta eléctrica (~25 kWh/100 km) = 37.5 g/km. Redondeado a 40.
# Cero NO es realista: ignora la huella del mix de generación.
CO2_DIESEL_VAN_G_PER_KM = 250.0
CO2_ELECTRIC_VAN_G_PER_KM = 40.0


class RouteOptimizer(ABC):
    """Interfaz Strategy de los resolvedores. Output unificado documentado en
    docs/BACKEND_INTEGRATION.md."""

    @abstractmethod
    def optimize(self, orders_df, vehicles_df, dist_matrix, time_matrix):
        pass


class HeuristicRouteOptimizer(RouteOptimizer):
    """Resolvedor heurístico: K-Means geográfico + Vecino Más Cercano ponderado por prioridad.

    Útil como fallback rápido y como baseline algorítmico (no humano — para baseline
    humano ver metrics.MetricsEngine.simulate_manual_baseline).
    """

    def __init__(self, service_time_min=10.0,
                 co2_g_per_km_diesel=CO2_DIESEL_VAN_G_PER_KM,
                 co2_g_per_km_electric=CO2_ELECTRIC_VAN_G_PER_KM,
                 random_seed=42):
        self.service_time_min = service_time_min
        self.co2_g_per_km_diesel = co2_g_per_km_diesel
        self.co2_g_per_km_electric = co2_g_per_km_electric
        self.random_seed = random_seed

    def _geocode_clustering(self, orders_df, num_clusters):
        """
        Heurística de Clustering K-Means en pure-python para agrupar pedidos espacialmente.
        Agrupa los pedidos en zonas para asignarlos eficientemente a cada vehículo.
        """
        if len(orders_df) == 0:
            return []
            
        # Extraer lat y lon
        coords = orders_df[['lat', 'lon']].values
        n_samples = len(coords)
        
        # Si hay menos muestras que clusters, ajustar
        k = min(num_clusters, n_samples)
        
        # Semilla fija para reproducibilidad en evaluación. Pásala None para no fijarla.
        if self.random_seed is not None:
            np.random.seed(self.random_seed)
        indices = np.random.choice(n_samples, k, replace=False)
        centroids = coords[indices]
        
        labels = np.zeros(n_samples, dtype=int)
        
        # Iteraciones K-Means
        for _ in range(10):
            # Asignar cada punto al centroide más cercano (distancia Euclidiana en grados)
            for i in range(n_samples):
                distances = np.sum((coords[i] - centroids)**2, axis=1)
                labels[i] = np.argmin(distances)
                
            # Recalcular centroides
            new_centroids = np.array([coords[labels == j].mean(axis=0) if len(coords[labels == j]) > 0 else centroids[j] for j in range(k)])
            if np.allclose(centroids, new_centroids):
                break
            centroids = new_centroids
            
        return labels

    def optimize(self, orders_df, vehicles_df, dist_matrix, time_matrix):
        """
        Optimización secuencial usando clustering geográfico y vecindad adaptativa por prioridad.
        """
        num_vehicles = len(vehicles_df)
        num_orders = len(orders_df)
        
        if num_orders == 0:
            return {
                'tipo_planificacion': 'Heurística Propia (Clustering + VMC Ponderado)',
                'vehiculos_activos': 0, 'distancia_total_km': 0.0, 'tiempo_total_horas': 0.0,
                'coste_total_euros': 0.0, 'co2_total_kg': 0.0, 'pedidos_retrasados': 0,
                'incidentes_sobrecarga': 0, 'rutas': [], 'used_fallback': False,
            }

        # 1. Agrupar pedidos geográficamente
        # Cada vehículo atiende a un cluster
        cluster_labels = self._geocode_clustering(orders_df, num_vehicles)
        
        # Asignar pedidos a cada vehículo según su cluster preferente
        assigned_to_vehicle = [[] for _ in range(num_vehicles)]
        for i, label in enumerate(cluster_labels):
            # Asignar orden i al vehículo que corresponda a su cluster
            v_idx = label % num_vehicles
            assigned_to_vehicle[v_idx].append(i)
            
        routes_summary = []
        total_km = 0.0
        total_time_min = 0.0
        total_delayed = 0
        total_overloaded_incidents = 0
        
        # 2. Ruteo interno para cada vehículo (Vecino Más Cercano Ponderado)
        for v_idx in range(num_vehicles):
            vehicle = vehicles_df.iloc[v_idx]
            order_indices = assigned_to_vehicle[v_idx]
            
            if not order_indices:
                continue
                
            unvisited = set(order_indices)
            route_stops = []
            
            current_time = vehicle['minutos_inicio']
            current_node = 0 # Depósito
            route_distance = 0.0
            route_time_travel = 0.0
            current_load = 0.0
            
            stop_details = []
            is_overloaded = False
            
            while unvisited:
                best_candidate = None
                best_score = float('inf')
                
                # Evaluar todos los candidatos no visitados.
                # Score = distancia / prioridad^1.5 + penalización por retraso.
                # Prioridad ALTA = número ALTO (3 = urgente, 1 = no urgente) → eleva
                # el denominador y reduce el score, favoreciendo el candidato.
                for cand in unvisited:
                    order_row = orders_df.iloc[cand]
                    cand_node = cand + 1

                    dist = dist_matrix[current_node, cand_node]
                    time_needed = time_matrix[current_node, cand_node]
                    eta = current_time + time_needed
                    delay = max(0.0, eta - order_row['minutos_fin'])

                    priority_factor = float(order_row['prioridad']) ** 1.5
                    score = (dist / priority_factor) + (delay * 5.0)

                    if score < best_score:
                        best_score = score
                        best_candidate = cand

                cand_order_row = orders_df.iloc[best_candidate]
                cand_node = best_candidate + 1
                
                # Viajar al mejor candidato
                dist_to_cand = dist_matrix[current_node, cand_node]
                time_to_cand = time_matrix[current_node, cand_node]
                
                route_distance += dist_to_cand
                route_time_travel += time_to_cand
                
                # Actualizar tiempo (esperar si se llega antes del inicio de ventana)
                current_time += time_to_cand
                if current_time < cand_order_row['minutos_inicio']:
                    current_time = cand_order_row['minutos_inicio'] # Esperar
                    
                arrival_time_str = self._minutes_to_time_str(current_time)
                
                # Comprobar retraso real
                is_delayed = current_time > cand_order_row['minutos_fin']
                if is_delayed:
                    total_delayed += 1
                    
                # Carga
                current_load += cand_order_row['peso_kg']
                if current_load > vehicle['capacidad_kg']:
                    is_overloaded = True
                    
                stop_details.append({
                    'id_pedido': cand_order_row['id_pedido'],
                    'cliente': cand_order_row['cliente'],
                    'prioridad': int(cand_order_row['prioridad']),
                    'peso_kg': float(cand_order_row['peso_kg']),
                    'hora_llegada': arrival_time_str,
                    # bool() necesario: comparaciones con pandas devuelven numpy.bool_
                    # que rompe json.dumps cuando ai_assistant lo serializa al LLM.
                    'retrasado': bool(is_delayed),
                    'ventana': f"{cand_order_row['franja_inicio']}-{cand_order_row['franja_fin']}"
                })
                
                # Añadir tiempo de servicio
                current_time += self.service_time_min
                current_node = cand_node
                
                # Sacar de la lista de pendientes
                unvisited.remove(best_candidate)
                route_stops.append(best_candidate)
                
            # Regreso al depósito
            dist_to_depot = dist_matrix[current_node, 0]
            time_to_depot = time_matrix[current_node, 0]
            
            route_distance += dist_to_depot
            route_time_travel += time_to_depot
            current_time += time_to_depot
            
            total_km += route_distance
            total_time_min += (current_time - vehicle['minutos_inicio'])
            
            if is_overloaded:
                total_overloaded_incidents += 1
                
            cost = route_distance * vehicle['coste_por_km']
            co2_factor = self.co2_g_per_km_electric if 'Electr' in vehicle['nombre'] else self.co2_g_per_km_diesel
            co2_emissions_kg = (route_distance * co2_factor) / 1000.0
            
            routes_summary.append({
                'id_vehiculo': vehicle['id_vehiculo'],
                'nombre_vehiculo': vehicle['nombre'],
                'pedidos_entregados': len(route_stops),
                'distancia_km': route_distance,
                'tiempo_total_min': current_time - vehicle['minutos_inicio'],
                'tiempo_viaje_min': route_time_travel,
                'coste_euros': cost,
                'co2_emissions_kg': co2_emissions_kg,
                'sobrecargado': bool(is_overloaded),
                'carga_total_kg': current_load,
                'detalle_paradas': stop_details
            })
            
        return {
            'tipo_planificacion': 'Heurística Propia (Clustering + VMC Ponderado)',
            'vehiculos_activos': len(routes_summary),
            'distancia_total_km': total_km,
            'tiempo_total_horas': total_time_min / 60.0,
            'coste_total_euros': sum(r['coste_euros'] for r in routes_summary),
            'co2_total_kg': sum(r['co2_emissions_kg'] for r in routes_summary),
            'pedidos_retrasados': total_delayed,
            'incidentes_sobrecarga': total_overloaded_incidents,
            'rutas': routes_summary,
            'used_fallback': False,
        }

    def _minutes_to_time_str(self, minutes):
        minutes = int(minutes) % 1440
        return f"{minutes // 60:02d}:{minutes % 60:02d}"


class ORToolsRouteOptimizer(RouteOptimizer):
    """Resolvedor CVRPTW con Google OR-Tools (capacidades + ventanas horarias).

    Si OR-Tools no encuentra solución factible, cae a HeuristicRouteOptimizer y
    marca el resultado con ``used_fallback=True`` — el cliente DEBE comprobar
    esta flag antes de presentar el resultado como "optimizado".
    """

    def __init__(self, service_time_min=10.0,
                 co2_g_per_km_diesel=CO2_DIESEL_VAN_G_PER_KM,
                 co2_g_per_km_electric=CO2_ELECTRIC_VAN_G_PER_KM,
                 time_limit_seconds=10):
        self.service_time_min = service_time_min
        self.co2_g_per_km_diesel = co2_g_per_km_diesel
        self.co2_g_per_km_electric = co2_g_per_km_electric
        self.time_limit_seconds = time_limit_seconds

    def optimize(self, orders_df, vehicles_df, dist_matrix, time_matrix):
        """
        Ejecuta OR-Tools para resolver el problema de rutas capacitado con ventanas de tiempo.
        """
        num_vehicles = len(vehicles_df)
        num_nodes = len(dist_matrix)  # N pedidos + 1 depósito

        # Caso degenerado: sin pedidos no hay nada que resolver.
        if len(orders_df) == 0:
            return {
                'tipo_planificacion': 'Google OR-Tools (Optimizador Global CVRPTW)',
                'vehiculos_activos': 0, 'distancia_total_km': 0.0, 'tiempo_total_horas': 0.0,
                'coste_total_euros': 0.0, 'co2_total_kg': 0.0, 'pedidos_retrasados': 0,
                'incidentes_sobrecarga': 0, 'rutas': [], 'used_fallback': False,
            }

        # 1. Estructura de Datos para OR-Tools
        data = {}
        # Convertir distancias y tiempos a enteros (OR-Tools trabaja con enteros)
        # Multiplicamos por 100 para no perder precisión decimal (e.g. 1.25 km -> 125)
        precision_factor = 100
        
        data['distance_matrix'] = (dist_matrix * precision_factor).astype(int).tolist()
        data['time_matrix'] = (time_matrix * precision_factor).astype(int).tolist()
        
        # Demandas (peso_kg)
        demands = [0] + orders_df['peso_kg'].astype(int).tolist()
        data['demands'] = demands
        
        # Capacidades de vehículos
        data['vehicle_capacities'] = vehicles_df['capacidad_kg'].astype(int).tolist()
        
        # Ventanas horarias en minutos escaladas por precision_factor
        time_windows = []
        # Depósito (salida y llegada de todos los vehículos)
        # Usamos la ventana más amplia del depósito de los vehículos
        depot_start = int(vehicles_df['minutos_inicio'].min() * precision_factor)
        depot_end = int(vehicles_df['minutos_fin'].max() * precision_factor)
        time_windows.append((depot_start, depot_end))
        
        for idx, row in orders_df.iterrows():
            time_windows.append((
                int(row['minutos_inicio'] * precision_factor),
                int(row['minutos_fin'] * precision_factor)
            ))
        data['time_windows'] = time_windows
        data['num_vehicles'] = num_vehicles
        data['depot'] = 0
        
        # Tiempo de servicio en minutos escalados
        scaled_service_time = int(self.service_time_min * precision_factor)
        
        # 2. Inicializar Modelo de OR-Tools
        manager = pywrapcp.RoutingIndexManager(num_nodes, data['num_vehicles'], data['depot'])
        routing = pywrapcp.RoutingModel(manager)
        
        # 3. Callback de Distancia (Coste de Tránsito)
        def distance_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return data['distance_matrix'][from_node][to_node]
            
        transit_callback_index = routing.RegisterTransitCallback(distance_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)
        
        # 4. Dimensión de Capacidad
        def demand_callback(from_index):
            from_node = manager.IndexToNode(from_index)
            return data['demands'][from_node]
            
        demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
        routing.AddDimensionWithVehicleCapacity(
            demand_callback_index,
            0,  # null capacity slack
            data['vehicle_capacities'],  # vehicle maximum capacities
            True,  # start cumul to zero
            'Capacity'
        )
        
        # 5. Callback de Tiempo (Tránsito + Servicio)
        def time_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            travel_time = data['time_matrix'][from_node][to_node]
            # Si salimos del depósito, no sumamos tiempo de servicio previo
            service_time = scaled_service_time if from_node != 0 else 0
            return travel_time + service_time
            
        time_callback_index = routing.RegisterTransitCallback(time_callback)
        
        # Añadir Dimensión de Tiempo para las ventanas horarias
        # Permite tiempo de espera (slack) si llegamos antes del inicio
        routing.AddDimension(
            time_callback_index,
            int(1440 * precision_factor), # permitir slack máximo del día entero
            int(1440 * precision_factor), # tiempo máximo de ruta
            False, # no forzar a iniciar en cero obligatoriamente
            'Time'
        )
        time_dimension = routing.GetDimensionOrDie('Time')
        
        # 6. Añadir restricciones de Ventanas Horarias
        for node_idx, window in enumerate(data['time_windows']):
            index = manager.NodeToIndex(node_idx)
            time_dimension.CumulVar(index).SetRange(window[0], window[1])
            
        # Añadir ventana horaria de inicio específica para cada vehículo
        for vehicle_id in range(data['num_vehicles']):
            vehicle_row = vehicles_df.iloc[vehicle_id]
            start_index = routing.Start(vehicle_id)
            end_index = routing.End(vehicle_id)
            
            time_dimension.CumulVar(start_index).SetRange(
                int(vehicle_row['minutos_inicio'] * precision_factor),
                int(vehicle_row['minutos_fin'] * precision_factor)
            )
            time_dimension.CumulVar(end_index).SetRange(
                int(vehicle_row['minutos_inicio'] * precision_factor),
                int(vehicle_row['minutos_fin'] * precision_factor)
            )
            
        # 7. Parámetros de Búsqueda
        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        # Heurística inicial
        search_parameters.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        )
        # Búsqueda local metaheurística para optimizar
        search_parameters.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        )
        search_parameters.time_limit.seconds = self.time_limit_seconds
        
        # 8. Resolver
        solution = routing.SolveWithParameters(search_parameters)
        
        # 9. Procesar y unificar salida
        if not solution:
            # OR-Tools no encontró solución factible (ventanas imposibles, capacidad
            # insuficiente, etc.). Caemos a la heurística para no devolver vacío, pero
            # MARCAMOS el resultado con used_fallback=True para que el cliente sepa
            # que NO es un resultado del solver industrial.
            print(
                "[OR-Tools] Sin solución factible — fallback a heurística. "
                "Revisar ventanas horarias y capacidades del dataset."
            )
            fallback = HeuristicRouteOptimizer(
                self.service_time_min, self.co2_g_per_km_diesel, self.co2_g_per_km_electric
            )
            result = fallback.optimize(orders_df, vehicles_df, dist_matrix, time_matrix)
            result['used_fallback'] = True
            result['fallback_reason'] = "ortools_infeasible"
            # Mantenemos tipo_planificacion del fallback para que sea evidente en logs.
            return result
            
        routes_summary = []
        total_km = 0.0
        total_time_min = 0.0
        total_delayed = 0
        total_overloaded_incidents = 0
        
        for vehicle_id in range(data['num_vehicles']):
            vehicle_row = vehicles_df.iloc[vehicle_id]
            index = routing.Start(vehicle_id)
            
            route_stops = []
            stop_details = []
            route_distance = 0.0
            current_load = 0.0
            
            # Recorrer nodos de la ruta del vehículo
            while not routing.IsEnd(index):
                node_idx = manager.IndexToNode(index)
                
                if node_idx != 0: # Saltar el depósito en el detalle de paradas
                    order_row = orders_df.iloc[node_idx - 1]
                    
                    time_var = time_dimension.CumulVar(index)
                    # Convertir de entero escalado de vuelta a minutos reales
                    arrival_time_min = solution.Value(time_var) / precision_factor
                    
                    arrival_time_str = self._minutes_to_time_str(arrival_time_min)
                    is_delayed = arrival_time_min > order_row['minutos_fin']
                    if is_delayed:
                        total_delayed += 1
                        
                    current_load += order_row['peso_kg']
                    
                    stop_details.append({
                        'id_pedido': order_row['id_pedido'],
                        'cliente': order_row['cliente'],
                        'prioridad': int(order_row['prioridad']),
                        'peso_kg': float(order_row['peso_kg']),
                        'hora_llegada': arrival_time_str,
                        'retrasado': bool(is_delayed),
                        'ventana': f"{order_row['franja_inicio']}-{order_row['franja_fin']}"
                    })
                    route_stops.append(node_idx - 1)
                    
                previous_index = index
                index = solution.Value(routing.NextVar(index))
                
                # Sumar distancia acumulada entre nodos
                route_distance += routing.GetArcCostForVehicle(previous_index, index, vehicle_id) / precision_factor
                
            # Fin de ruta (regreso al depósito)
            end_time_var = time_dimension.CumulVar(index)
            end_time_min = solution.Value(end_time_var) / precision_factor
            
            if route_stops: # Registrar furgoneta solo si hizo paradas
                is_overloaded = current_load > vehicle_row['capacidad_kg']
                if is_overloaded:
                    total_overloaded_incidents += 1
                    
                cost = route_distance * vehicle_row['coste_por_km']
                co2_factor = self.co2_g_per_km_electric if 'Electr' in vehicle_row['nombre'] else self.co2_g_per_km_diesel
                co2_emissions_kg = (route_distance * co2_factor) / 1000.0
                
                routes_summary.append({
                    'id_vehiculo': vehicle_row['id_vehiculo'],
                    'nombre_vehiculo': vehicle_row['nombre'],
                    'pedidos_entregados': len(route_stops),
                    'distancia_km': route_distance,
                    'tiempo_total_min': end_time_min - vehicle_row['minutos_inicio'],
                    # Tiempo de viaje estimado = tiempo total menos tiempos de servicio en paradas
                    'tiempo_viaje_min': max(0.0, (end_time_min - vehicle_row['minutos_inicio']) - (len(route_stops) * self.service_time_min)),
                    'coste_euros': cost,
                    'co2_emissions_kg': co2_emissions_kg,
                    'sobrecargado': bool(is_overloaded),
                    'carga_total_kg': current_load,
                    'detalle_paradas': stop_details
                })
                
                total_km += route_distance
                total_time_min += (end_time_min - vehicle_row['minutos_inicio'])
                
        return {
            'tipo_planificacion': 'Google OR-Tools (Optimizador Global CVRPTW)',
            'vehiculos_activos': len(routes_summary),
            'distancia_total_km': total_km,
            'tiempo_total_horas': total_time_min / 60.0,
            'coste_total_euros': sum(r['coste_euros'] for r in routes_summary),
            'co2_total_kg': sum(r['co2_emissions_kg'] for r in routes_summary),
            'pedidos_retrasados': total_delayed,
            'incidentes_sobrecarga': total_overloaded_incidents,
            'rutas': routes_summary,
            'used_fallback': False,
        }

    def _minutes_to_time_str(self, minutes):
        minutes = int(minutes) % 1440
        return f"{minutes // 60:02d}:{minutes % 60:02d}"


class RouteOptimizerFactory:
    """Factory para instanciar el resolvedor deseado."""

    @staticmethod
    def get_optimizer(mode="ortools", service_time_min=10.0):
        if mode == "ortools":
            return ORToolsRouteOptimizer(service_time_min=service_time_min)
        elif mode == "heuristic":
            return HeuristicRouteOptimizer(service_time_min=service_time_min)
        else:
            raise ValueError(f"Modo de optimización no soportado: {mode}")
