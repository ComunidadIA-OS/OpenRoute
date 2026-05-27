"""
OpenRoute — Microservicio FastAPI sobre el motor de optimización Python.

Este servicio expone el solver VRP (`src/optimizer.py`) y el simulador
baseline (`src/metrics.py`) por HTTP, para que el frontend conversacional
(Next.js + chatbot LLM) pueda invocarlo cuando necesite una optimización
con time windows estrictas, capacidades de vehículo y restricciones de
prioridad — casos en los que OSRM `/trip` (TSP simple) se queda corto.

Cómo arrancar:
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000

Endpoints:
    GET  /health         → comprobación del servicio
    POST /optimize       → resuelve VRP y devuelve plan optimizado
    POST /baseline       → simula plan manual heurístico (referencia)
    POST /compare        → ejecuta baseline + optimizador y devuelve ahorro

Cliente típico: `web/src/lib/optimize.ts` del frontend Next.js.
"""

from __future__ import annotations

import os
import sys
from io import BytesIO
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Permitir importar src/ sin instalación como paquete
HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, os.pardir))
SRC_PATH = os.path.join(REPO_ROOT, "src")
if SRC_PATH not in sys.path:
    sys.path.insert(0, SRC_PATH)

from data_processor import DataProcessor  # noqa: E402
from metrics import MetricsEngine  # noqa: E402
from optimizer import RouteOptimizerFactory  # noqa: E402


# ─── Schemas ─────────────────────────────────────────────────────────

class OrderIn(BaseModel):
    """Pedido entrante. Campos alineados con el esquema que espera DataProcessor."""

    id_pedido: str = Field(..., description="Código único del pedido")
    cliente: str
    lat: float = Field(..., ge=37.5, le=39.5, description="Latitud (Alicante/Elche). Editar rango en data_processor.py para otras zonas.")
    lon: float = Field(..., ge=-1.5, le=0.5, description="Longitud (Alicante/Elche)")
    # Convención fijada en src/optimizer.py:162 y src/metrics.py: 3=alta, 2=media, 1=baja.
    # NO invertirlo aquí: si el CSV de la pyme usa 1=urgente, debe convertirse al cargar.
    prioridad: int = Field(2, ge=1, le=3, description="3=alta urgencia, 2=media, 1=baja")
    peso_kg: float = Field(..., gt=0)
    franja_inicio: str = Field(..., description="HH:MM")
    franja_fin: str = Field(..., description="HH:MM")
    direccion: str | None = None
    observaciones: str | None = None


class VehicleIn(BaseModel):
    """Vehículo de la flota."""

    id_vehiculo: str
    nombre: str
    capacidad_kg: float = Field(..., gt=0)
    coste_por_km: float = Field(..., ge=0)
    hora_inicio: str = "08:00"
    hora_fin: str = "18:00"
    deposito_lat: float
    deposito_lon: float
    zona_preferente: str | None = None


class OptimizeRequest(BaseModel):
    orders: list[OrderIn]
    vehicles: list[VehicleIn] | None = None  # Si no se pasa, usa el dataset por defecto
    mode: Literal["ortools", "heuristic"] = "ortools"


# ─── App ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="OpenRoute Optimizer API",
    description="Microservicio FastAPI sobre el solver VRP del backend Python.",
    version="0.2.0",
)

# CORS configurable por entorno. En dev se permite '*' por defecto; en producción
# DEBE establecerse OPENROUTE_CORS_ORIGINS al origin del frontend (coma-separado).
_cors_env = os.getenv("OPENROUTE_CORS_ORIGINS", "*")
_cors_origins = [o.strip() for o in _cors_env.split(",")] if _cors_env != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ─── Helpers internos ────────────────────────────────────────────────

def _default_vehicles_path() -> str:
    return os.path.join(REPO_ROOT, "data", "vehiculos_config.json")


