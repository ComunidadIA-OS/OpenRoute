# Usar IA con tu reparto

Para calcular rutas y exportar la hoja de cada conductor, basta con configurar el depósito, añadir la flota e importar tus pedidos. Puedes empezar sin cuenta.

## Usar mi suscripción en Windows

1. Abre **Ajustes → Usar mi suscripción** y elige tu cuenta. OpenRoute abre la herramienta oficial de [ChatGPT (Codex)](https://developers.openai.com/codex/cli), [Claude Code](https://code.claude.com/docs/en/setup) o [Google Antigravity](https://antigravity.google/docs/getting-started?tab=cli).
2. Si te aparece **Instalar**, sigue la guía del proveedor y vuelve a comprobar. Inicia sesión con el proveedor y, después, elige **Abrir asistente**. La conversación se abre en otra ventana y utiliza el acceso que incluya tu cuenta.
3. Si quieres ayuda para interpretar un reparto, abre la vista previa del resumen. Marca la opción de incluirlo y abre el asistente. Recibirá los totales que has revisado. Los cambios en las rutas se hacen desde OpenRoute.

La cuenta de Google que identifica tu perfil local se gestiona aparte. Puedes seguir trabajando con tus pedidos al cerrar sesión.

## Conectar el chat que puede cambiar pedidos

En Ajustes, abre la configuración del chat integrado, elige el proveedor, guarda su clave si la requiere y escribe el identificador exacto del modelo. Pulsa **Usar** para activarlo. Con un servidor local como Ollama basta con la dirección del servidor y el identificador.

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
