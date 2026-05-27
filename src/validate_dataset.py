"""Valida un CSV de pedidos contra el contrato del motor y reporta señales útiles.

Uso:
    python src/validate_dataset.py data/pedidos_empresa.csv
    python src/validate_dataset.py data/pedidos_empresa.csv --vehicles data/vehiculos_config.json

Comprueba:
- Que el CSV se carga (columnas obligatorias presentes, tipos correctos).
- Cuántas filas se descartan y por qué (coords fuera de rango, valores nulos).
- Distribución de pesos, prioridades y ventanas horarias.
- Si la demanda total cabe en la flota (factible para OR-Tools) o si está
  sobrecargada (caerá a fallback heurístico).
- Si hay pedidos con ventana imposible (inicio > fin).

No ejecuta optimización — solo valida. Ideal antes de meter el CSV al e2e.
"""

import argparse
import json
import os
import sys

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from data_processor import DataProcessor

REQUIRED_COLS = [
    "id_pedido", "cliente", "lat", "lon", "prioridad",
    "peso_kg", "franja_inicio", "franja_fin",
]


def main():
    parser = argparse.ArgumentParser(description="Valida un CSV de pedidos OpenRoute.")
    parser.add_argument("csv_path", help="Ruta al CSV de pedidos")
    parser.add_argument("--vehicles", default=os.path.join(HERE, "..", "data", "vehiculos_config.json"),
                        help="Ruta al JSON de vehículos (para balance de carga)")
    args = parser.parse_args()

    if not os.path.exists(args.csv_path):
        print(f"[ERROR] No existe: {args.csv_path}")
        sys.exit(1)

    print(f"\n=== Validación de {args.csv_path} ===\n")

    # 1. Carga cruda (sin filtros).
    raw = pd.read_csv(args.csv_path)
    print(f"[INFO] Filas en el CSV crudo: {len(raw)}")
    print(f"[INFO] Columnas: {list(raw.columns)}")

    missing = [c for c in REQUIRED_COLS if c not in raw.columns]
    if missing:
        print(f"[FAIL] Faltan columnas obligatorias: {missing}")
        sys.exit(1)
    print("[OK]   Todas las columnas obligatorias presentes")

    # 2. Carga procesada (con validaciones del DataProcessor).
    try:
        df = DataProcessor().load_orders(args.csv_path)
    except Exception as e:
        print(f"[FAIL] DataProcessor rechazó el CSV: {e}")
        sys.exit(1)

    descartadas = len(raw) - len(df)
    print(f"[INFO] Filas válidas: {len(df)} | descartadas: {descartadas}")
    if descartadas > 0:
        print("       Causas posibles: lat/lon fuera de [37.5–39.5, -1.5–0.5] (Alicante/Elche)")
        print("       o columnas obligatorias nulas. Edita data_processor.py:43 si trabajas otra zona.")

    # 3. Distribución de pesos.
    print(f"\n--- Pesos (kg) ---")
    print(f"  min={df['peso_kg'].min():.1f}  max={df['peso_kg'].max():.1f}  "
          f"media={df['peso_kg'].mean():.1f}  total={df['peso_kg'].sum():.1f}")

    # 4. Distribución de prioridades.
    print(f"\n--- Prioridades (3=alta, 2=media, 1=baja) ---")
    print(df["prioridad"].value_counts().sort_index().to_string())

    # 5. Ventanas horarias.
    print(f"\n--- Ventanas horarias ---")
    df["duracion_min"] = df["minutos_fin"] - df["minutos_inicio"]
    print(f"  duración media: {df['duracion_min'].mean():.0f} min  |  "
          f"mínima: {df['duracion_min'].min()} min  |  máxima: {df['duracion_min'].max()} min")
    estrechas = (df["duracion_min"] < 120).sum()
    if estrechas > 0:
        print(f"  [WARN] {estrechas} pedidos con ventana < 2h — pueden forzar fallback de OR-Tools")

    # 6. Balance de carga vs flota.
    if os.path.exists(args.vehicles):
        with open(args.vehicles, encoding="utf-8") as f:
            vehicles = json.load(f)
        cap_total = sum(v["capacidad_kg"] for v in vehicles)
        demanda = df["peso_kg"].sum()
        print(f"\n--- Balance flota ({args.vehicles}) ---")
        print(f"  capacidad total flota: {cap_total:.0f} kg")
        print(f"  demanda total CSV:     {demanda:.1f} kg")
        ratio = demanda / cap_total
        if ratio <= 0.7:
            print(f"  [OK]   carga al {ratio*100:.0f}% — OR-Tools tiene margen, factible")
        elif ratio <= 1.0:
            print(f"  [WARN] carga al {ratio*100:.0f}% — ajustado, posible fallback con ventanas estrictas")
        else:
            print(f"  [FAIL] carga al {ratio*100:.0f}% — flota sobrecargada, OR-Tools caerá a fallback heurístico")
            print(f"         sube las capacidades en {args.vehicles} o reduce el dataset")

    print(f"\n=== Validación completa ===\n")


if __name__ == "__main__":
    main()