def _build_dataframes(req: OptimizeRequest) -> tuple[pd.DataFrame, pd.DataFrame, float, float]:
    """Convierte los pedidos y vehículos del request en DataFrames listos para el solver."""

    if not req.orders:
        raise HTTPException(status_code=400, detail="orders no puede estar vacío")

    orders_df = pd.DataFrame([o.model_dump() for o in req.orders])
    processor = DataProcessor()
    orders_df = processor.validate_orders(orders_df)

    if req.vehicles:
        vehicles_df = pd.DataFrame([v.model_dump() for v in req.vehicles])
    else:
        # Fallback: cargar dataset por defecto
        vehicles_path = _default_vehicles_path()
        if not os.path.exists(vehicles_path):
            raise HTTPException(
                status_code=500,
                detail=f"No se han proporcionado vehículos y el dataset por defecto no existe: {vehicles_path}",
            )
        vehicles_df = processor.load_vehicles(vehicles_path)

    depot_lat = float(vehicles_df.loc[0, "deposito_lat"])
    depot_lon = float(vehicles_df.loc[0, "deposito_lon"])
    return orders_df, vehicles_df, depot_lat, depot_lon


def _serialize_plan(plan: dict) -> dict:
    """Convierte numpy types a tipos JSON-friendly."""
    def _coerce(v):
        # Booleanos PRIMERO: en numpy 1.x np.bool_ no es subclase de np.integer,
        # pero en numpy 2.x sí lo es (y un check de np.integer convertiría True
        # a 1). Manejarlo antes garantiza que el bool sigue siendo bool en el
        # JSON. Importante: el bug histórico "'numpy.bool' object is not
        # iterable" en FastAPI venía exactamente de esta omisión.
        if isinstance(v, (bool, np.bool_)):
            return bool(v)
        if isinstance(v, np.integer):
            return int(v)
        if isinstance(v, np.floating):
            return float(v)
        if isinstance(v, np.ndarray):
            return v.tolist()
        if isinstance(v, dict):
            return {k: _coerce(x) for k, x in v.items()}
        if isinstance(v, list):
            return [_coerce(x) for x in v]
        return v

    return _coerce(plan)


# ─── Endpoints ───────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "OpenRoute Optimizer API",
        "version": app.version,
        "default_vehicles_dataset_exists": os.path.exists(_default_vehicles_path()),
    }


@app.post("/optimize")
def optimize(req: OptimizeRequest):
    """
    Ejecuta el motor de optimización elegido sobre los pedidos y vehículos
    proporcionados, y devuelve el plan resultante en el esquema unificado
    del backend (ver docs/BACKEND_INTEGRATION.md).
    """
    orders_df, vehicles_df, depot_lat, depot_lon = _build_dataframes(req)

    processor = DataProcessor()
    dist_matrix, time_matrix = processor.build_distance_matrix(depot_lat, depot_lon, orders_df)

    try:
        optimizer = RouteOptimizerFactory.get_optimizer(req.mode)
        plan = optimizer.optimize(orders_df, vehicles_df, dist_matrix, time_matrix)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error optimizando: {e}")

    return _serialize_plan(plan)


@app.post("/baseline")
def baseline(req: OptimizeRequest):
    """
    Simula un plan manual usando las heurísticas humanas (vecino cercano +
    urgencia + carga pesada). Útil como referencia para medir el impacto.
    """
    orders_df, vehicles_df, depot_lat, depot_lon = _build_dataframes(req)

    processor = DataProcessor()
    dist_matrix, time_matrix = processor.build_distance_matrix(depot_lat, depot_lon, orders_df)

    metrics = MetricsEngine()
    try:
        baseline_plan = metrics.simulate_manual_baseline(orders_df, vehicles_df, dist_matrix, time_matrix)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error simulando baseline: {e}")

    return _serialize_plan(baseline_plan)


