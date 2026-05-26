import numpy as np
import pandas as pd

class MetricsEngine:
    """
    Clase para calcular métricas operativas, ecológicas y financieras.
    Permite generar un baseline manual para comparar el impacto del algoritmo optimizado.
    """
    def __init__(self, co2_g_per_km_diesel=220.0, co2_g_per_km_electric=0.0):
        self.co2_g_per_km_diesel = co2_g_per_km_diesel # Emisiones furgoneta tradicional (g/km)
        self.co2_g_per_km_electric = co2_g_per_km_electric
        self.service_time_min = 10.0 # Tiempo fijo por parada en minutos

    def simulate_manual_baseline(self, orders_df, vehicles_df, dist_matrix, time_matrix):
        """
        Simula un reparto manual avanzado que sigue tres reglas heurísticas humanas:
        1. Pedidos urgentes primero (prioridad 3 > 2 > 1) e intentar respetar ventanas horarias.
        2. Lógica del Vecino Más Cercano (Nearest Neighbor) desde la posición actual.
        3. Pedidos más pesados se entregan antes para vaciar carga rápido.
        """
        num_vehicles = len(vehicles_df)
        num_orders = len(orders_df)
        
        # Asignar pedidos equitativamente en bloques según el orden del CSV
        assigned_orders = [[] for _ in range(num_vehicles)]
        for idx, row in orders_df.iterrows():
            v_idx = idx % num_vehicles
            assigned_orders[v_idx].append(idx) # Guardamos el índice original
            
        routes_summary = []
        total_km = 0.0
        total_time_min = 0.0
        total_delayed = 0
        total_overloaded_incidents = 0
        
        for v_idx in range(num_vehicles):
            vehicle = vehicles_df.iloc[v_idx]
            v_order_indices = assigned_orders[v_idx]
            
            if not v_order_indices:
                continue
                
            unvisited = set(v_order_indices)
            route_stops = []
            
            current_time = vehicle['minutos_inicio']
            current_node = 0 # Depósito
            route_distance = 0.0
            route_time_travel = 0.0
            current_load = 0.0
            
            stop_details = []
            
            # Peso máximo del dataset para escala de penalización (aproximadamente 130 kg)
            max_dataset_weight = 150.0
            
            # Recorrer de forma secuencial mediante la heurística del conductor humano
            while unvisited:
                best_cand = None
                best_score = float('inf')
                
                for cand in unvisited:
                    order_row = orders_df.iloc[cand]
                    cand_node = cand + 1
                    
                    dist = dist_matrix[current_node, cand_node]
                    
                    # Regra 1: Los pedidos más urgentes primero (prioridad 3 > 2 > 1)
                    # Convertimos prioridad a coste penalizando la baja prioridad
                    prioridad_cost = (3 - order_row['prioridad']) * 40.0
                    
                    # Ventanas horarias: Priorizar las que vencen antes
                    ventana_cost = order_row['minutos_fin'] * 0.1
                    
                    # Regra 2: Lógica del vecino más cercano
                    dist_cost = dist * 2.0
                    
                    # Regra 3: Los pedidos más pesados se entregan antes (penalizar los más ligeros)
                    peso_cost = (max_dataset_weight - order_row['peso_kg']) * 0.2
                    
                    score = prioridad_cost + ventana_cost + dist_cost + peso_cost
                    
                    if score < best_score:
                        best_score = score
                        best_cand = cand
                        
                # Seleccionar el mejor candidato según la heurística humana
                cand_order_row = orders_df.iloc[best_cand]
                cand_node = best_cand + 1
                
                # Viajar a la parada
                dist_to_cand = dist_matrix[current_node, cand_node]
                time_to_cand = time_matrix[current_node, cand_node]
                
                route_distance += dist_to_cand
                route_time_travel += time_to_cand
                
                # Llegada y tiempo de espera si llega antes
                current_time += time_to_cand
                if current_time < cand_order_row['minutos_inicio']:
                    current_time = cand_order_row['minutos_inicio']
                    
                arrival_time_str = self._minutes_to_time_str(current_time)
                
                # Comprobar si llega con retraso
                is_delayed = current_time > cand_order_row['minutos_fin']
                if is_delayed:
                    total_delayed += 1
                    
                current_load += cand_order_row['peso_kg']
                
                stop_details.append({
                    'id_pedido': cand_order_row['id_pedido'],
                    'cliente': cand_order_row['cliente'],
                    'prioridad': int(cand_order_row['prioridad']),
                    'peso_kg': float(cand_order_row['peso_kg']),
                    'hora_llegada': arrival_time_str,
                    'retrasado': is_delayed,
                    'ventana': f"{cand_order_row['franja_inicio']}-{cand_order_row['franja_fin']}"
                })
                
                current_time += self.service_time_min
                current_node = cand_node
                unvisited.remove(best_cand)
                route_stops.append(best_cand)
                
            # Regreso al depósito
            dist_to_depot = dist_matrix[current_node, 0]
            time_to_depot = time_matrix[current_node, 0]
            
            route_distance += dist_to_depot
            route_time_travel += time_to_depot
            current_time += time_to_depot
            
            total_km += route_distance
            total_time_min += (current_time - vehicle['minutos_inicio'])
            
            is_overloaded = current_load > vehicle['capacidad_kg']
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
                'sobrecargado': is_overloaded,
                'carga_total_kg': current_load,
                'detalle_paradas': stop_details
            })
            
        return {
            'tipo_planificacion': 'Manual Heurístico (Reglas de Conductor)',
            'vehiculos_activos': len(routes_summary),
            'distancia_total_km': total_km,
            'tiempo_total_horas': total_time_min / 60.0,
            'coste_total_euros': sum(r['coste_euros'] for r in routes_summary),
            'co2_total_kg': sum(r['co2_emissions_kg'] for r in routes_summary),
            'pedidos_retrasados': total_delayed,
            'incidentes_sobrecarga': total_overloaded_incidents,
            'rutas': routes_summary
        }

    def compare_plans(self, manual_res, optimized_res):
        """
        Compara el plan manual con el plan optimizado y genera el cuadro de ahorros.
        """
        km_saving = manual_res['distancia_total_km'] - optimized_res['distancia_total_km']
        km_saving_pct = (km_saving / manual_res['distancia_total_km']) * 100 if manual_res['distancia_total_km'] > 0 else 0
        
        cost_saving = manual_res['coste_total_euros'] - optimized_res['coste_total_euros']
        cost_saving_pct = (cost_saving / manual_res['coste_total_euros']) * 100 if manual_res['coste_total_euros'] > 0 else 0
        
        co2_saving = manual_res['co2_total_kg'] - optimized_res['co2_total_kg']
        co2_saving_pct = (co2_saving / manual_res['co2_total_kg']) * 100 if manual_res['co2_total_kg'] > 0 else 0
        
        retrasos_evitados = manual_res['pedidos_retrasados'] - optimized_res['pedidos_retrasados']
        sobrecargas_evitadas = manual_res['incidentes_sobrecarga'] - optimized_res['incidentes_sobrecarga']
        
        return {
            'distancia_manual_km': manual_res['distancia_total_km'],
            'distancia_optimizada_km': optimized_res['distancia_total_km'],
            'ahorro_distancia_km': km_saving,
            'ahorro_distancia_pct': km_saving_pct,
            
            'coste_manual_euros': manual_res['coste_total_euros'],
            'coste_optimizado_euros': optimized_res['coste_total_euros'],
            'ahorro_coste_euros': cost_saving,
            'ahorro_coste_pct': cost_saving_pct,
            
            'co2_manual_kg': manual_res['co2_total_kg'],
            'co2_optimizado_kg': optimized_res['co2_total_kg'],
            'ahorro_co2_kg': co2_saving,
            'ahorro_co2_pct': co2_saving_pct,
            
            'retrasos_manual': manual_res['pedidos_retrasados'],
            'retrasos_optimizado': optimized_res['pedidos_retrasados'],
            'retrasos_evitados': retrasos_evitados,
            
            'sobrecargas_manual': manual_res['incidentes_sobrecarga'],
            'sobrecargas_optimizado': optimized_res['incidentes_sobrecarga'],
            'sobrecargas_evitadas': sobrecargas_evitadas
        }

    def _minutes_to_time_str(self, minutes_since_midnight):
        """
        Convierte minutos totales a cadena de formato HH:MM.
        """
        minutes_since_midnight = int(minutes_since_midnight) % 1440
        hours = minutes_since_midnight // 60
        minutes = minutes_since_midnight % 60
        return f"{hours:02d}:{minutes:02d}"
