"""Tests del motor de optimización.

Valida:
- Conversiones y geometría básica (DataProcessor).
- Schema unificado del output (contrato con FastAPI y frontend).
- Restricciones duras del solver (capacidad y ventanas horarias).
- Coherencia de la comparación baseline vs optimizado.

Se ejecuta con:
    python -m unittest src/test_optimizer.py -v
"""

import os
import sys
import unittest
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from data_processor import DataProcessor
from optimizer import RouteOptimizerFactory
from metrics import MetricsEngine


def _vehicle(id_v="TEST-V1", capacidad=100.0, hora_inicio="08:00", hora_fin="18:00", nombre="Test Van Diésel"):
    return {
        "id_vehiculo": id_v,
        "nombre": nombre,
        "capacidad_kg": capacidad,
        "coste_por_km": 0.20,
        "hora_inicio": hora_inicio,
        "hora_fin": hora_fin,
        "minutos_inicio": DataProcessor()._time_to_minutes(hora_inicio),
        "minutos_fin": DataProcessor()._time_to_minutes(hora_fin),
        "deposito_lat": 38.2743,
        "deposito_lon": -0.6865,
    }


def _order(id_p, lat, lon, peso, franja_inicio="09:00", franja_fin="18:00", prioridad=2, cliente=None):
    return {
        "id_pedido": id_p,
        "cliente": cliente or f"Cliente {id_p}",
        "direccion": "",
        "lat": lat,
        "lon": lon,
        "prioridad": prioridad,
        "peso_kg": peso,
        "franja_inicio": franja_inicio,
        "franja_fin": franja_fin,
        "minutos_inicio": DataProcessor()._time_to_minutes(franja_inicio),
        "minutos_fin": DataProcessor()._time_to_minutes(franja_fin),
        "observaciones": "",
    }


class TestDataProcessor(unittest.TestCase):
    def setUp(self):
        self.processor = DataProcessor()

    def test_time_to_minutes(self):
        self.assertEqual(self.processor._time_to_minutes("00:00"), 0)
        self.assertEqual(self.processor._time_to_minutes("09:30"), 570)
        self.assertEqual(self.processor._time_to_minutes("18:15"), 1095)
        self.assertEqual(self.processor._time_to_minutes("invalido"), 480)

    def test_haversine_distance_realistic(self):
        # UMH Elche (38.2743, -0.6865) -> Centro Alicante (38.3450, -0.4880): ~22 km línea recta
        # Con factor urbano 1.3 -> rango razonable 25-32 km
        dist = self.processor.calculate_haversine_distance(38.2743, -0.6865, 38.3450, -0.4880)
        self.assertTrue(20.0 < dist < 35.0, f"Distancia fuera de rango: {dist} km")

    def test_distance_matrix_symmetry_and_diagonal(self):
        df = pd.DataFrame([
            _order("P1", 38.2725, -0.6782, 10.0),
            _order("P2", 38.2810, -0.6990, 15.0),
        ])
        dist, _ = self.processor.build_distance_matrix(38.2743, -0.6865, df)
        self.assertEqual(dist.shape, (3, 3))
        for i in range(3):
            self.assertEqual(dist[i, i], 0.0)
        self.assertAlmostEqual(dist[0, 1], dist[1, 0], places=5)
        self.assertAlmostEqual(dist[1, 2], dist[2, 1], places=5)