@app.post("/compare")
def compare(req: OptimizeRequest):
    """
    Ejecuta baseline + optimizador en un solo paso y devuelve los dos planes
    junto con el cuadro de ahorros. Ideal para que el chatbot pueda explicar
    el impacto en una sola llamada HTTP.
    """
    orders_df, vehicles_df, depot_lat, depot_lon = _build_dataframes(req)

    processor = DataProcessor()
    dist_matrix, time_matrix = processor.build_distance_matrix(depot_lat, depot_lon, orders_df)

    metrics = MetricsEngine()
    try:
        baseline_plan = metrics.simulate_manual_baseline(orders_df, vehicles_df, dist_matrix, time_matrix)
        optimizer = RouteOptimizerFactory.get_optimizer(req.mode)
        optimized_plan = optimizer.optimize(orders_df, vehicles_df, dist_matrix, time_matrix)
        savings = metrics.compare_plans(baseline_plan, optimized_plan)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en compare: {e}")

    # used_fallback en el top-level del response permite que el cliente lo lea
    # sin tener que mirar dentro de "optimized" — útil para el chatbot/UI que
    # debe advertir cuando el resultado NO viene del solver industrial.
    return _serialize_plan({
        "baseline": baseline_plan,
        "optimized": optimized_plan,
        "savings": savings,
        "used_fallback": bool(optimized_plan.get("used_fallback", False)),
        "fallback_reason": optimized_plan.get("fallback_reason"),
    })


# ─── Endpoint CSV (sin DB) ────────────────────────────────────────────
#
# Caso de uso TRL5: una pyme con su propio CSV de pedidos quiere ver, antes
# de tocar ningún sistema, qué rutas saldrían con OR-Tools y cuánto se
# ahorraría vs un reparto manual. Esto NO toca la base de datos del frontend.
#
# Acepta uno o varios CSV en la misma llamada:
#   - 1 CSV  → devuelve solo el plan individual.
#   - 2+ CSV → devuelve cada plan individual + un plan combinado (todos los
#              pedidos como una sola jornada). Permite medir el ahorro de
#              consolidar varios turnos/clientes/días.
#
# Los IDs de pedido se prefijan en el combinado para evitar colisiones entre
# CSVs distintos que reusen "PED-001" etc.

def _parse_use_osrm(value: str | None) -> bool | None:
    """Convierte el string del FormData en el tri-state que espera DataProcessor.

    - "true"/"yes"/"1"  → True (fuerza OSRM, error si no responde)
    - "false"/"no"/"0"  → False (fuerza Haversine, sin red)
    - None/"" /"auto"   → None (auto: OSRM si responde, fallback a Haversine)
    """
    if value is None:
        return None
    v = value.strip().lower()
    if v in {"", "auto"}:
        return None
    if v in {"true", "yes", "1", "on"}:
        return True
    if v in {"false", "no", "0", "off"}:
        return False
    raise HTTPException(
        status_code=400,
        detail=f"Valor inválido para use_osrm: {value!r}. Esperado: auto | true | false.",
    )


def _parse_bbox(value: str | None) -> tuple[float, float, float, float] | None:
    """Convierte el string del FormData en una tupla de bbox o None.

    Formatos:
      - None / "" / "default"      → None (el DataProcessor usará su default).
      - "worldwide"                 → bbox sin restricción geográfica.
      - "lat_min,lat_max,lon_min,lon_max" → tupla literal.

    Validamos pronto para devolver 400 con un mensaje útil al cliente, en lugar
    de dejar que el DataProcessor lance ValueError dentro del loop.
    """
    if value is None:
        return None
    v = value.strip().lower()
    if v in {"", "default"}:
        return None
    if v == "worldwide":
        return DataProcessor.WORLDWIDE_BBOX
    parts = [p.strip() for p in value.split(",")]
    if len(parts) != 4:
        raise HTTPException(
            status_code=400,
            detail=f"bbox inválido: {value!r}. Esperado 'lat_min,lat_max,lon_min,lon_max' o 'worldwide'.",
        )
    try:
        lat_min, lat_max, lon_min, lon_max = (float(p) for p in parts)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"bbox inválido: {value!r}. Cada componente debe ser un número.",
        )
    if lat_min >= lat_max or lon_min >= lon_max:
        raise HTTPException(
            status_code=400,
            detail=f"bbox inválido: {value!r}. Cada *_min debe ser menor que su *_max.",
        )
    return (lat_min, lat_max, lon_min, lon_max)


