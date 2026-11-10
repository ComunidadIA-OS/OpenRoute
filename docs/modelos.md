# Conectar un modelo de IA

Abre **Ajustes → Modelos de IA**, elige un proveedor, pega tu clave y pulsa **Usar** sobre el modelo que quieras. **Probar** manda un mensaje corto para comprobar que la clave y el modelo responden.

No hace falta modelo para calcular rutas: el botón «Calcular rutas» usa solo el motor. El modelo sirve para pedir cambios hablando y para que te explique el plan.

## Qué modelo elegir

El planificador usa herramientas, así que necesita un modelo que las maneje bien.

| Proveedor | Recomendado | Notas |
|---|---|---|
| Claude | `claude-sonnet-5-5` para el día a día, `claude-opus-5-5` si quieres lo mejor | `claude-haiku-5-5` es el más barato y va bien para cambios sencillos |
| ChatGPT | Los modelos GPT de la lista que te salga con tu clave | La lista se filtra para quitar modelos de audio, imagen y embeddings |
| Gemini | Los modelos `gemini` de la lista | |
| OpenRouter | Cualquiera que admita herramientas (la lista ya viene filtrada) | Una sola clave para cientos de modelos |
| Ollama | `qwen3:8b` o `llama3.1:8b` | Gratis y privado. En CPU tarda: con `qwen3:8b`, planificar y responder lleva alrededor de un minuto. Los modelos de 3B o menos fallan a menudo con las herramientas |
| Compatible con OpenAI | Depende del servidor | LM Studio (`http://localhost:1234/v1`), vLLM, Groq, Mistral, DeepSeek… |

## Ollama paso a paso

1. Instala [Ollama](https://ollama.com) y descarga un modelo: `ollama pull qwen3:8b`.
2. En OpenRoute, **Ajustes → Ollama**. La URL por defecto es `http://localhost:11434`.
3. Elige el modelo en la lista y pulsa **Usar**.

## Dónde se guarda la clave

En el archivo de estado de la app, cifrada con el almacén seguro del sistema (DPAPI en Windows, Keychain en macOS, libsecret en Linux). La interfaz nunca la ve: solo sabe si hay clave guardada. Para borrarla, pulsa **Quitar**.

## Qué se envía al modelo

Tu mensaje, el historial de la conversación de ese reparto y lo que devuelvan las herramientas (pedidos, flota y resumen del plan). No se envían las claves de otros proveedores ni datos de otros repartos.
