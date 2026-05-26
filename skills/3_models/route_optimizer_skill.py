import os
import sys
import argparse

# Agregar carpeta src al PATH para importar
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../src")))

from data_processor import DataProcessor
from optimizer import RouteOptimizerFactory
from metrics import MetricsEngine

def main():
    parser = argparse.ArgumentParser(description="Ejecutor Académico de Modelos de Ruta - OpenRoute")
    parser.add_argument("--mode", type=str, default="heuristic", choices=["ortools", "heuristic"],
                        help="Motor de optimización a utilizar (default: heuristic)")
    
    args = parser.parse_args()
    
    workspace_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    orders_path = os.path.join(workspace_dir, "data/pedidos_ejemplo.csv")
    vehicles_path = os.path.join(workspace_dir, "data/vehiculos_config.json")
    
    print(f"[*] Lanzando optimizador en modo: {args.mode.upper()}")
    
    processor = DataProcessor()
    try:
        orders_df = processor.load_orders(orders_path)
        vehicles_df = processor.load_vehicles(vehicles_path)
        
        depot_lat = vehicles_df.loc[0, 'deposito_lat']
        depot_lon = vehicles_df.loc[0, 'deposito_lon']
        
        dist_matrix, time_matrix = processor.build_distance_matrix(depot_lat, depot_lon, orders_df)
        
        optimizer = RouteOptimizerFactory.get_optimizer(args.mode)
        results = optimizer.optimize(orders_df, vehicles_df, dist_matrix, time_matrix)
        
        print("\n[✓] Optimización Académica completada exitosamente.")
        print(f"    Algoritmo Utilizado:     {results['tipo_planificacion']}")
        print(f"    Vehículos Utilizados:    {results['vehiculos_activos']}")
        print(f"    Distancia Total de Flota: {results['distancia_total_km']:.2f} km")
        print(f"    Tiempo Total de Ruta:    {results['tiempo_total_horas']:.2f} horas")
        print(f"    Pedidos Tardíos:         {results['pedidos_retrasados']}")
        print(f"    Sobrecargas de Flota:    {results['incidentes_sobrecarga']}")
        
    except Exception as e:
        print(f"[X] Error durante la ejecución del modelo: {e}")

if __name__ == "__main__":
    main()
