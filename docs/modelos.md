# Conectar un modelo de IA

Abre **Ajustes → Modelos de IA**, elige un proveedor, pega tu clave y escribe el identificador exacto que admite tu cuenta y pulsa **Usar**. **Probar** manda un mensaje corto para comprobar que la clave y el modelo responden.

No hace falta modelo para calcular rutas: el botón «Calcular rutas» usa solo el motor. El modelo sirve para pedir cambios hablando y para que te explique el plan.

## Usar una suscripción desde el terminal en Windows

En **Ajustes → Terminales de IA**, abre [Codex CLI](https://developers.openai.com/codex/cli), [Antigravity CLI](https://antigravity.google/docs/cli/tutorial/) o [Claude Code](https://code.claude.com/docs/en/setup). Instala el ejecutable nativo del proveedor y pulsa **Volver a comprobar** si la app estaba abierta. El inicio de sesión de cada CLI se hace desde su propio terminal y es independiente de la cuenta de OpenRoute.

OpenRoute abre el CLI interactivo en una carpeta temporal vacía. Para pedir ayuda a Codex o Antigravity, puedes revisar y copiar los totales del reparto y pegarlos tú en el terminal. El resumen contiene cantidades, distancias y tiempos del motor. Los datos de clientes y las direcciones permanecen en OpenRoute. El chat integrado de **Modelos de IA** usa la conexión configurada en esa pestaña.

## Dónde encontrar el nombre del modelo

Copia el identificador que muestra tu proveedor o servidor, incluidas las barras, etiquetas y versiones. **Probar** comprueba que el modelo responde. Para modificar un reparto desde el chat, el modelo también debe admitir llamadas a herramientas.

## Ollama paso a paso

1. Instala [Ollama](https://ollama.com) y descarga un modelo: `ollama pull qwen3:8b`.
2. En OpenRoute, **Ajustes → Ollama**. La URL por defecto es `http://localhost:11434`.
3. Escribe el nombre que aparece en `ollama list` y pulsa **Usar**.

## Dónde se guarda la clave

En el archivo de estado de la app, cifrada con el almacén seguro del sistema (DPAPI en Windows, Keychain en macOS, libsecret en Linux). La interfaz nunca la ve: solo sabe si hay clave guardada. Para borrarla, pulsa **Quitar**.

## Qué se envía al modelo

Tu mensaje, el historial de la conversación de ese reparto y lo que devuelvan las herramientas (pedidos, flota y resumen del plan). No se envían las claves de otros proveedores ni datos de otros repartos.
