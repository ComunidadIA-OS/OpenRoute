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
        # use_osrm=False fuerza Haversine: simetría garantizada por la fórmula.
        # OSRM real NO es simétrico (calles de sentido único), así que este
        # invariante no aplicaría al modo OSRM — por eso lo testeamos con Haversine.
        df = pd.DataFrame([
            _order("P1", 38.2725, -0.6782, 10.0),
            _order("P2", 38.2810, -0.6990, 15.0),
        ])
        dist, _ = self.processor.build_distance_matrix(38.2743, -0.6865, df, use_osrm=False)
        self.assertEqual(dist.shape, (3, 3))
        for i in range(3):
            self.assertEqual(dist[i, i], 0.0)
        self.assertAlmostEqual(dist[0, 1], dist[1, 0], places=5)
        self.assertAlmostEqual(dist[1, 2], dist[2, 1], places=5)
        self.assertEqual(self.processor.last_matrix_source, "haversine")


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
        # Tests deterministas: Haversine, sin depender de OSRM público.
        self.dist, self.times = self.processor.build_distance_matrix(
            38.2743, -0.6865, self.orders, use_osrm=False
        )

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
        dist, times = self.processor.build_distance_matrix(38.2743, -0.6865, orders, use_osrm=False)

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
        dist, times = self.processor.build_distance_matrix(38.2743, -0.6865, orders, use_osrm=False)

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
        dist, times = self.processor.build_distance_matrix(38.2743, -0.6865, orders, use_osrm=False)

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
        dist, times = self.processor.build_distance_matrix(38.2743, -0.6865, orders, use_osrm=False)

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
        dist, times = self.processor.build_distance_matrix(38.2743, -0.6865, orders, use_osrm=False)

        plan = RouteOptimizerFactory.get_optimizer("heuristic").optimize(orders, vehicles, dist, times)
        self.assertEqual(plan["vehiculos_activos"], 0)
        self.assertEqual(plan["rutas"], [])


class TestJsonSerializable(unittest.TestCase):
    """Regresión del bug "'numpy.bool' object is not iterable" en FastAPI.

    El response del motor termina serializándose con FastAPI/jsonable_encoder,
    que NO sabe encodear numpy.bool_ (lo trata como dict iterable). Si una
    comparación numpy se cuela como bool sin envolver, el endpoint cae con
    500 sin cuerpo. Los tests siguientes garantizan que todos los campos
    booleanos de los planes son Python bool 'duros'.
    """

    def _assert_no_numpy_bool(self, obj, path="root"):
        import numpy as np
        if isinstance(obj, dict):
            for k, v in obj.items():
                self._assert_no_numpy_bool(v, f"{path}.{k}")
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                self._assert_no_numpy_bool(v, f"{path}[{i}]")
        elif isinstance(obj, np.bool_):
            self.fail(f"numpy.bool_ encontrado en {path}: {obj!r} — envolver con bool()")
        elif isinstance(obj, bool):
            return  # bool de Python OK

    def _setup_overloaded_dataset(self):
        """Dataset diseñado para que algún vehículo se sobrecargue en el
        baseline manual y el plan optimizado: así se ejerce el camino
        'sobrecargado'=True que es donde se materializa el bug."""
        orders = pd.DataFrame([
            _order("P1", 38.27, -0.69, 80.0),
            _order("P2", 38.28, -0.70, 80.0),
            _order("P3", 38.26, -0.68, 80.0),
        ])
        vehicles = pd.DataFrame([_vehicle("V1", capacidad=100.0)])  # carga total 240 > 100
        processor = DataProcessor()
        depot_lat, depot_lon = vehicles.loc[0, "deposito_lat"], vehicles.loc[0, "deposito_lon"]
        dist, time = processor.build_distance_matrix(depot_lat, depot_lon, orders, use_osrm=False)
        return orders, vehicles, dist, time

    def test_baseline_response_is_pure_python_bools(self):
        orders, vehicles, dist, time = self._setup_overloaded_dataset()
        plan = MetricsEngine().simulate_manual_baseline(orders, vehicles, dist, time)
        # Confirmamos que la sobrecarga REALMENTE se dispara, si no el test no
        # ejercita el camino que tenía el bug.
        self.assertGreaterEqual(plan["incidentes_sobrecarga"], 1)
        self._assert_no_numpy_bool(plan)

    def test_optimizer_response_is_pure_python_bools(self):
        orders, vehicles, dist, time = self._setup_overloaded_dataset()
        # Forzamos heurística para no depender del solver de OR-Tools en este test.
        plan = RouteOptimizerFactory.get_optimizer("heuristic").optimize(
            orders, vehicles, dist, time
        )
        self._assert_no_numpy_bool(plan)


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


