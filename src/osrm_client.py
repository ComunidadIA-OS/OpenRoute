"""Cliente OSRM /table para calcular matrices reales de distancia/tiempo por
callejero, no por línea recta.

Por qué importa: la heurística de Haversine × 1.3 (el modo previo) es una
aproximación geodésica que ignora sentidos únicos, zonas peatonales, ríos,
puentes y autopistas obligatorias. En ciudad real eso puede sesgar la matriz
un 10–30% por par, y el solver optimiza sobre la matriz, no sobre las calles.
OSRM /table devuelve la matriz tal y como conduciría el repartidor real.

Patrón espejo del cliente TS en web/src/lib/osrm.ts:
  - mismo OSRM_BASE_URL configurable por entorno,
  - mismo coords-to-path (lon,lat — no lat,lon — convención OSRM),
  - caché en memoria por hash de coordenadas (5 decimales ≈ 1 metro).

Variables de entorno:
  OSRM_BASE_URL          (default: https://router.project-osrm.org)
  OSRM_TIMEOUT           (default: 30, segundos)
  OPENROUTE_DISABLE_OSRM (si "1" o "true", desactiva el cliente globalmente)

Para datasets >100 puntos OSRM público devuelve 400 ("too many"). En ese caso
hay que partir en sub-matrices o auto-hospedar OSRM — pendiente para el roadmap.
"""

from __future__ import annotations

import os
from typing import Sequence

import numpy as np
import requests


class OSRMClientError(RuntimeError):
    """OSRM /table no respondió o devolvió algo inutilizable."""


def is_disabled() -> bool:
    """True si la env var OPENROUTE_DISABLE_OSRM está activa.

    Útil para tests CI sin red, o cuando el usuario explícitamente quiere el
    modo Haversine determinista.
    """
    v = os.getenv("OPENROUTE_DISABLE_OSRM", "").strip().lower()
    return v in {"1", "true", "yes"}


class OSRMTableClient:
    """Wrapper sobre OSRM /table con caché en memoria."""

    def __init__(self, base_url: str | None = None, timeout: float | None = None):
        env_base = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")
        self.base_url = (base_url or env_base).rstrip("/")
        self.timeout = float(timeout if timeout is not None else os.getenv("OSRM_TIMEOUT", "30"))
        # Cache: clave = hash de coords → (dist_km, time_min)
        self._cache: dict[str, tuple[np.ndarray, np.ndarray]] = {}

    @staticmethod
    def _cache_key(coords: Sequence[tuple[float, float]]) -> str:
        # 5 decimales ≈ 1.1 metros. Suficiente para nuestro caso (depósito + pedidos
        # geocodificados con precisión de calle).
        return "|".join(f"{lat:.5f},{lon:.5f}" for lat, lon in coords)

    def table(
        self, coords: Sequence[tuple[float, float]]
    ) -> tuple[np.ndarray, np.ndarray]:
        """Devuelve (dist_matrix_km, time_matrix_min) usando OSRM /table.

        Lanza OSRMClientError si OSRM no responde, devuelve un código != Ok, o
        la matriz no tiene dimensiones (n, n). El llamador debe decidir si
        propagar el error o caer a Haversine como fallback.
        """
        if len(coords) < 2:
            raise OSRMClientError("Se necesitan al menos 2 coordenadas")

        key = self._cache_key(coords)
        if key in self._cache:
            return self._cache[key]

        # OSRM espera lon,lat (en este orden, NO lat,lon — error frecuente).
        path = ";".join(f"{lon},{lat}" for lat, lon in coords)
        url = f"{self.base_url}/table/v1/driving/{path}?annotations=duration,distance"

        try:
            r = requests.get(
                url,
                timeout=self.timeout,
                headers={"User-Agent": "OpenRoute/0.2"},
            )
        except requests.RequestException as e:
            raise OSRMClientError(f"No se pudo contactar con OSRM: {e}") from e

        if r.status_code != 200:
            # 400 con "Too many" es típico cuando se exceden 100 puntos en OSRM público.
            snippet = r.text[:200] if r.text else ""
            raise OSRMClientError(f"OSRM /table HTTP {r.status_code}: {snippet}")

        try:
            data = r.json()
        except ValueError as e:
            raise OSRMClientError(f"OSRM /table devolvió JSON inválido: {e}") from e

        if data.get("code") != "Ok":
            raise OSRMClientError(
                f"OSRM /table código={data.get('code')} mensaje={data.get('message', '')}"
            )

        durations = data.get("durations")
        distances = data.get("distances")
        if durations is None or distances is None:
            raise OSRMClientError("OSRM /table: faltan durations o distances")

        n = len(coords)
        # OSRM: durations en segundos, distances en metros. El motor opera en
        # minutos y kilómetros, así que convertimos aquí, una vez.
        try:
            time_min = np.array(durations, dtype=float) / 60.0
            dist_km = np.array(distances, dtype=float) / 1000.0
        except Exception as e:
            raise OSRMClientError(f"OSRM /table: no se pudo parsear la matriz: {e}") from e

        if dist_km.shape != (n, n) or time_min.shape != (n, n):
            raise OSRMClientError(
                f"OSRM /table: dimensiones inesperadas dist={dist_km.shape} time={time_min.shape}, esperaba ({n},{n})"
            )

        # OSRM devuelve None (→ NaN en numpy) cuando dos puntos no están
        # conectados por calle navegable. Lo convertimos a infinito para que el
        # solver lo evite naturalmente sin meter heurística adicional.
        dist_km = np.where(np.isnan(dist_km), np.inf, dist_km)
        time_min = np.where(np.isnan(time_min), np.inf, time_min)

        self._cache[key] = (dist_km, time_min)
        return dist_km, time_min


# Cliente compartido por proceso. Lo crean perezosamente las funciones que lo
# necesitan (DataProcessor.build_distance_matrix) para no inicializar requests
# en imports si no se va a usar.
_default_client: OSRMTableClient | None = None


def get_default_client() -> OSRMTableClient:
    global _default_client
    if _default_client is None:
        _default_client = OSRMTableClient()
    return _default_client
