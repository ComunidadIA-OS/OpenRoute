"""Baseline manual y métricas comparativas.

`simulate_manual_baseline` modela cómo planifica una pyme **sin software de
optimización**: con Excel y sentido común. La heurística humana realista es:

1. **Agrupar por zona geográfica** (cada vehículo cubre un barrio).
2. **Dentro de cada zona, ordenar por urgencia de ventana horaria** (los pedidos
   cuya `franja_fin` vence antes se entregan primero).
3. Servir secuencialmente en ese orden, sin reoptimizar dinámicamente.

Esto es lo que de verdad hace un despachador con experiencia. NO es:
- "idx % num_vehicles" (round-robin por orden de aparición en el Excel), que era
  el baseline anterior y resultaba artificialmente malo. Ningún humano planifica
  ignorando la geografía.
- "vecino más cercano con score ponderado", que es lo que hace la heurística
  algorítmica de `optimizer.HeuristicRouteOptimizer` — eso ya es optimización.

Esta versión refleja honestamente la dificultad de batirla. Si el optimizador
ahorra X% vs ESTE baseline, ese X% es el valor real que el software aporta a la
pyme. Si el ahorro vs el baseline anterior era espectacular, era porque el
baseline era una caricatura.
"""

import numpy as np
import pandas as pd

from optimizer import CO2_DIESEL_VAN_G_PER_KM, CO2_ELECTRIC_VAN_G_PER_KM