class TestOptimizerSchema(unittest.TestCase):
    """Contrato de salida: ambos motores deben devolver las mismas claves."""

    REQUIRED_TOP_KEYS = {
        "tipo_planificacion", "vehiculos_activos", "distancia_total_km",
        "tiempo_total_horas", "coste_total_euros", "co2_total_kg",
        "pedidos_retrasados", "incidentes_sobrecarga", "rutas",
    }
    REQUIRED_STOP_KEYS = {
        "id_pedido", "cliente", "prioridad", "peso_kg",
        "hora_llegada", "ventana", "retrasado",
    }

    def setUp(self):
        self.processor = DataProcessor()
        self.vehicles = pd.DataFrame([_vehicle()])
        self.orders = pd.DataFrame([_order("P1", 38.2725, -0.6782, 30.0)])
        self.dist, self.times = self.processor.build_distance_matrix(38.2743, -0.6865, self.orders)

    def _assert_schema(self, plan):
        self.assertTrue(self.REQUIRED_TOP_KEYS.issubset(plan.keys()),
                        f"Faltan claves: {self.REQUIRED_TOP_KEYS - set(plan.keys())}")
        for ruta in plan["rutas"]:
            for stop in ruta["detalle_paradas"]:
                self.assertTrue(self.REQUIRED_STOP_KEYS.issubset(stop.keys()),
                                f"Faltan claves de parada: {self.REQUIRED_STOP_KEYS - set(stop.keys())}")

    def test_heuristic_schema(self):
        plan = RouteOptimizerFactory.get_optimizer("heuristic").optimize(
            self.orders, self.vehicles, self.dist, self.times
        )
        self._assert_schema(plan)
        self.assertEqual(plan["rutas"][0]["detalle_paradas"][0]["id_pedido"], "P1")

    def test_ortools_schema(self):
        plan = RouteOptimizerFactory.get_optimizer("ortools").optimize(
            self.orders, self.vehicles, self.dist, self.times
        )
        self._assert_schema(plan)


