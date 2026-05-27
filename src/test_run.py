import os
from data_processor import DataProcessor
from metrics import MetricsEngine
from optimizer import RouteOptimizerFactory

def run_test():
    # Paths relativos a la raíz del repo (un nivel por encima de src/).
    here = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(here, os.pardir))
    orders_path = os.path.join(repo_root, "data", "pedidos_ejemplo.csv")
    vehicles_path = os.path.join(repo_root, "data", "vehiculos_config.json")
    
    print("=" * 60)
    print("INICIANDO PRUEBA COMPLETA DE MOTOR LOGÍSTICO - OPENROUTE")
    print("=" * 60)
    
    # 1. Cargar y Procesar Datos
    processor = DataProcessor()
    orders_df = processor.load_orders(orders_path)
    vehicles_df = processor.load_vehicles(vehicles_path)
    
    print(f"[*] Datos cargados: {len(orders_df)} pedidos | {len(vehicles_df)} vehículos.")
    
    # Obtener depósito común para construir la matriz de distancias
    depot_lat = vehicles_df.loc[0, 'deposito_lat']
    depot_lon = vehicles_df.loc[0, 'deposito_lon']
    
    dist_matrix, time_matrix = processor.build_distance_matrix(depot_lat, depot_lon, orders_df)
    print(f"[*] Matriz de distancias construida ({dist_matrix.shape[0]}x{dist_matrix.shape[1]}).")
    
    # 2. Inicializar Motores
    metrics = MetricsEngine()
    
    # 3. Ejecutar Simulación de Baseline Manual
    print("\n[+] Ejecutando simulación de Plan Manual (Baseline)...")
    baseline_res = metrics.simulate_manual_baseline(orders_df, vehicles_df, dist_matrix, time_matrix)
    
    # 4. Ejecutar Heurística Propia
    print("[+] Ejecutando optimizador: Heurística Propia (Clustering + VMC Ponderado)...")
    heuristic_opt = RouteOptimizerFactory.get_optimizer("heuristic")
    heuristic_res = heuristic_opt.optimize(orders_df, vehicles_df, dist_matrix, time_matrix)
    
    # 5. Ejecutar OR-Tools
    print("[+] Ejecutando optimizador: Google OR-Tools...")
    ortools_opt = RouteOptimizerFactory.get_optimizer("ortools")
    ortools_res = ortools_opt.optimize(orders_df, vehicles_df, dist_matrix, time_matrix)
    
    # 6. Comparaciones
    print("\n" + "=" * 60)
    print("RESULTADOS DE COMPARTIVA DE PLANIFICACIÓN LOGÍSTICA")
    print("=" * 60)
    
    def print_plan_summary(name, res):
        print(f"\n>> PLAN: {name}")
        print(f"   Vehículos Activos:   {res['vehiculos_activos']}")
        print(f"   Distancia Total:     {res['distancia_total_km']:.2f} km")
        print(f"   Tiempo de Ruta:      {res['tiempo_total_horas']:.2f} horas")
        print(f"   Coste Financiero:    {res['coste_total_euros']:.2f} €")
        print(f"   Emisiones de CO2:    {res['co2_total_kg']:.2f} kg CO2")
        print(f"   Pedidos Retrasados:  {res['pedidos_retrasados']} de {len(orders_df)}")
        print(f"   Sobrecargas Flota:   {res['incidentes_sobrecarga']}")
        
    print_plan_summary("Plan Manual (Baseline)", baseline_res)
    print_plan_summary("Heurística Propia", heuristic_res)
    print_plan_summary("Google OR-Tools", ortools_res)
    
    # Tabla de Ahorros con OR-Tools
    savings = metrics.compare_plans(baseline_res, ortools_res)
    print("\n" + "=" * 60)
    print("AHORRO LOGRADO CON OPTIMIZACIÓN INDUSTRIAL (OR-Tools vs Manual)")
    print("=" * 60)
    print(f"   Kilómetros Evitados:       {savings['ahorro_distancia_km']:.2f} km ({savings['ahorro_distancia_pct']:.1f}% de reducción)")
    print(f"   Dinero Ahorrado:           {savings['ahorro_coste_euros']:.2f} € ({savings['ahorro_coste_pct']:.1f}% de reducción)")
    print(f"   Emisiones Evitadas:        {savings['ahorro_co2_kg']:.2f} kg CO2 ({savings['ahorro_co2_pct']:.1f}% de reducción)")
    print(f"   Retrasos Evitados:         {savings['retrasos_evitados']} paradas a tiempo")
    print(f"   Incidentes de Sobrecarga:  {savings['sobrecargas_evitadas']} prevenidos")
    print("=" * 60)
    
    # Tabla de Ahorros con Heurística Propia
    savings_h = metrics.compare_plans(baseline_res, heuristic_res)
    print("\n" + "=" * 60)
    print("AHORRO LOGRADO CON HEURÍSTICA ACADÉMICA (Propia vs Manual)")
    print("=" * 60)
    print(f"   Kilómetros Evitados:       {savings_h['ahorro_distancia_km']:.2f} km ({savings_h['ahorro_distancia_pct']:.1f}% de reducción)")
    print(f"   Dinero Ahorrado:           {savings_h['ahorro_coste_euros']:.2f} € ({savings_h['ahorro_coste_pct']:.1f}% de reducción)")
    print(f"   Retrasos Evitados:         {savings_h['retrasos_evitados']} paradas a tiempo")
    print("=" * 60)

    # 7. Ejecutar Explicador IA
    print("\n[+] Generando Informe Explicativo con Asistente IA (OpenRoute)...")
    from ai_assistant import AIAssistant
    ai = AIAssistant()
    report = ai.generate_explanation(heuristic_res, savings_h)
    
    print("\n" + "=" * 60)
    print("INFORME GENERADO POR EL ASISTENTE IA DE OPENROUTE")
    print("=" * 60)
    print(report)
    print("=" * 60)

if __name__ == "__main__":
    run_test()

