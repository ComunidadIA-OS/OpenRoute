import os
import json
import requests


class OllamaClient:
    """Cliente fino sobre la API HTTP de Ollama (POST /api/chat).

    Configurable vía variables de entorno:
      OLLAMA_BASE_URL  (default: http://localhost:11434)
      OLLAMA_MODEL     (default: llama3.1:8b)
    """

    def __init__(self, base_url=None, model=None, timeout=120):
        self.base_url = base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.model = model or os.getenv("OLLAMA_MODEL", "llama3.1:8b")
        self.timeout = timeout

    def ping(self) -> bool:
        """Verifica que Ollama responde y que el modelo está disponible."""
        try:
            r = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if r.status_code != 200:
                return False
            models = [m.get("name") for m in r.json().get("models", [])]
            return any(self.model in (m or "") for m in models)
        except Exception:
            return False

    def generate(self, prompt: str, temperature: float = 0.3) -> str:
        """Llama al modelo en modo non-streaming y devuelve el texto."""
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_ctx": 4096,
            },
            "keep_alive": "30m",
        }
        r = requests.post(
            f"{self.base_url}/api/chat",
            json=payload,
            timeout=self.timeout,
        )
        r.raise_for_status()
        data = r.json()
        return data["message"]["content"]


class AIAssistant:
    """
    Módulo para generar resúmenes ejecutivos y explicaciones en lenguaje natural.
    Combina los resultados cuantitativos del optimizador con explicaciones cualitativas
    diseñadas para un gestor de PYME.

    Estrategia:
      1. Intenta usar Ollama local (LLM open source). Si el modelo responde, se usa.
      2. Si Ollama no está disponible o falla, cae al motor de plantillas heurísticas
         locales (sin LLM, basado en reglas).

    Mismo modelo y endpoint que utiliza el frontend Next.js, manteniendo el
    sistema con un único LLM open source y sin dependencias propietarias.
    """

    def __init__(self, base_url=None, model=None):
        self.client = OllamaClient(base_url=base_url, model=model)
        self._llm_available = self.client.ping()
        if not self._llm_available:
            print(
                "Advertencia: Ollama no responde o el modelo no está disponible. "
                "Se usará el motor local de plantillas para generar el informe."
            )

    def generate_explanation(self, optimized_res, comparison_res=None):
        """
        Genera el informe explicativo en lenguaje natural.
        Si Ollama está disponible, genera una respuesta inteligente y fluida.
        Si no, recurre al motor de plantillas heurísticas locales de alta fidelidad.
        """
        summary_data = self._build_summary_context(optimized_res, comparison_res)

        if self._llm_available:
            try:
                return self._call_llm(summary_data)
            except Exception as e:
                print(f"Error en llamada a Ollama: {e}. Activando motor de reglas local.")

        return self._generate_local_explanation(summary_data)

    def _build_summary_context(self, optimized, comparison):
        """
        Filtra y organiza la información en un formato condensado apto para el prompt o la plantilla.
        """
        vehicles_info = []
        for r in optimized['rutas']:
            stops = []
            for s in r['detalle_paradas']:
                stops.append({
                    'id': s['id_pedido'],
                    'cliente': s['cliente'],
                    'prioridad': s['prioridad'],
                    'peso': s['peso_kg'],
                    'hora': s['hora_llegada'],
                    'retrasado': s['retrasado'],
                    'ventana': s['ventana']
                })
            vehicles_info.append({
                'vehiculo': r['id_vehiculo'],
                'nombre': r['nombre_vehiculo'],
                'km': round(r['distancia_km'], 1),
                'coste': round(r['coste_euros'], 2),
                'co2_kg': round(r['co2_emissions_kg'], 1),
                'carga_kg': round(r['carga_total_kg'], 1),
                'paradas': len(stops),
                'detalles': stops
            })

        context = {
            'tipo_algoritmo': optimized['tipo_planificacion'],
            'total_km': round(optimized['distancia_total_km'], 1),
            'total_euros': round(optimized['coste_total_euros'], 2),
            'total_co2': round(optimized['co2_total_kg'], 1),
            'retrasados': optimized['pedidos_retrasados'],
            'vehiculos': vehicles_info
        }

        if comparison:
            context['comparativa'] = {
                'km_ahorrados': round(comparison['ahorro_distancia_km'], 1),
                'km_ahorrados_pct': round(comparison['ahorro_distancia_pct'], 1),
                'euros_ahorrados': round(comparison['ahorro_coste_euros'], 2),
                'euros_ahorrados_pct': round(comparison['ahorro_coste_pct'], 1),
                'co2_ahorrado': round(comparison['ahorro_co2_kg'], 1),
                'retrasos_evitados': comparison['retrasos_evitados'],
                'sobrecargas_evitadas': comparison['sobrecargas_evitadas']
            }

        return context

    def _call_llm(self, data):
        """
        Construye el prompt de ingeniería y llama a Ollama.
        """
        prompt = f"""
Actúa como un experto analista logístico y de operaciones para pequeñas y medianas empresas (PYMEs).
Tu objetivo es analizar los resultados del optimizador de rutas de OpenRoute y redactar un informe claro, dinámico y motivante para el gerente de la empresa.

Aquí están los datos consolidados del plan de reparto optimizado:
{json.dumps(data, indent=2, ensure_ascii=False)}

Por favor, estructura tu respuesta en markdown con las siguientes secciones:
1. 📈 **Análisis Ejecutivo:** Resume los ahorros logrados (kilómetros, costes en euros y CO2) si comparativa está disponible. Usa porcentajes destacados.
2. 🚛 **Estrategia de Reparto Propuesta:** Explica en palabras sencillas cómo el algoritmo organizó la flota (por ejemplo, si agrupó por cercanía geográfica, si asignó los vehículos eléctricos a distancias cortas y diésel a Alicante, etc.).
3. ⚠️ **Alertas Operativas y Compromisos:** Identifica si hay algún pedido con retraso estimado o si algún vehículo trabaja al límite de capacidad. Explica por qué ocurrió (por ejemplo, ventanas horarias muy estrechas o pedidos críticos acumulados) y qué decisión operativa sugerirías (e.g., llamar al cliente o adelantar el horario de salida).
4. 💡 **Recomendación de Impacto:** Dale un consejo clave no evidente al gestor para mejorar su operación futura basado en estos números.

Sé profesional, conciso y cercano. Evita tecnicismos matemáticos innecesarios; concéntrate en el valor de negocio y la ecología urbana (Elche/Alicante).
"""
        return self.client.generate(prompt, temperature=0.3)

    def _generate_local_explanation(self, data):
        """
        Generador heurístico local basado en reglas. Produce un reporte en markdown
        de alta calidad. Los datos del informe se calculan dinámicamente a partir
        de `data`; no hay valores hardcodeados.
        """
        tipo = data['tipo_algoritmo']
        km = data['total_km']
        euros = data['total_euros']
        co2 = data['total_co2']

        # 1. Título y Cabecera de Ahorros
        report = []
        report.append(f"## 📊 Informe Operativo Inteligente (Motor Local - {tipo})\n")

        if 'comparativa' in data:
            comp = data['comparativa']
            report.append("### 📈 Análisis Ejecutivo de Impacto")
            report.append("¡La optimización inteligente ha generado un impacto masivo frente al reparto manual tradicional!")
            report.append(f"- **Reducción de trayecto:** Ahorro de **{comp['km_ahorrados']} km** (una reducción del **{comp['km_ahorrados_pct']}%**).")
            report.append(f"- **Impacto Financiero:** Ahorro directo de **{comp['euros_ahorrados']} €** (ahorro del **{comp['euros_ahorrados_pct']}%** en combustible y peajes).")
            report.append(f"- **Huella Ecológica:** Evitada la emisión de **{comp['co2_ahorrado']} kg de CO2** a la atmósfera urbana.")
            if comp['retrasos_evitados'] > 0:
                report.append(f"- **Nivel de Servicio:** Se han evitado **{comp['retrasos_evitados']} entregas tardías** que antes ocurrían en el reparto manual.")
            if comp['sobrecargas_evitadas'] > 0:
                report.append(f"- **Seguridad Flota:** Se previnieron **{comp['sobrecargas_evitadas']} incidentes de sobrecarga** física en vehículos.")
            report.append("")
        else:
            report.append("### 📈 Resumen General")
            report.append(f"El plan de ruta proyecta un recorrido total de **{km} km**, con un coste estimado de **{euros} €** y unas emisiones de **{co2} kg de CO2**.")
            report.append("")

        # 2. Análisis de Flota
        report.append("### 🚛 Estrategia de Flota Asignada")
        report.append("El motor de asignación geográfica analizó las ubicaciones y dividió las tareas de la siguiente manera:")

        for v in data['vehiculos']:
            retrasos_v = sum(1 for s in v['detalles'] if s['retrasado'])
            retrasos_text = "sin incidencias de retraso" if retrasos_v == 0 else f"con {retrasos_v} entregas al límite de tiempo"

            elche_stops = sum(1 for s in v['detalles'] if 'Elche' in s['cliente'] or 'UMH' in s['cliente'] or 'Altabix' in s['cliente'] or 'Carrús' in s['cliente'])
            alicante_stops = len(v['detalles']) - elche_stops

            if alicante_stops > elche_stops:
                zona = "Corredor Alicante (Babel/Vistahermosa/Puerto)"
            else:
                zona = "Área Metropolitana de Elche (Altabix/Centro/Sector V)"

            report.append(f"- **{v['nombre']} ({v['vehiculo']}):**")
            report.append(f"  - Recorrido: **{v['km']} km** | Coste: **{v['coste']} €** | Paradas: **{v['paradas']}**.")
            report.append(f"  - Zona Operativa Principal: *{zona}*.")
            report.append(f"  - Nivel de Carga: **{v['carga_kg']} kg** de capacidad ocupada.")
            report.append(f"  - Estado de Ventanas Horarias: *{retrasos_text}*.")

        report.append("")

        # 3. Alertas Operativas
        report.append("### ⚠️ Alertas Operativas y Compromisos")
        retrasados_list = []
        for v in data['vehiculos']:
            for s in v['detalles']:
                if s['retrasado']:
                    retrasados_list.append(f"**{s['id']}** ({s['cliente']}) asignado a **{v['vehiculo']}** (Llegada: {s['hora']} - Ventana: {s['ventana']})")

        if retrasados_list:
            report.append("Se han detectado las siguientes paradas que podrían comprometer la franja horaria establecida:")
            for item in retrasados_list:
                report.append(f"- {item}")
            report.append("\n*Análisis técnico:* La causa principal es la coincidencia de múltiples ventanas de tiempo estrechas en ubicaciones opuestas de Elche y Alicante. Para corregirlo, se recomienda:")
            report.append("1. Coordinar con los clientes señalados una ampliación de la ventana de entrega de al menos 30 minutos.")
            report.append("2. Adelantar el horario de salida del vehículo afectado en 15 minutos respecto a su horario habitual.")
        else:
            report.append("¡Excelente estado operativo! Todas las paradas se realizarán estrictamente dentro de las ventanas horarias estipuladas por los clientes. No se requiere ninguna acción de emergencia.")

        report.append("")

        # 4. Recomendación de Impacto (calculada dinámicamente a partir de los datos reales)
        report.append("### 💡 Recomendación de Impacto")
        if data['vehiculos']:
            def cost_per_km(v):
                return v['coste'] / v['km'] if v['km'] > 0 else float('inf')

            v_caro = max(data['vehiculos'], key=cost_per_km)
            v_barato = min(data['vehiculos'], key=cost_per_km)

            caro_eff = cost_per_km(v_caro)
            barato_eff = cost_per_km(v_barato)

            if v_caro['vehiculo'] != v_barato['vehiculo'] and caro_eff > barato_eff > 0:
                diferencia_eff = caro_eff - barato_eff
                # Estimación conservadora del ahorro si se transfiere ~25% de la carga
                ahorro_estimado = round(diferencia_eff * v_caro['km'] * 0.25, 2)
                pct_co2 = round((1 - barato_eff / caro_eff) * 100, 1)
                report.append(
                    f"Al analizar la eficiencia de la flota, **{v_caro['nombre']}** "
                    f"({v_caro['vehiculo']}) registra el mayor coste operativo por kilómetro "
                    f"(**{caro_eff:.2f} €/km**), mientras que **{v_barato['nombre']}** "
                    f"({v_barato['vehiculo']}) es el más eficiente (**{barato_eff:.2f} €/km**). "
                    f"Si en futuras jornadas trasferimos parte de la carga del primero al "
                    f"segundo —cuando la ruta lo permita— la PYME podría ahorrar del orden "
                    f"de **{ahorro_estimado} €** por jornada y reducir un **{pct_co2}%** "
                    f"adicional la huella de carbono por kilómetro."
                )
            else:
                report.append(
                    "La flota está operando con una eficiencia homogénea entre vehículos. "
                    "Recomendamos mantener este patrón de asignación y revisar mensualmente "
                    "el coste medio por kilómetro para detectar desviaciones."
                )
        else:
            report.append(
                "No se ha asignado ningún vehículo en esta jornada; verifica los datos de "
                "entrada antes de relanzar el optimizador."
            )

        return "\n".join(report)