class TestHardConstraints(unittest.TestCase):
    """Validación de restricciones duras: capacidad y ventanas. Tests TRL5."""

    def setUp(self):
        self.processor = DataProcessor()

    def test_ortools_respects_capacity(self):
        """OR-Tools no debe asignar más kg a un vehículo que su capacidad."""
        vehicles = pd.DataFrame([_vehicle(capacidad=100.0)])
        orders = pd.DataFrame([
            _order("P1", 38.2725, -0.6782, 40.0),
            _order("P2", 38.2750, -0.6870, 30.0),
            _order("P3", 38.2810, -0.6990, 20.0),
        ])  # total 90 kg, cabe
        dist, times = self.processor.build_distance_matrix(38.2743, -0.6865, orders)

        plan = RouteOptimizerFactory.get_optimizer("ortools").optimize(orders, vehicles, dist, times)

        for ruta in plan["rutas"]:
            self.assertLessEqual(
                ruta["carga_total_kg"], 100.0,
                f"Vehículo {ruta['id_vehiculo']} excede capacidad: {ruta['carga_total_kg']} > 100"
            )

    def test_ortools_respects_time_windows_when_feasible(self):
        """Con ventanas amplias y matriz pequeña, OR-Tools debe entregar todo a tiempo."""
        vehicles = pd.DataFrame([_vehicle(capacidad=500.0)])
        orders = pd.DataFrame([
            _order("P1", 38.2725, -0.6782, 10.0, "08:00", "18:00"),
            _order("P2", 38.2750, -0.6870, 10.0, "08:00", "18:00"),
        ])
        dist, times = self.processor.build_distance_matrix(38.2743, -0.6865, orders)

        plan = RouteOptimizerFactory.get_optimizer("ortools").optimize(orders, vehicles, dist, times)
        self.assertEqual(plan["pedidos_retrasados"], 0,
                         "OR-Tools entregó tarde con ventanas anchas y 2 paradas — falla de configuración")

    def test_ortools_defers_infeasible_orders_via_disjunctions(self):
        """Con un pedido imposible de servir, OR-Tools debe diferirlo (no fallar)."""
        # Capacidad insuficiente: 500kg en vehículo de 10kg → infactible.
        # Con DISJUNCTIONS el solver descarta el pedido con penalización en lugar
        # de devolver "no factible".
        vehicles = pd.DataFrame([_vehicle(capacidad=10.0)])
        orders = pd.DataFrame([
            _order("P1", 38.2725, -0.6782, 500.0),
        ])
        dist, times = self.processor.build_distance_matrix(38.2743, -0.6865, orders)

        plan = RouteOptimizerFactory.get_optimizer("ortools").optimize(orders, vehicles, dist, times)

        # OR-Tools sí encuentra solución (la solución es "no entregar nada").
        self.assertFalse(plan.get("used_fallback", False),
                         "Con disjunctions OR-Tools no debería caer a fallback")
        # El pedido infactible debe aparecer en pedidos_diferidos.
        diferidos = plan.get("pedidos_diferidos", [])
        self.assertEqual(len(diferidos), 1, f"Esperaba 1 pedido diferido, got {len(diferidos)}")
        self.assertEqual(diferidos[0]["id_pedido"], "P1")
        self.assertEqual(diferidos[0]["motivo"], "infactible_con_restricciones_actuales")

    def test_ortools_serves_feasible_orders_and_defers_only_infeasible(self):
        """Mezcla de pedidos factibles + uno imposible: serve los factibles, difiere el otro."""
        vehicles = pd.DataFrame([_vehicle(capacidad=100.0)])
        orders = pd.DataFrame([
            _order("OK1", 38.2725, -0.6782, 20.0),  # cabe
            _order("OK2", 38.2750, -0.6870, 30.0),  # cabe
            _order("BIG", 38.2810, -0.6990, 500.0), # NO cabe
        ])
        dist, times = self.processor.build_distance_matrix(38.2743, -0.6865, orders)

        plan = RouteOptimizerFactory.get_optimizer("ortools").optimize(orders, vehicles, dist, times)

        self.assertFalse(plan.get("used_fallback", False))
        served_ids = {s["id_pedido"] for r in plan["rutas"] for s in r["detalle_paradas"]}
        deferred_ids = {d["id_pedido"] for d in plan.get("pedidos_diferidos", [])}
        self.assertIn("OK1", served_ids)
        self.assertIn("OK2", served_ids)
        self.assertIn("BIG", deferred_ids)
        self.assertNotIn("BIG", served_ids)

    def test_empty_orders_returns_valid_empty_plan(self):
        vehicles = pd.DataFrame([_vehicle()])
        orders = pd.DataFrame([
            _order("P1", 38.2725, -0.6782, 10.0),
        ]).iloc[0:0]  # DataFrame vacío con columnas
        dist, times = self.processor.build_distance_matrix(38.2743, -0.6865, orders)

        plan = RouteOptimizerFactory.get_optimizer("heuristic").optimize(orders, vehicles, dist, times)
        self.assertEqual(plan["vehiculos_activos"], 0)
        self.assertEqual(plan["rutas"], [])


class TestMetricsCoherence(unittest.TestCase):
    """La comparativa debe ser coherente con los inputs."""

    def test_compare_plans_savings_arithmetic(self):
        manual = {
            "distancia_total_km": 100.0, "coste_total_euros": 50.0, "co2_total_kg": 22.0,
            "pedidos_retrasados": 3, "incidentes_sobrecarga": 1,
            "tiempo_total_horas": 5.0, "vehiculos_activos": 3, "rutas": [], "tipo_planificacion": "Manual",
        }
        optim = {
            "distancia_total_km": 70.0, "coste_total_euros": 35.0, "co2_total_kg": 15.4,
            "pedidos_retrasados": 1, "incidentes_sobrecarga": 0,
            "tiempo_total_horas": 4.0, "vehiculos_activos": 3, "rutas": [], "tipo_planificacion": "Optimizado",
        }
        savings = MetricsEngine().compare_plans(manual, optim)
        self.assertAlmostEqual(savings["ahorro_distancia_km"], 30.0)
        self.assertAlmostEqual(savings["ahorro_distancia_pct"], 30.0)
        self.assertAlmostEqual(savings["ahorro_coste_euros"], 15.0)
        self.assertEqual(savings["retrasos_evitados"], 2)
        self.assertEqual(savings["sobrecargas_evitadas"], 1)


if __name__ == "__main__":
    unittest.main()
