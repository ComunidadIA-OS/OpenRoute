import os
import unittest
import pandas as pd
import numpy as np

from data_processor import DataProcessor
from optimizer import RouteOptimizerFactory
from metrics import MetricsEngine

class TestOpenRouteCore(unittest.TestCase):
    def setUp(self):
        self.workspace_dir = "/Users/samuelparraechague/Developer/3_Workspace_Cloudecode"
        self.processor = DataProcessor()
        self.metrics = MetricsEngine()
        
        # Flota mínima ficticia para tests rápidos
        self.mock_vehicles = pd.DataFrame([
            {
                "id_vehiculo": "TEST-V1",
                "nombre": "Test Van",
                "capacidad_kg": 100.0,
                "coste_por_km": 0.20,
                "hora_inicio": "08:00",
                "hora_fin": "16:00",
                "minutos_inicio": 480,
                "minutos_fin": 960,
                "deposito_lat": 38.2743,
                "deposito_lon": -0.6865
            }
        ])

    def test_time_to_minutes(self):
        """Valida la conversión de cadenas de tiempo HH:MM a minutos."""
        self.assertEqual(self.processor._time_to_minutes("00:00"), 0)
        self.assertEqual(self.processor._time_to_minutes("09:30"), 570)
        self.assertEqual(self.processor._time_to_minutes("18:15"), 1095)
        # Valores por defecto para formatos inválidos
        self.assertEqual(self.processor._time_to_minutes("invalido"), 480)

    def test_haversine_distance(self):
        """Valida que el cálculo de distancia geodésica devuelva valores razonables."""
        # Distancia entre UMH Elche (38.2743, -0.6865) y Centro Alicante (38.3450, -0.4880)
        # En línea recta son unos 22 km. Con factor urbano de 1.3 es aproximadamente 28-29 km.
        dist = self.processor.calculate_haversine_distance(38.2743, -0.6865, 38.3450, -0.4880)
        self.assertTrue(20.0 < dist < 35.0, f"Distancia anormalmente calculada: {dist} km")

    def test_distance_matrix_symmetry_and_diagonal(self):
        """Valida que la matriz de distancias sea simétrica y con diagonal cero."""
        mock_orders = pd.DataFrame([
            {
                "id_pedido": "P1", "cliente": "C1",
                "lat": 38.2725, "lon": -0.6782,
                "prioridad": 2, "peso_kg": 10.0,
                "franja_inicio": "09:00", "franja_fin": "12:00",
                "minutos_inicio": 540, "minutos_fin": 720
            },
            {
                "id_pedido": "P2", "cliente": "C2",
                "lat": 38.2810, "lon": -0.6990,
                "prioridad": 1, "peso_kg": 15.0,
                "franja_inicio": "09:00", "franja_fin": "18:00",
                "minutos_inicio": 540, "minutos_fin": 1080
            }
        ])
        
        dist, times = self.processor.build_distance_matrix(38.2743, -0.6865, mock_orders)
        
        # Validar dimensiones (3x3: depósito + 2 pedidos)
        self.assertEqual(dist.shape, (3, 3))
        
        # Diagonal debe ser cero
        for i in range(3):
            self.assertEqual(dist[i, i], 0.0)
            
        # Simetría
        self.assertAlmostEqual(dist[0, 1], dist[1, 0], places=5)
        self.assertAlmostEqual(dist[1, 2], dist[2, 1], places=5)

    def test_heuristic_optimizer_stability(self):
        """Valida que el optimizador por heurística propia devuelva la estructura esperada."""
        mock_orders = pd.DataFrame([
            {
                "id_pedido": "P1", "cliente": "C1", "direccion": "Dir1",
                "lat": 38.2725, "lon": -0.6782,
                "prioridad": 2, "peso_kg": 30.0,
                "franja_inicio": "09:00", "franja_fin": "12:00",
                "minutos_inicio": 540, "minutos_fin": 720,
                "observaciones": ""
            }
        ])
        
        dist, times = self.processor.build_distance_matrix(38.2743, -0.6865, mock_orders)
        
        optimizer = RouteOptimizerFactory.get_optimizer("heuristic")
        res = optimizer.optimize(mock_orders, self.mock_vehicles, dist, times)
        
        # Verificar campos obligatorios del esquema unificado
        self.assertIn("tipo_planificacion", res)
        self.assertIn("distancia_total_km", res)
        self.assertIn("tiempo_total_horas", res)
        self.assertIn("rutas", res)
        self.assertEqual(len(res["rutas"]), 1)
        
        # Verificar contenido de las paradas
        ruta = res["rutas"][0]
        self.assertEqual(ruta["pedidos_entregados"], 1)
        self.assertEqual(ruta["detalle_paradas"][0]["id_pedido"], "P1")

if __name__ == "__main__":
    unittest.main()