class MetricsEngine:
    """Simulador del plan manual (baseline humano) y comparador con el plan optimizado."""

    def __init__(self, co2_g_per_km_diesel=CO2_DIESEL_VAN_G_PER_KM,
                 co2_g_per_km_electric=CO2_ELECTRIC_VAN_G_PER_KM):
        self.co2_g_per_km_diesel = co2_g_per_km_diesel
        self.co2_g_per_km_electric = co2_g_per_km_electric
        self.service_time_min = 10.0

    def _assign_by_zone(self, orders_df, vehicles_df):
        """Asigna pedidos a vehículos por proximidad geográfica al depósito del vehículo.

        Modela cómo el despachador con Excel mira el mapa y dice "esta zona la
        cubre Juan, esta otra María". Si todos los vehículos comparten depósito,
        agrupa por k-means simple en coordenadas; cada vehículo recoge su cluster.
        """
        n = len(orders_df)
        v = len(vehicles_df)
        assigned = [[] for _ in range(v)]
        if n == 0 or v == 0:
            return assigned

        coords = orders_df[['lat', 'lon']].values
        depots = vehicles_df[['deposito_lat', 'deposito_lon']].values

        # Si los depósitos son distintos, asignar cada pedido al depósito más cercano.
        # Si todos los depósitos coinciden, hacer k-means para crear k zonas.
        depots_unique = np.unique(depots, axis=0)
        if len(depots_unique) > 1:
            for i in range(n):
                dists = np.sum((depots - coords[i]) ** 2, axis=1)
                assigned[int(np.argmin(dists))].append(i)
            return assigned

        # K-means determinista para particionar la nube de pedidos en v zonas.
        np.random.seed(7)
        k = min(v, n)
        centroids = coords[np.random.choice(n, k, replace=False)]
        for _ in range(20):
            labels = np.array([
                int(np.argmin(np.sum((coords[i] - centroids) ** 2, axis=1))) for i in range(n)
            ])
            new_centroids = np.array([
                coords[labels == j].mean(axis=0) if np.any(labels == j) else centroids[j]
                for j in range(k)
            ])
            if np.allclose(centroids, new_centroids):
                break
            centroids = new_centroids
        for i in range(n):
            assigned[int(labels[i])].append(i)
        return assigned

    def simulate_manual_baseline(self, orders_df, vehicles_df, dist_matrix, time_matrix):
        """Plan manual realista: zona por vehículo + orden por urgencia de ventana."""

        num_vehicles = len(vehicles_df)
        if len(orders_df) == 0:
            return {
                'tipo_planificacion': 'Manual Heurístico (Zona + Urgencia de Ventana)',
                'vehiculos_activos': 0, 'distancia_total_km': 0.0, 'tiempo_total_horas': 0.0,
                'coste_total_euros': 0.0, 'co2_total_kg': 0.0, 'pedidos_retrasados': 0,
                'incidentes_sobrecarga': 0, 'rutas': [], 'used_fallback': False,
            }

        # 1. Asignación por zona (cómo el despachador mira el mapa).
        assigned = self._assign_by_zone(orders_df, vehicles_df)

        routes_summary = []
        total_km = 0.0
        total_time_min = 0.0
        total_delayed = 0
        total_overloaded_incidents = 0

        for v_idx in range(num_vehicles):
            vehicle = vehicles_df.iloc[v_idx]
            order_indices = assigned[v_idx]
            if not order_indices:
                continue

            # 2. Dentro de la zona, el humano ordena por urgencia: prioridad alta
            # primero (3 > 2 > 1), y dentro del mismo nivel por ventana que vence
            # antes. Es la heurística mental real, no un score matemático.
            order_indices_sorted = sorted(
                order_indices,
                key=lambda i: (
                    -int(orders_df.iloc[i]['prioridad']),
                    int(orders_df.iloc[i]['minutos_fin']),
                ),
            )

            current_time = vehicle['minutos_inicio']
            current_node = 0  # Depósito
            route_distance = 0.0
            route_time_travel = 0.0
            current_load = 0.0
            stop_details = []

            for idx in order_indices_sorted:
                order_row = orders_df.iloc[idx]
                node = idx + 1

                dist_to = dist_matrix[current_node, node]
                time_to = time_matrix[current_node, node]
                route_distance += dist_to
                route_time_travel += time_to
                current_time += time_to
                if current_time < order_row['minutos_inicio']:
                    current_time = order_row['minutos_inicio']  # Esperar a apertura

                is_delayed = current_time > order_row['minutos_fin']
                if is_delayed:
                    total_delayed += 1
                current_load += order_row['peso_kg']

                stop_details.append({
                    'id_pedido': order_row['id_pedido'],
                    'cliente': order_row['cliente'],
                    'prioridad': int(order_row['prioridad']),
                    'peso_kg': float(order_row['peso_kg']),
                    'hora_llegada': self._minutes_to_time_str(current_time),
                    'retrasado': bool(is_delayed),
                    'ventana': f"{order_row['franja_inicio']}-{order_row['franja_fin']}",
                })
                current_time += self.service_time_min
                current_node = node

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
            co2_factor = (
                self.co2_g_per_km_electric if 'Electr' in vehicle['nombre']
                else self.co2_g_per_km_diesel
            )
            co2_emissions_kg = (route_distance * co2_factor) / 1000.0

            routes_summary.append({
                'id_vehiculo': vehicle['id_vehiculo'],
                'nombre_vehiculo': vehicle['nombre'],
                'pedidos_entregados': len(order_indices_sorted),
                'distancia_km': route_distance,
                'tiempo_total_min': current_time - vehicle['minutos_inicio'],
                'tiempo_viaje_min': route_time_travel,
                'coste_euros': cost,
                'co2_emissions_kg': co2_emissions_kg,
                # bool() obligatorio: la comparación de dos pandas/numpy floats
                # devuelve numpy.bool_, y FastAPI jsonable_encoder lo intenta
                # tratar como dict iterable → "'numpy.bool' object is not iterable"
                # y 500 sin cuerpo. El optimizer.py ya lo hace; aquí faltaba.
                'sobrecargado': bool(is_overloaded),
                'carga_total_kg': current_load,
                'detalle_paradas': stop_details,
            })

        return {
            'tipo_planificacion': 'Manual Heurístico (Zona + Urgencia de Ventana)',
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

    def compare_plans(self, manual_res, optimized_res):
        """Genera el cuadro de ahorros del plan optimizado vs el baseline manual."""

        def _safe_pct(saving, base):
            return (saving / base) * 100 if base > 0 else 0.0

        km_saving = manual_res['distancia_total_km'] - optimized_res['distancia_total_km']
        cost_saving = manual_res['coste_total_euros'] - optimized_res['coste_total_euros']
        co2_saving = manual_res['co2_total_kg'] - optimized_res['co2_total_kg']

        return {
            'distancia_manual_km': manual_res['distancia_total_km'],
            'distancia_optimizada_km': optimized_res['distancia_total_km'],
            'ahorro_distancia_km': km_saving,
            'ahorro_distancia_pct': _safe_pct(km_saving, manual_res['distancia_total_km']),

            'coste_manual_euros': manual_res['coste_total_euros'],
            'coste_optimizado_euros': optimized_res['coste_total_euros'],
            'ahorro_coste_euros': cost_saving,
            'ahorro_coste_pct': _safe_pct(cost_saving, manual_res['coste_total_euros']),

            'co2_manual_kg': manual_res['co2_total_kg'],
            'co2_optimizado_kg': optimized_res['co2_total_kg'],
            'ahorro_co2_kg': co2_saving,
            'ahorro_co2_pct': _safe_pct(co2_saving, manual_res['co2_total_kg']),

            'retrasos_manual': manual_res['pedidos_retrasados'],
            'retrasos_optimizado': optimized_res['pedidos_retrasados'],
            'retrasos_evitados': manual_res['pedidos_retrasados'] - optimized_res['pedidos_retrasados'],

            'sobrecargas_manual': manual_res['incidentes_sobrecarga'],
            'sobrecargas_optimizado': optimized_res['incidentes_sobrecarga'],
            'sobrecargas_evitadas': manual_res['incidentes_sobrecarga'] - optimized_res['incidentes_sobrecarga'],
        }

    def _minutes_to_time_str(self, minutes_since_midnight):
        m = int(minutes_since_midnight) % 1440
        return f"{m // 60:02d}:{m % 60:02d}"
