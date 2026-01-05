# Browser Features Architecture

## DOP/FP Module Structure

```
┌─────────────────────────────────────────────────────────┐
│                      Feature Module                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │                     mod.ts                          │ │
│  │  - defineModule({ init, cleanup })                 │ │
│  │  - Re-exports public API                           │ │
│  └────────────────────────────────────────────────────┘ │
│                           │                              │
│          ┌────────────────┼────────────────┐            │
│          ▼                ▼                ▼            │
│  ┌──────────┐     ┌──────────┐    ┌──────────┐        │
│  │  types/  │     │  data/   │    │  state/  │        │
│  │          │     │          │    │          │        │
│  │ Type     │     │ Constants│    │ Signals  │        │
│  │ defs     │     │ Defaults │    │ Actions  │        │
│  └──────────┘     └──────────┘    └──────────┘        │
│                                                          │
│          ┌─────────────────────────────────┐            │
│          ▼                                 ▼            │
│  ┌──────────┐                      ┌──────────┐        │
│  │   ops/   │                      │   io/    │        │
│  │          │                      │          │        │
│  │ Pure     │                      │ Side     │        │
│  │ functions│                      │ effects  │        │
│  └──────────┘                      └──────────┘        │
│                                            │            │
│                                            ▼            │
│                                    ┌──────────┐        │
│                                    │   ui/    │        │
│                                    │          │        │
│                                    │Components│        │
│                                    │ Render   │        │
│                                    └──────────┘        │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌─────────────┐
│   User      │
│   Action    │
└──────┬──────┘
       │
       ▼
┌─────────────┐       ┌──────────────┐
│     UI      │──────▶│    State     │
│  Component  │       │   (Signal)   │
└─────────────┘       └──────┬───────┘
                             │
                             ├──────────┐
                             ▼          ▼
                      ┌──────────┐  ┌──────────┐
                      │   ops/   │  │   io/    │
                      │  (Pure)  │  │ (Effects)│
                      └──────────┘  └─────┬────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │ Preferences  │
                                   │     DOM      │
                                   │   Network    │
                                   └──────────────┘
```

## Module Examples

### Simple Module (browser-share-mode)

```
browser-share-mode/
├── mod.ts
├── state/
│   ├── signals.ts    # shareModeEnabled signal
│   └── mod.ts
└── ui/
    ├── components/
    │   └── ShareModeMenuItem.tsx
    ├── styles/
    │   └── share-mode.css
    └── mod.ts
```

### Moderate Module (statusbar)

```
statusbar/
├── mod.ts
├── data/
│   ├── constants.ts  # Pref names, defaults
│   └── mod.ts
├── state/
│   ├── signals.ts    # showStatusBar signal
│   └── mod.ts
├── io/
│   ├── customizable-ui.ts  # CustomizableUI, DOM
│   └── mod.ts
└── ui/
    ├── components/
    │   ├── StatusBar.tsx
    │   └── ContextMenuItem.tsx
    ├── styles/
    │   └── statusbar.css
    └── mod.ts
```

### Complex Module (tab-rename)

```
tab-rename/
├── mod.ts
├── types/
│   ├── TabRenameData.ts
│   └── mod.ts
├── data/
│   ├── constants.ts
│   └── mod.ts
├── ops/
│   ├── tabs.ts       # Pure: getTabId, serialize, etc.
│   └── mod.ts
├── io/
│   ├── tabs.ts       # Effects: persistence, DOM
│   └── mod.ts
├── state/
│   ├── signals.ts
│   └── mod.ts
└── ui/
    ├── input.ts
    ├── styles/
    │   └── tab-rename.css
    └── mod.ts
```

## Comparison: Before vs After

### Before (Old Style)

```typescript
// index.ts
import { NoraComponentBase } from "#features-chrome/utils/base";
import { createSignal, onCleanup } from "solid-js";

@noraComponent(import.meta.hot)
export default class Feature extends NoraComponentBase {
  init() {
    // Everything mixed together:
    // - State
    // - Side effects
    // - DOM manipulation
    // - Business logic
  }
}
```

### After (DOP/FP Style)

```typescript
// mod.ts
import { defineModule } from "@lib/core";
import { initFeature, cleanupFeature } from "./io/mod.ts";

export default defineModule(
  {
    name: "feature",
    hot: import.meta.hot,
  },
  {
    init(ctx) {
      ctx.log.debug("Initializing...");
      initFeature();
    },
    cleanup(ctx) {
      cleanupFeature();
    },
  },
);

// Clean separation:
// types/ - Data structures
// data/ - Constants
// ops/ - Pure functions
// io/ - Side effects
// state/ - Reactive state
// ui/ - Components
```

## Benefits

### 🎯 Clarity

- Easy to find what you need
- Clear responsibility boundaries
- Self-documenting structure

### ✅ Testability

- Pure functions testable in isolation
- Side effects clearly marked
- Minimal hidden state

### 🔧 Maintainability

- Consistent patterns across features
- Easy to update/refactor
- Clear dependencies

### 📦 Modularity

- Mix and match as needed
- Simple features stay simple
- Complex features well-organized

### 🚀 Performance

- Preact signals for fine-grained reactivity
- Pure functions for memoization
- Clear optimization points
