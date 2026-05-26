import os
import sys
import pandas as pd
import numpy as np

# Agregar carpeta src al PATH para importar
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../src")))

from data_processor import DataProcessor

def run_eda():
    workspace_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    input_path = os.path.join(workspace_dir, "data/pedidos_ejemplo.csv")
    
    print(f"[*] Iniciando Análisis Exploratorio de Datos (EDA) sobre: {input_path}\n")
    
    processor = DataProcessor()
    try:
        df = processor.load_orders(input_path)
        
        # 1. Estadísticas Descriptivas Básicas de Peso
        total_orders = len(df)
        total_weight = df['peso_kg'].sum()
        avg_weight = df['peso_kg'].mean()
        max_weight = df['peso_kg'].max()
        min_weight = df['peso_kg'].min()
        
        print("=" * 60)
        print("ESTADÍSTICAS GENERALES DE CARGA")
        print("=" * 60)
        print(f"   Total de Pedidos:            {total_orders} entregas")
        print(f"   Peso Total Solicitado:       {total_weight:.2f} kg")
        print(f"   Peso Promedio por Pedido:    {avg_weight:.2f} kg")
        print(f"   Peso Máximo en un Pedido:    {max_weight:.2f} kg")
        print(f"   Peso Mínimo en un Pedido:    {min_weight:.2f} kg")
        print("-" * 60)
        
        # 2. Distribución de Prioridades
        priority_counts = df['prioridad'].value_counts().sort_index()
        priority_mapping = {1: "Baja (1)", 2: "Media (2)", 3: "Alta (3)"}
        
        print("\nDISTRIBUCIÓN DE PRIORIDADES")
        print("=" * 60)
        for p, count in priority_counts.items():
            pct = (count / total_orders) * 100
            bar = "█" * int(pct // 5)
            print(f"   Nivel {priority_mapping.get(p, p)}: {count:2d} ({pct:5.1f}%) {bar}")
        print("-" * 60)
        
        # 3. Análisis Geográfico: Identificar los Centros de Gravedad (Elche vs Alicante)
        # Clasificamos geográficamente por longitud (Elche está al oeste de -0.6, Alicante al este)
        elche_mask = df['lon'] < -0.58
        alicante_mask = ~elche_mask
        
        elche_df = df[elche_mask]
        alicante_df = df[alicante_mask]
        
        print("\nANÁLISIS DE CLUSTERING GEOGRÁFICO NATURAL")
        print("=" * 60)
        print(f"   Pedidos en Núcleo Elche:     {len(elche_df):2d} entregas")
        if len(elche_df) > 0:
            print(f"     Centroide (Lat, Lon):      ({elche_df['lat'].mean():.4f}, {elche_df['lon'].mean():.4f})")
            print(f"     Peso en este núcleo:       {elche_df['peso_kg'].sum():.2f} kg")
            
        print(f"\n   Pedidos en Núcleo Alicante:  {len(alicante_df):2d} entregas")
        if len(alicante_df) > 0:
            print(f"     Centroide (Lat, Lon):      ({alicante_df['lat'].mean():.4f}, {alicante_df['lon'].mean():.4f})")
            print(f"     Peso en este núcleo:       {alicante_df['peso_kg'].sum():.2f} kg")
        print("=" * 60)
        
    except Exception as e:
        print(f"[X] Error durante el análisis EDA: {e}")

if __name__ == "__main__":
    run_eda()