class TestBbox(unittest.TestCase):
    """El bbox de DataProcessor debe ser configurable: argumento explícito,
    env var, y default Alicante/Elche. Pedidos fuera del bbox se descartan
    silenciosamente (la cuenta queda visible en len antes vs len después).

    Los tests cubren el caso de uso TRL5: una pyme de otra ciudad sube su
    CSV y debe poder configurar el bbox sin tocar código.
    """

    SEVILLA_BBOX = (37.0, 38.0, -6.5, -5.5)
    SEVILLA_ORDER = _order("SEV-1", 37.3886, -5.9823, 10.0)  # Catedral de Sevilla
    ALICANTE_ORDER = _order("ALC-1", 38.2725, -0.6782, 10.0)  # Altabix, Elche

    def test_default_bbox_keeps_alicante_discards_sevilla(self):
        processor = DataProcessor()  # default = Alicante/Elche
        self.assertEqual(processor.bbox, DataProcessor.DEFAULT_BBOX)
        df = pd.DataFrame([self.ALICANTE_ORDER, self.SEVILLA_ORDER])
        out = processor.validate_orders(df)
        ids = set(out["id_pedido"].tolist())
        self.assertIn("ALC-1", ids)
        self.assertNotIn("SEV-1", ids, "Default bbox no debería aceptar coords de Sevilla")

    def test_explicit_bbox_overrides_default(self):
        processor = DataProcessor(bbox=self.SEVILLA_BBOX)
        df = pd.DataFrame([self.ALICANTE_ORDER, self.SEVILLA_ORDER])
        out = processor.validate_orders(df)
        ids = set(out["id_pedido"].tolist())
        self.assertIn("SEV-1", ids, "Bbox de Sevilla debería aceptar SEV-1")
        self.assertNotIn("ALC-1", ids, "Bbox de Sevilla no debería aceptar ALC-1")

    def test_worldwide_bbox_accepts_everything(self):
        processor = DataProcessor(bbox=DataProcessor.WORLDWIDE_BBOX)
        df = pd.DataFrame([self.ALICANTE_ORDER, self.SEVILLA_ORDER])
        out = processor.validate_orders(df)
        self.assertEqual(len(out), 2, "Worldwide debería aceptar ambas")

    def test_env_var_overrides_default_when_no_arg(self):
        old = os.environ.get("OPENROUTE_BBOX")
        os.environ["OPENROUTE_BBOX"] = "37.0,38.0,-6.5,-5.5"
        try:
            processor = DataProcessor()  # sin arg → debe leer env
            self.assertEqual(processor.bbox, self.SEVILLA_BBOX)
            df = pd.DataFrame([self.SEVILLA_ORDER])
            out = processor.validate_orders(df)
            self.assertEqual(len(out), 1)
        finally:
            if old is None:
                os.environ.pop("OPENROUTE_BBOX", None)
            else:
                os.environ["OPENROUTE_BBOX"] = old

    def test_env_var_worldwide_keyword(self):
        old = os.environ.get("OPENROUTE_BBOX")
        os.environ["OPENROUTE_BBOX"] = "worldwide"
        try:
            processor = DataProcessor()
            self.assertEqual(processor.bbox, DataProcessor.WORLDWIDE_BBOX)
        finally:
            if old is None:
                os.environ.pop("OPENROUTE_BBOX", None)
            else:
                os.environ["OPENROUTE_BBOX"] = old

    def test_env_var_invalid_raises(self):
        old = os.environ.get("OPENROUTE_BBOX")
        os.environ["OPENROUTE_BBOX"] = "no-soy-un-bbox"
        try:
            with self.assertRaises(ValueError):
                DataProcessor()
        finally:
            if old is None:
                os.environ.pop("OPENROUTE_BBOX", None)
            else:
                os.environ["OPENROUTE_BBOX"] = old

    def test_explicit_arg_beats_env_var(self):
        # Si el llamador pasa bbox explícito, ignora la env: precedencia clara.
        old = os.environ.get("OPENROUTE_BBOX")
        os.environ["OPENROUTE_BBOX"] = "worldwide"
        try:
            processor = DataProcessor(bbox=self.SEVILLA_BBOX)
            self.assertEqual(processor.bbox, self.SEVILLA_BBOX)
        finally:
            if old is None:
                os.environ.pop("OPENROUTE_BBOX", None)
            else:
                os.environ["OPENROUTE_BBOX"] = old


