"""
OpenRoute — Panel Streamlit del gestor de flota.

Esta aplicación carga el dataset de pedidos y la configuración de flota,
ejecuta el motor de optimización dual (heurística propia + Google OR-Tools)
con la baseline manual, y muestra:

  - Tabla de pedidos cargados.
  - Mapa interactivo con depósito y paradas.
  - Cuadro comparativo de ahorros (km, €, CO2, retrasos, sobrecargas).
  - Informe explicativo en lenguaje natural generado por el asistente IA
    (Ollama local, con motor de plantillas como respaldo).

Cómo arrancar:
    streamlit run app/main.py

Datos por defecto:
    data/pedidos_ejemplo.csv          (30 pedidos en Elche+Alicante)
    data/vehiculos_config.json        (3 furgonetas: eléctrica, diésel, apoyo)
"""

import os
import sys

# Permitir importar desde el paquete src/ sin instalarlo
HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, os.pardir))
SRC_PATH = os.path.join(REPO_ROOT, "src")
if SRC_PATH not in sys.path:
    sys.path.insert(0, SRC_PATH)

import folium
import pandas as pd
import streamlit as st
from streamlit_folium import st_folium

from data_processor import DataProcessor
from metrics import MetricsEngine
from optimizer import RouteOptimizerFactory
from ai_assistant import AIAssistant


# ─── Configuración de página ─────────────────────────────────────────
st.set_page_config(
    page_title="OpenRoute · Panel de Optimización",
    page_icon="🚚",
    layout="wide",
)


# ─── Rutas a los datasets ────────────────────────────────────────────
ORDERS_PATH = os.path.join(REPO_ROOT, "data", "pedidos_ejemplo.csv")
VEHICLES_PATH = os.path.join(REPO_ROOT, "data", "vehiculos_config.json")


# ─── Cache de cargas y cómputos pesados ──────────────────────────────
@st.cache_data(show_spinner=False)
def load_data():
    processor = DataProcessor()
    orders_df = processor.load_orders(ORDERS_PATH)
    vehicles_df = processor.load_vehicles(VEHICLES_PATH)
    depot_lat = vehicles_df.loc[0, "deposito_lat"]
    depot_lon = vehicles_df.loc[0, "deposito_lon"]
    dist_matrix, time_matrix = processor.build_distance_matrix(
        depot_lat, depot_lon, orders_df
    )
    return orders_df, vehicles_df, dist_matrix, time_matrix, depot_lat, depot_lon


@st.cache_data(show_spinner=False)
def run_optimization(_mode: str, _ds_hash: str):
    """
    Ejecuta baseline manual + optimizador seleccionado + comparativa.
    _ds_hash invalida el caché si cambian los datos cargados.
    """
    orders_df, vehicles_df, dist_matrix, time_matrix, _, _ = load_data()
    metrics = MetricsEngine()
    baseline = metrics.simulate_manual_baseline(
        orders_df, vehicles_df, dist_matrix, time_matrix
    )
    optimizer = RouteOptimizerFactory.get_optimizer(_mode)
    optimized = optimizer.optimize(
        orders_df, vehicles_df, dist_matrix, time_matrix
    )
    savings = metrics.compare_plans(baseline, optimized)
    return baseline, optimized, savings


def colored_metric(label: str, value: str, delta: str | None = None, help_text: str | None = None):
    st.metric(label, value, delta=delta, help=help_text)


# ─── Cabecera ────────────────────────────────────────────────────────
st.title("🚚 OpenRoute — Panel del Gestor de Flota")
st.caption(
    "Optimización VRP con OR-Tools · Comparativa con plan manual · "
    "Explicación en lenguaje natural con LLM local (Ollama)."
)

with st.expander("ℹ️ ¿Qué hace esta pantalla?", expanded=False):
    st.markdown(
        """
        Esta aplicación demuestra el **motor de optimización** del backend
        de OpenRoute. Carga los pedidos y la flota, ejecuta el solver
        elegido (heurística propia o Google OR-Tools), lo compara contra
        un plan manual heurístico (vecino más cercano + urgencia + carga
        pesada) y produce un informe operativo para el gestor.

        Es **complementaria** al frontend conversacional (`web/`), donde
        un chatbot LLM permite operar el sistema en lenguaje natural.
        """
    )


# ─── Carga inicial de datos ──────────────────────────────────────────
try:
    orders_df, vehicles_df, dist_matrix, time_matrix, depot_lat, depot_lon = load_data()
except FileNotFoundError as e:
    st.error(f"No se pueden cargar los datos: {e}")
    st.stop()
except Exception as e:
    st.error(f"Error cargando datos: {e}")
    st.stop()


# ─── Controles laterales ─────────────────────────────────────────────
with st.sidebar:
    st.header("⚙️ Configuración")
    mode_label = st.radio(
        "Motor de optimización",
        ["Google OR-Tools (industrial)", "Heurística propia (académica)"],
        index=0,
        help=(
            "OR-Tools: solver CVRPTW con time windows y capacidades. "
            "Heurística: K-Means + Vecino Más Cercano Ponderado por prioridad."
        ),
    )
    mode = "ortools" if mode_label.startswith("Google") else "heuristic"

    st.markdown("---")
    st.markdown("**Dataset cargado**")
    st.markdown(f"- Pedidos: **{len(orders_df)}**")
    st.markdown(f"- Vehículos: **{len(vehicles_df)}**")
    st.markdown(f"- Depósito: `{depot_lat:.4f}, {depot_lon:.4f}`")

    st.markdown("---")
    st.markdown(
        "Datos en `data/pedidos_ejemplo.csv` y `data/vehiculos_config.json`. "
        "Para usar tu propio dataset, sustituye esos archivos."
    )


