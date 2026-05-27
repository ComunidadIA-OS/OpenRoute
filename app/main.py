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
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
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
    lat: float = Field(..., ge=37.5, le=39.5, description="Latitud (Alicante/Elche)")
    lon: float = Field(..., ge=-1.5, le=0.5, description="Longitud (Alicante/Elche)")
    prioridad: int = Field(1, ge=1, le=3, description="1=alta, 2=media, 3=baja")
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
    version="0.1.0",
)

# CORS abierto en dev para que el frontend Next.js pueda llamar desde el browser.
# En producción, restringir al origin del frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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

    return _serialize_plan({
        "baseline": baseline_plan,
        "optimized": optimized_plan,
        "savings": savings,
    })