def _process_single_csv(
    raw_df: pd.DataFrame,
    vehicles_df: pd.DataFrame,
    depot_lat: float,
    depot_lon: float,
    mode: str,
    use_osrm: bool | None,
    bbox: tuple[float, float, float, float] | None,
) -> dict:
    """Valida un DataFrame de pedidos, lo optimiza y devuelve el bloque de resultados.

    Se separa del endpoint para poder reusarse tanto en el procesado individual
    como en el combinado (concat de varios CSVs).
    """
    processor = DataProcessor(bbox=bbox)
    rows_raw = len(raw_df)
    try:
        orders_df = processor.validate_orders(raw_df)
    except ValueError as e:
        # Falta una columna obligatoria u otra validación dura del schema.
        raise HTTPException(status_code=400, detail=f"CSV inválido: {e}")

    rows_loaded = len(orders_df)
    if rows_loaded == 0:
        lat_min, lat_max, lon_min, lon_max = processor.bbox
        raise HTTPException(
            status_code=400,
            detail=(
                "Ninguna fila pasó la validación. Causas frecuentes: "
                f"lat/lon fuera del bbox configurado ({lat_min}..{lat_max}, {lon_min}..{lon_max}) "
                "o columnas obligatorias nulas. Si tu zona no es Alicante/Elche, "
                "amplía el bbox vía OPENROUTE_BBOX o pasa bbox=worldwide en la petición."
            ),
        )

    dist_matrix, time_matrix = processor.build_distance_matrix(
        depot_lat, depot_lon, orders_df, use_osrm=use_osrm
    )
    matrix_source = getattr(processor, "last_matrix_source", "unknown")

    metrics = MetricsEngine()
    baseline_plan = metrics.simulate_manual_baseline(orders_df, vehicles_df, dist_matrix, time_matrix)
    optimizer = RouteOptimizerFactory.get_optimizer(mode)
    optimized_plan = optimizer.optimize(orders_df, vehicles_df, dist_matrix, time_matrix)
    savings = metrics.compare_plans(baseline_plan, optimized_plan)

    return {
        "rows_raw": rows_raw,
        "rows_loaded": rows_loaded,
        "rows_discarded": rows_raw - rows_loaded,
        "matrix_source": matrix_source,
        "baseline": baseline_plan,
        "optimized": optimized_plan,
        "savings": savings,
        "used_fallback": bool(optimized_plan.get("used_fallback", False)),
        "fallback_reason": optimized_plan.get("fallback_reason"),
        "pedidos_diferidos": optimized_plan.get("pedidos_diferidos", []),
    }