class TestOSRMFallback(unittest.TestCase):
    """El motor debe degradar a Haversine de forma silenciosa cuando OSRM no
    responde, y de forma estricta cuando el llamador exige OSRM (use_osrm=True)."""

    def setUp(self):
        self.processor = DataProcessor()
        self.orders = pd.DataFrame([
            _order("P1", 38.2725, -0.6782, 10.0),
            _order("P2", 38.2810, -0.6990, 15.0),
        ])

    def _force_osrm_failure(self):
        """Hace que cualquier llamada a OSRM falle con OSRMClientError.

        Sustituimos el método ``table`` del cliente compartido en lugar de
        mockear ``requests`` para no acoplarnos al detalle interno. Devuelve
        el método original para que el caller lo restaure.
        """
        import osrm_client

        client = osrm_client.get_default_client()
        original = client.table

        def boom(_coords):
            raise osrm_client.OSRMClientError("simulado para tests")

        client.table = boom  # type: ignore[method-assign]
        # Limpiar caché para que la sustitución sí se ejerza
        client._cache.clear()
        return client, original

    def test_use_osrm_false_uses_haversine(self):
        self.processor.build_distance_matrix(38.2743, -0.6865, self.orders, use_osrm=False)
        self.assertEqual(self.processor.last_matrix_source, "haversine")

    def test_use_osrm_none_falls_back_silently_on_error(self):
        client, original = self._force_osrm_failure()
        try:
            dist, _ = self.processor.build_distance_matrix(
                38.2743, -0.6865, self.orders, use_osrm=None
            )
        finally:
            client.table = original  # type: ignore[method-assign]
        # Debe haber caído a Haversine sin propagar la excepción.
        self.assertEqual(self.processor.last_matrix_source, "haversine")
        self.assertEqual(dist.shape, (3, 3))

    def test_use_osrm_true_propagates_error(self):
        from osrm_client import OSRMClientError

        client, original = self._force_osrm_failure()
        try:
            with self.assertRaises(OSRMClientError):
                self.processor.build_distance_matrix(
                    38.2743, -0.6865, self.orders, use_osrm=True
                )
        finally:
            client.table = original  # type: ignore[method-assign]

    def test_disable_env_var_forces_haversine(self):
        old = os.environ.get("OPENROUTE_DISABLE_OSRM")
        os.environ["OPENROUTE_DISABLE_OSRM"] = "1"
        try:
            self.processor.build_distance_matrix(
                38.2743, -0.6865, self.orders, use_osrm=None
            )
            self.assertEqual(self.processor.last_matrix_source, "haversine")
        finally:
            if old is None:
                os.environ.pop("OPENROUTE_DISABLE_OSRM", None)
            else:
                os.environ["OPENROUTE_DISABLE_OSRM"] = old


if __name__ == "__main__":
    unittest.main()
