---
description: Refactor browser features to DOP/FP style
---

# Browser Features Refactoring Plan

Following Julia/Kotlin's DOP/FP style in TypeScript, similar to the `sidebar` module.

## Directory Structure Pattern

Each feature should follow this structure:

```
feature-name/
├── mod.ts          # Module entry point with defineModule
├── README.md       # Documentation
├── types/          # Type definitions & Valibot schemas (if needed)
│   └── mod.ts      # Re-exports
├── data/           # Constants & defaults (if needed)
│   └── mod.ts      # Re-exports
├── ops/            # Pure operations (if needed)
│   └── mod.ts      # Re-exports
├── io/             # Side-effectful operations (if needed)
│   └── mod.ts      # Re-exports
├── state/          # Reactive signals (if needed)
│   └── mod.ts      # Re-exports
└── ui/             # UI components
    ├── components/ # Individual components
    ├── styles/     # CSS files
    └── mod.ts      # Re-exports
```

## Features to Refactor

### From tmp/ folder:

1. **statusbar** - Has UI components, context menu, manager
2. **tab-rename** - Has UI input, manager, storage
3. **browser-share-mode** - Simple UI component
4. **browser-tab-color** - Tab styling feature
5. **context-menu** - Context menu feature
6. **reverse-sidebar-position** - Sidebar positioning (mostly disabled)
7. **update-refresh-cache** - Cache update feature

### Already refactored:

- ✅ sidebar
- ✅ sidebar-addon-panel

## Refactoring Steps

For each feature:

1. **Create directory structure**
   - Move from `tmp/feature-name/` to `features/feature-name/`
   - Create `types/`, `data/`, `ops/`, `io/`, `state/`, `ui/` as needed

2. **Extract types** (if complex types exist)
   - Create `types/` directory
   - Define types with Valibot schemas if validation needed
   - Export from `types/mod.ts`

3. **Extract constants & defaults** (if any exist)
   - Create `data/` directory
   - Move constants, default values, pref names
   - Export from `data/mod.ts`

4. **Separate pure operations** (if any exist)
   - Create `ops/` directory
   - Extract pure functions (no side effects)
   - Export from `ops/mod.ts`

5. **Isolate side effects**
   - Create `io/` directory
   - Move DOM operations, network calls, storage access
   - Export from `io/mod.ts`

6. **Setup reactive state** (if needed)
   - Create `state/` directory
   - Use Preact signals for reactive state
   - Export from `state/mod.ts`

7. **Organize UI components**
   - Create `ui/` directory
   - Move `.tsx` files to `ui/components/`
   - Move CSS to `ui/styles/`
   - Export from `ui/mod.ts`

8. **Create mod.ts entry point**
   - Use `defineModule` from `@lib/core`
   - Implement `init()`, `cleanup()`, `eventMethods()` if needed
   - Re-export public API

9. **Create README.md**
   - Document the module structure
   - Explain design principles
   - Provide usage examples

## Design Principles

1. **Data-Oriented**: Types and data structures first
2. **Functional**: Pure operations separated from effects
3. **Reactive**: Use Preact signals for state management
4. **Modular**: Each directory has a `mod.ts` for re-exports
5. **Simple**: Keep it down-to-earth and intuitive

## Migration from Solid to Preact

- Replace `solid-js` imports with `@preact/signals`
- Replace `render` from `@nora/solid-xul` with `preact` render
- Replace `onCleanup` with returning cleanup functions
- Replace `NoraComponentBase` with `defineModule`