@app.post("/optimize-csv")
async def optimize_csv(
    files: list[UploadFile] = File(..., description="Uno o varios CSV de pedidos."),
    mode: Literal["ortools", "heuristic"] = Form("ortools"),
    use_osrm: str | None = Form(
        None,
        description="auto (default) | true (fuerza OSRM /table) | false (Haversine, sin red)",
    ),
    bbox: str | None = Form(
        None,
        description="default | worldwide | 'lat_min,lat_max,lon_min,lon_max'. Restricción de coordenadas válidas.",
    ),
):
    """Optimiza uno o varios CSV de pedidos SIN tocar la base de datos del frontend.

    Cada CSV se procesa por separado y se devuelve su plan + comparación contra
    el baseline manual. Si se suben 2 o más CSVs, también se calcula un plan
    "combinado" tratando todos los pedidos como una sola jornada — útil para
    medir el ahorro de consolidación entre turnos/días/clientes.

    Form fields:
      files:    uno o varios CSV con las 8 columnas estándar.
      mode:     "ortools" (default, industrial) o "heuristic".
      use_osrm: "auto" (default) intenta OSRM /table y cae a Haversine si no
                responde; "true" fuerza matriz OSRM (real por calles); "false"
                fuerza Haversine (rápido pero aproximado, sin red).
      bbox:     restricción geográfica. "default" (Alicante/Elche), "worldwide"
                (sin restricción), o "lat_min,lat_max,lon_min,lon_max" para
                fijar la propia. También configurable globalmente con la env
                var OPENROUTE_BBOX.
    """
    if not files:
        raise HTTPException(status_code=400, detail="Hay que subir al menos un CSV")

    use_osrm_flag = _parse_use_osrm(use_osrm)
    bbox_tuple = _parse_bbox(bbox)

    processor = DataProcessor(bbox=bbox_tuple)
    try:
        vehicles_df = processor.load_vehicles(_default_vehicles_path())
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo cargar la flota por defecto ({_default_vehicles_path()}): {e}",
        )
    depot_lat = float(vehicles_df.loc[0, "deposito_lat"])
    depot_lon = float(vehicles_df.loc[0, "deposito_lon"])

    individual: list[dict] = []
    valid_dfs: list[pd.DataFrame] = []
    valid_filenames: list[str] = []

    for upload in files:
        filename = upload.filename or "sin-nombre.csv"
        content = await upload.read()
        if not content:
            individual.append({"filename": filename, "error": "Archivo vacío"})
            continue
        try:
            raw_df = pd.read_csv(BytesIO(content))
        except Exception as e:
            individual.append({"filename": filename, "error": f"No se pudo parsear como CSV: {e}"})
            continue

        try:
            result = _process_single_csv(
                raw_df, vehicles_df, depot_lat, depot_lon, mode, use_osrm_flag, bbox_tuple
            )
        except HTTPException as e:
            individual.append({"filename": filename, "error": e.detail})
            continue
        except Exception as e:
            individual.append({"filename": filename, "error": f"Error optimizando: {e}"})
            continue

        result["filename"] = filename
        individual.append(result)

        # Reservamos el dataframe validado para el análisis combinado.
        # Re-validamos para tener las columnas calculadas (minutos_inicio/fin) listas.
        valid_dfs.append(processor.validate_orders(raw_df))
        valid_filenames.append(filename)

    # Análisis combinado solo tiene sentido con 2+ CSVs válidos. Si solo hay
    # uno, devolvemos individual y combined=null.
    combined: dict | None = None
    if len(valid_dfs) >= 2:
        # Prefijamos id_pedido con el índice del fichero para evitar colisiones
        # cuando dos CSVs distintos reusan "PED-001".
        prefixed = []
        for idx, df in enumerate(valid_dfs):
            df2 = df.copy()
            df2["id_pedido"] = df2["id_pedido"].astype(str).map(lambda x, i=idx: f"F{i+1}_{x}")
            prefixed.append(df2)
        merged = pd.concat(prefixed, ignore_index=True)

        dist_matrix, time_matrix = processor.build_distance_matrix(
            depot_lat, depot_lon, merged, use_osrm=use_osrm_flag
        )
        combined_matrix_source = getattr(processor, "last_matrix_source", "unknown")
        metrics = MetricsEngine()
        baseline_plan = metrics.simulate_manual_baseline(merged, vehicles_df, dist_matrix, time_matrix)
        optimizer = RouteOptimizerFactory.get_optimizer(mode)
        optimized_plan = optimizer.optimize(merged, vehicles_df, dist_matrix, time_matrix)
        savings = metrics.compare_plans(baseline_plan, optimized_plan)

        combined = {
            "files": valid_filenames,
            "total_rows": len(merged),
            "matrix_source": combined_matrix_source,
            "baseline": baseline_plan,
            "optimized": optimized_plan,
            "savings": savings,
            "used_fallback": bool(optimized_plan.get("used_fallback", False)),
            "fallback_reason": optimized_plan.get("fallback_reason"),
            "pedidos_diferidos": optimized_plan.get("pedidos_diferidos", []),
        }

    return _serialize_plan({
        "mode": mode,
        "use_osrm_requested": use_osrm,
        "bbox_used": list(processor.bbox),
        "individual": individual,
        "combined": combined,
    })
