# AGENTS.md

Instrucciones para agentes de IA (Claude Code, Cursor, Codex…) que trabajan en este repositorio.

## Contexto

OpenRoute es una app de escritorio (Electron + React + TypeScript) que planifica rutas de reparto. La IA entiende las peticiones y usa herramientas; las rutas las calcula siempre el motor de `src/core/solver.ts`. Lee [`docs/arquitectura.md`](docs/arquitectura.md) antes de cambiar algo grande.

## Idioma

Código, comentarios, commits y documentación en español. Textos de interfaz tuteando, con frases cortas, en tipo frase y sin mayúsculas sostenidas.

## Reglas

1. Nunca hagas commit, push ni abras PR sin que te lo pidan.
2. Nunca escribas claves ni secretos en archivos versionados.
3. `src/core` es TypeScript puro: sin Electron, sin DOM y con pruebas en Vitest.
4. Las cifras que ve el usuario (km, horas, costes, ahorro) salen del motor, nunca del modelo de IA.
5. La interfaz solo habla con el proceso principal a través de `window.openroute` (`src/preload`). No actives `nodeIntegration` ni relajes la CSP para scripts.
6. No cambies el nombre ni el logotipo: son marcas (ver `NOTICE`).

## Verificación

Antes de dar un cambio por terminado:

```bash
npm run typecheck
npm run lint
npm test
```

Si tocas la interfaz, ábrela con `npm run dev` y compruébala. Informa de lo que has ejecutado y del resultado.
