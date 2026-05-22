import folium
import pandas as pd
import streamlit as st
from streamlit_folium import st_folium

st.set_page_config(
    page_title="OpenRoutePyME",
    page_icon="🚚",
    layout="wide",
)

st.title("🚚 OpenRoutePyME")
st.caption("Planificación logística abierta para pymes · Zona Elche / Alicante")

st.divider()

# ---------------------------------------------------------------------------
# Datos de ejemplo para desarrollo (se eliminan cuando Samuel entregue el CSV)
# ---------------------------------------------------------------------------
DEMO_DATA = {
    "id_pedido":     ["PED-001", "PED-002", "PED-003", "PED-004", "PED-005"],
    "cliente":       ["Suministros Pérez", "Taller Mecánico Elche", "Distribuciones García", "Almacenes Martínez", "Ferretería La Industrial"],
    "lat":           [38.2712, 38.2891, 38.3042, 38.2634, 38.2954],
    "lon":           [-0.7023, -0.6812, -0.6543, -0.6987, -0.7134],
    "prioridad":     ["Media", "Baja", "Alta", "Media", "Baja"],
    "peso":          [45, 120, 33, 78, 55],
    "franja_inicio": ["08:00", "09:00", "08:30", "10:00", "11:00"],
    "franja_fin":    ["10:00", "11:00", "10:30", "13:00", "13:00"],
}

COLOR_PRIORIDAD = {
    "Alta":  "red",
    "Media": "orange",
    "Baja":  "green",
}

DEPOT_LAT = 38.2669
DEPOT_LON = -0.6985


def cargar_demo() -> pd.DataFrame:
    return pd.DataFrame(DEMO_DATA)


# ---------------------------------------------------------------------------
# Carga del archivo o modo demo
# ---------------------------------------------------------------------------
archivo = st.file_uploader(
    "Sube tu archivo de pedidos (CSV separado por punto y coma)",
    type=["csv"],
)

if archivo is not None:
    try:
        df = pd.read_csv(archivo, sep=";", encoding="utf-8")
    except Exception as e:
        st.error(f"No se pudo leer el archivo: {e}")
        st.stop()

    columnas_requeridas = {"id_pedido", "cliente", "lat", "lon", "prioridad", "peso", "franja_inicio", "franja_fin"}
    if not columnas_requeridas.issubset(df.columns):
        st.error(f"Faltan columnas en el CSV: {columnas_requeridas - set(df.columns)}")
        st.stop()

    st.success(f"**{len(df)} pedidos cargados** desde `{archivo.name}`")

else:
    st.warning("No hay archivo cargado.")
    if st.button("Usar datos de ejemplo (modo desarrollo)"):
        st.session_state["usar_demo"] = True

    if not st.session_state.get("usar_demo"):
        st.stop()

    df = cargar_demo()
    st.info(f"Mostrando **{len(df)} pedidos de ejemplo**. Sustituye por el CSV real cuando esté disponible.")

# ---------------------------------------------------------------------------
# Tabla de datos
# ---------------------------------------------------------------------------
with st.expander("Ver datos cargados", expanded=False):
    st.dataframe(df, use_container_width=True, height=300)

st.divider()

# ---------------------------------------------------------------------------
# Mapa Folium
# ---------------------------------------------------------------------------
def construir_mapa(df: pd.DataFrame) -> folium.Map:
    mapa = folium.Map(
        location=[df["lat"].mean(), df["lon"].mean()],
        zoom_start=13,
        tiles="CartoDB positron",
    )

    # Depósito de salida
    folium.Marker(
        location=[DEPOT_LAT, DEPOT_LON],
        icon=folium.Icon(color="black", icon="home", prefix="fa"),
        popup=folium.Popup("<b>Depósito central</b>", max_width=200),
        tooltip="Depósito central",
    ).add_to(mapa)

    # Un marcador por pedido
    for _, row in df.iterrows():
        color = COLOR_PRIORIDAD.get(row["prioridad"], "blue")
        popup_html = f"""
            <b>{row['id_pedido']}</b><br>
            {row['cliente']}<br>
            <hr style='margin:4px 0'>
            Prioridad: <b>{row['prioridad']}</b><br>
            Peso: {row['peso']} kg<br>
            Franja: {row['franja_inicio']} – {row['franja_fin']}
        """
        folium.CircleMarker(
            location=[row["lat"], row["lon"]],
            radius=9,
            color=color,
            fill=True,
            fill_color=color,
            fill_opacity=0.8,
            tooltip=f"{row['id_pedido']} · {row['cliente']}",
            popup=folium.Popup(popup_html, max_width=220),
        ).add_to(mapa)

    # PLACEHOLDER ruta — se reemplazará cuando Samuel entregue el optimizador
    # folium.PolyLine(coordenadas_ruta, color="blue", weight=3).add_to(mapa)

    return mapa


# ---------------------------------------------------------------------------
# Layout principal
# ---------------------------------------------------------------------------
col_mapa, col_panel = st.columns([3, 2])

with col_mapa:
    st.subheader("Mapa de pedidos")
    st.caption("🔴 Alta · 🟠 Media · 🟢 Baja · 🏠 Depósito  — haz clic en un pin para ver el detalle")
    st_folium(construir_mapa(df), width=700, height=500, returned_objects=[])

with col_panel:
    st.subheader("Explicación de la IA")
    st.caption("Aquí aparecerá el análisis generado por el modelo de lenguaje.")
    # PLACEHOLDER — se reemplazará en el Paso 3 con el output de Juan David
    st.info(
        "Una vez optimizadas las rutas, la IA explicará aquí el ahorro "
        "conseguido respecto a la planificación manual, apoyándose en "
        "datos numéricos concretos."
    )
