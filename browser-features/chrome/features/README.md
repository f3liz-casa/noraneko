# Browser Features

Browser features for Noraneko, organized using Data-Oriented Programming (DOP) and Functional Programming (FP) principles, inspired by Julia and Kotlin.

## 📁 Structure Overview

```
features/
├── 📄 ARCHITECTURE.md          # Architecture patterns and diagrams
├── 📄 MIGRATION_CHECKLIST.md   # Migration progress tracking
├── 📄 REFACTORING_SUMMARY.md   # Refactoring summary and patterns
│
├── ✅ sidebar/                  # Independent dock bar (REFACTORED)
├── ✅ sidebar-addon-panel/      # Sidebar addon panel (REFACTORED)
├── ✅ browser-share-mode/       # Share mode toggle (REFACTORED)
├── ✅ statusbar/                # Bottom statusbar (REFACTORED)
├── ✅ tab-rename/               # Tab renaming feature (REFACTORED)
├── ✅ reverse-sidebar-position/ # Sidebar positioning (DISABLED)
│
├── 🔲 tmp/                      # Features awaiting refactoring
│   ├── browser-tab-color/
│   ├── context-menu/
│   └── update-refresh-cache/
│
└── 📄 mod.ts                    # Feature module loader
```

## 🎯 Design Philosophy

### Data-Oriented Programming (DOP)

- **Data First**: Types and data structures are primary
- **Immutability**: Data transformations create new values
- **Separation**: Data structures separate from operations

### Functional Programming (FP)

- **Pure Functions**: Operations without side effects in `ops/`
- **Side Effects Isolation**: All effects contained in `io/`
- **Composition**: Small, composable functions

### Reactive State

- **Signals**: Preact signals for reactive state
- **Effects**: Side effects triggered by signal changes
- **Minimal State**: Only necessary state is reactive

## 📂 Module Structure

Each feature follows a consistent directory structure:

```
feature-name/
├── mod.ts          # Module entry point (defineModule)
├── README.md       # Documentation
├── types/          # Type definitions & schemas (optional)
├── data/           # Constants & defaults (optional)
├── ops/            # Pure operations (optional)
├── io/             # Side effects (optional)
├── state/          # Reactive signals (optional)
└── ui/             # Components & rendering (optional)
```

### Directory Purposes

- **types/**: TypeScript types and Valibot schemas
- **data/**: Constants, default values, static data
- **ops/**: Pure functions that transform data
- **io/**: Side-effectful operations (DOM, network, storage)
- **state/**: Preact signals and state management
- **ui/**: UI components and rendering logic

## 🚀 Quick Start

### Creating a New Feature

1. **Create directory structure**:

   ```powershell
   New-Item -ItemType Directory -Force -Path "my-feature\state", "my-feature\ui"
   ```

2. **Create mod.ts**:

   ```typescript
   import { defineModule } from "@lib/core";

   export default defineModule(
     {
       name: "my-feature",
       hot: import.meta.hot,
     },
     {
       init(ctx) {
         ctx.log.debug("Initializing...");
         // Setup
       },
       cleanup(ctx) {
         ctx.log.debug("Cleaning up...");
         // Teardown
       },
     },
   );
   ```

3. **Add state (if needed)**:

   ```typescript
   // state/signals.ts
   import { signal } from "@preact/signals";

   export const myState = signal<boolean>(false);
   ```

4. **Add UI (if needed)**:

   ```typescript
   // ui/components/MyComponent.tsx
   import { h } from "preact";
   import { myState } from "../../state/mod.ts";

   export function MyComponent() {
     return <div>{myState.value ? "On" : "Off"}</div>;
   }
   ```

5. **Create README.md** documenting your feature

### Refactoring an Existing Feature

See `MIGRATION_CHECKLIST.md` for the step-by-step process.

## 📚 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: Detailed architecture diagrams and examples
- **[REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)**: Summary of refactoring work
- **[MIGRATION_CHECKLIST.md](./MIGRATION_CHECKLIST.md)**: Migration progress and tasks

## 🎨 Examples

### Simple Feature (browser-share-mode)

```
browser-share-mode/
├── state/signals.ts      # shareModeEnabled signal
├── ui/components/        # ShareModeMenuItem
└── ui/styles/            # CSS
```

### Moderate Feature (statusbar)

```
statusbar/
├── data/constants.ts     # Prefs, defaults
├── state/signals.ts      # showStatusBar signal
├── io/customizable-ui.ts # CustomizableUI, DOM
└── ui/components/        # StatusBar, ContextMenuItem
```

### Complex Feature (tab-rename)

```
tab-rename/
├── types/TabRenameData.ts   # Data types
├── data/constants.ts        # Pref names
├── ops/tabs.ts              # Pure functions
├── io/tabs.ts               # Persistence, DOM
├── state/signals.ts         # renamedTabs map
└── ui/input.ts              # Rename UI
```

## ✨ Benefits

### For Developers

- **Intuitive**: Easy to find what you need
- **Consistent**: Same patterns across features
- **Testable**: Pure functions easy to test
- **Maintainable**: Clear responsibility boundaries

### For Code Quality

- **Type Safety**: Explicit types throughout
- **Separation of Concerns**: Clear boundaries
- **Functional Core**: Easy to reason about
- **Imperative Shell**: Effects well-contained

### For Performance

- **Fine-grained Reactivity**: Preact signals
- **Memoization**: Pure functions cacheable
- **Lazy Loading**: Module-based code splitting

## 🔧 Tools & Technologies

- **TypeScript**: Type-safe JavaScript
- **Preact**: Lightweight reactive framework
- **Valibot**: Schema validation (where needed)
- **Vite**: Build tooling
- **CustomizableUI**: Firefox toolbar system

## 🤝 Contributing

When creating or refactoring features:

1. Follow the DOP/FP structure
2. Use Preact signals for state
3. Separate pure functions from effects
4. Create comprehensive READMEs
5. Include SPDX license headers
6. Use TypeScript strictly

## 📊 Current Status

- **Refactored**: 4 features (sidebar, sidebar-addon-panel, browser-share-mode, statusbar, tab-rename)
- **Disabled**: 1 feature (reverse-sidebar-position)
- **Pending**: 3 features (in tmp/)

See `MIGRATION_CHECKLIST.md` for detailed progress.

## Happy Coding! :3

Built with ❤️ following Julia/Kotlin's beautiful DOP/FP style in TypeScript.
