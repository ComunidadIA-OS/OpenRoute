# Contribuir a OpenRoute

Gracias por echar una mano. Esto es lo que necesitas saber.

## Preparar el entorno

```bash
npm install
npm run dev
```

Node.js 22 o superior. La primera vez, `npm install` descarga Electron (unos 100 MB).

## Antes de abrir una PR

Ejecuta y deja en verde:

```bash
npm run typecheck
npm run lint
npm test
```

Si tocas la interfaz, adjunta una captura. Si tocas el motor (`src/core/solver.ts`), añade una prueba que cubra el caso y cuenta en la PR cómo cambian los kilómetros y el coste con los pedidos de ejemplo.

## Commits

En español y con el formato `tipo(ámbito): descripción`, por ejemplo `feat(core): ventanas horarias dobles` o `fix(ui): el mapa no se ajusta al cambiar de reparto`. Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`. Un cambio por commit.

## Dónde va cada cosa

- **Lógica de rutas, importación o cálculos** → `src/core`, en TypeScript puro y con pruebas. Nada de Electron ni del navegador ahí.
- **Acceso a disco, red o IA** → `src/main`.
- **Pantallas** → `src/renderer`. La interfaz habla con el proceso principal solo a través de `window.openroute` (definido en `src/preload` y tipado en `src/shared/types.ts`).

## Estilo de la interfaz

- Un solo tema oscuro y un solo acento (lima `#c8f560`). Tipografía Geist.
- Textos en español, tuteando, frases cortas y en tipo frase: nada de etiquetas en mayúsculas sostenidas.
- Las cifras siempre con contexto («frente al plan manual por zonas»).

## Añadir un proveedor de IA

1. Añádelo a `PROVIDERS` en `src/shared/types.ts`.
2. Crea el modelo en `createModel` y la lista de modelos en `listModels` (`src/main/ai/providers.ts`).
3. Añade su icono en `src/renderer/src/assets/providers` y en `ProviderIcon.tsx`.

## Publicar una versión

Sube la versión en `package.json`, añade la entrada al `CHANGELOG.md` y crea una etiqueta `vX.Y.Z`. La acción de GitHub genera el instalador de Windows y lo adjunta a la release.

## Conducta

Este proyecto sigue el [código de conducta](CODE_OF_CONDUCT.md).