# ─── Ejecutar optimización ───────────────────────────────────────────
with st.spinner(f"Ejecutando baseline manual + {mode_label}..."):
    baseline, optimized, savings = run_optimization(mode, _ds_hash=str(len(orders_df)))


# ─── Cuadro de impacto ──────────────────────────────────────────────
st.subheader("📊 Impacto del optimizador frente al plan manual")
c1, c2, c3, c4 = st.columns(4)
with c1:
    colored_metric(
        "Distancia",
        f"{optimized['distancia_total_km']:.1f} km",
        f"−{savings['ahorro_distancia_km']:.1f} km ({savings['ahorro_distancia_pct']:.1f}%)",
        help_text=f"Plan manual: {baseline['distancia_total_km']:.1f} km",
    )
with c2:
    colored_metric(
        "Coste",
        f"{optimized['coste_total_euros']:.2f} €",
        f"−{savings['ahorro_coste_euros']:.2f} € ({savings['ahorro_coste_pct']:.1f}%)",
        help_text=f"Plan manual: {baseline['coste_total_euros']:.2f} €",
    )
with c3:
    colored_metric(
        "CO₂",
        f"{optimized['co2_total_kg']:.1f} kg",
        f"−{savings['ahorro_co2_kg']:.1f} kg ({savings['ahorro_co2_pct']:.1f}%)",
        help_text=f"Plan manual: {baseline['co2_total_kg']:.1f} kg",
    )
with c4:
    colored_metric(
        "Retrasos",
        f"{optimized['pedidos_retrasados']} / {len(orders_df)}",
        f"−{savings['retrasos_evitados']} a tiempo",
        help_text=f"Plan manual: {baseline['pedidos_retrasados']} retrasados",
    )

with st.expander("Detalle por vehículo", expanded=False):
    rows = []
    for r in optimized["rutas"]:
        rows.append(
            {
                "Vehículo": f"{r['nombre_vehiculo']} ({r['id_vehiculo']})",
                "Paradas": len(r["detalle_paradas"]),
                "Distancia (km)": round(r["distancia_km"], 1),
                "Coste (€)": round(r["coste_euros"], 2),
                "CO₂ (kg)": round(r["co2_emissions_kg"], 1),
                "Carga (kg)": round(r["carga_total_kg"], 1),
            }
        )
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)


# ─── Layout principal: tabla + mapa ──────────────────────────────────
st.subheader("🗺️ Plan de ruta optimizado")
left, right = st.columns([3, 2])

with left:
    # Mapa Folium con depósito + paradas coloreadas por vehículo
    fmap = folium.Map(location=[depot_lat, depot_lon], zoom_start=11, tiles="OpenStreetMap")

    folium.Marker(
        [depot_lat, depot_lon],
        popup="Depósito central",
        icon=folium.Icon(color="black", icon="industry", prefix="fa"),
    ).add_to(fmap)

    palette = ["#1a531a", "#0d4f8a", "#a83232", "#7a3f9c", "#c46b00", "#005f73"]
    for idx, r in enumerate(optimized["rutas"]):
        color = palette[idx % len(palette)]
        points = [(depot_lat, depot_lon)]
        for s in r["detalle_paradas"]:
            stop_row = orders_df[orders_df["id_pedido"] == s["id_pedido"]].iloc[0]
            lat, lon = stop_row["lat"], stop_row["lon"]
            points.append((lat, lon))
            popup_html = (
                f"<b>{s['id_pedido']}</b> &mdash; {s['cliente']}<br>"
                f"Vehículo: {r['id_vehiculo']}<br>"
                f"Hora llegada: {s['hora_llegada']}<br>"
                f"Ventana: {s['ventana']}<br>"
                f"Peso: {s['peso_kg']} kg · Prioridad: {s['prioridad']}"
            )
            folium.CircleMarker(
                [lat, lon],
                radius=8,
                color=color,
                fill=True,
                fill_opacity=0.85,
                popup=folium.Popup(popup_html, max_width=300),
                tooltip=f"{s['id_pedido']} · {s['hora_llegada']}",
            ).add_to(fmap)
        points.append((depot_lat, depot_lon))
        folium.PolyLine(points, color=color, weight=3, opacity=0.7).add_to(fmap)

    st_folium(fmap, width=None, height=520, returned_objects=[])

with right:
    st.markdown("**Pedidos cargados**")
    display_df = orders_df[
        ["id_pedido", "cliente", "prioridad", "peso_kg", "franja_inicio", "franja_fin"]
    ].rename(
        columns={
            "id_pedido": "Código",
            "cliente": "Cliente",
            "prioridad": "Prio.",
            "peso_kg": "Peso (kg)",
            "franja_inicio": "Desde",
            "franja_fin": "Hasta",
        }
    )
    st.dataframe(display_df, use_container_width=True, hide_index=True, height=520)


# ─── Informe en lenguaje natural ─────────────────────────────────────
st.subheader("🤖 Informe ejecutivo del asistente IA")

if st.button("Generar informe", type="primary"):
    with st.spinner("Generando informe con Ollama local (o motor de plantillas si Ollama no responde)..."):
        try:
            ai = AIAssistant()
            report = ai.generate_explanation(optimized, savings)
            st.markdown(report)
        except Exception as e:
            st.error(f"Error generando informe: {e}")
else:
    st.info(
        "Pulsa **Generar informe** para obtener un análisis en lenguaje natural "
        "con el LLM local. Si Ollama no responde, cae al motor de plantillas heurísticas."
    )

st.markdown("---")
st.caption(
    "OpenRoute · backend Python + frontend `web/` (Next.js) · "
    "Hackathon IA Responsable y Abierta · Mayo 2026"
)
