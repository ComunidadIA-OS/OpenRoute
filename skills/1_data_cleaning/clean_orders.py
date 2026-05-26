import os
import sys

# Agregar carpeta src al PATH para importar
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../src")))

from data_processor import DataProcessor

def run_cleaning():
    workspace_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    input_path = os.path.join(workspace_dir, "data/pedidos_ejemplo.csv")
    
    print(f"[*] Iniciando limpieza académica de datos desde: {input_path}")
    
    processor = DataProcessor()
    try:
        cleaned_df = processor.load_orders(input_path)
        print("\n[✓] Limpieza completada con éxito.")
        print(f"    Total registros válidos: {len(cleaned_df)}")
        print("\nPrimeros 5 registros procesados:")
        print(cleaned_df[['id_pedido', 'cliente', 'lat', 'lon', 'peso_kg', 'minutos_inicio', 'minutos_fin']].head())
    except Exception as e:
        print(f"[X] Error durante la limpieza de datos: {e}")

if __name__ == "__main__":
    run_cleaning()
