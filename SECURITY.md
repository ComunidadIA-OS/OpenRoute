# Seguridad

## Cómo avisar de un problema

No abras una issue pública. Usa el aviso privado de GitHub (pestaña **Security → Report a vulnerability** del repositorio) o escribe a hola@openroute.es con el asunto «Seguridad». Te respondemos en un máximo de 5 días laborables.

Incluye la versión, el sistema operativo y los pasos para reproducirlo.

## Qué cubre

- La app de escritorio y su instalador.
- El tratamiento de las claves de API: se cifran con el almacén seguro del sistema y solo deben salir hacia el proveedor elegido.
- La separación entre interfaz y proceso principal (`contextIsolation`, CSP y el protocolo `app://`).

Los servicios de terceros (proveedores de IA, OSRM, Nominatim, OpenFreeMap) tienen sus propias políticas.

## Versiones con soporte

La última versión publicada.
