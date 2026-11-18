# Cuenta de Google

Desde **Ajustes → Cuenta**, puedes identificarte en OpenRoute con Google. El acceso se abre en tu navegador. Después del consentimiento, OpenRoute guarda tu nombre y correo en `openroute.json`, dentro de la carpeta local de datos. La cuenta solo sirve para identificarte en este equipo. Cada instalación guarda sus propios pedidos, flota y planes. Puedes usar todas las funciones de planificación sin identificarte.

Pulsa **Quitar cuenta de este equipo** para borrar el nombre y el correo de la aplicación. Para retirar también el consentimiento que otorgaste a Google, abre las [conexiones de tu cuenta de Google](https://myaccount.google.com/connections).

## Habilitar el acceso en una instalación

1. Configura Google Auth Platform y crea un cliente OAuth de tipo **Aplicación de escritorio**. Descarga su JSON con la propiedad `installed`.
2. Para una prueba local, guarda el JSON como `google-oauth.json` en la carpeta de datos de OpenRoute (`%APPDATA%\OpenRoute` en Windows) o define `OPENROUTE_GOOGLE_CLIENT_FILE` con la ruta del archivo antes de iniciar la app.
3. Para incluir el cliente en un instalador, coloca el JSON en `resources/google-oauth.json` antes de empaquetar. El repositorio ignora este archivo. Para publicar desde GitHub Actions, guarda su contenido en el secret `GOOGLE_DESKTOP_OAUTH_JSON` del entorno `windows-release`. El flujo puede generar instaladores sin este archivo y en ellos la opción aparece como sin configurar.
4. Para las pruebas iniciales, añade tus cuentas en **Público → Usuarios de prueba**. Google exceptúa los permisos básicos de identidad de la lista obligatoria en modo **En pruebas**. Antes de distribuir el acceso públicamente, revisa el público y la marca de la pantalla de consentimiento en la consola. [Configuración del público en Google Auth Platform](https://support.google.com/cloud/answer/15549945?hl=es).

El cliente de escritorio es público y sus datos de configuración son recuperables del instalador. Usa únicamente el JSON del cliente de escritorio. El flujo usa PKCE S256 y una redirección temporal a `127.0.0.1`. Solicita únicamente `openid`, `email` y `profile`. OpenRoute verifica el token de identidad y descarta los tokens después de leer el perfil. [OAuth para aplicaciones de escritorio de Google](https://developers.google.com/identity/protocols/oauth2/native-app).
