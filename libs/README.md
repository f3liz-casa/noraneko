# libs/

Workspace-local internal libraries shared across Noraneko. Not published.

| Library | Purpose |
|---|---|
| `@types/gecko` | Generated TypeScript definitions for the Gecko / XPCOM API |
| `preact-xul` | Retargets Preact's renderer to XUL elements via the `options.vnode` hook |
| `vite-oxc-decorator-stage-3` | Vite plugin — stage-3 decorator transform (oxc / Rust) |
| `vite-plugin-gen-jarmn` | Vite plugin — generates Gecko `jar.mn` chrome manifests |
| `solid-xul` | **Legacy.** Solid.js → XUL renderer, superseded by `preact-xul`. Retained but no longer used by the chrome layer. |
