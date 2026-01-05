# Loader Features Refactoring - DOP/FP Style

This document describes the refactoring of `bridge/loader-features/loader` to a Data-Oriented Programming (DOP) and Functional Programming (FP) style, similar to Julia/Kotlin patterns but implemented in TypeScript.

## Directory Structure

```
loader/
├── types/          # Type definitions
│   ├── module.ts   # Module-related types (LoadedModule, ModuleMetadata, etc.)
│   ├── hooks.ts    # Hook-related types (DeferredState)
│   ├── registry.ts # Registry-related types (ModuleInfo, HotswapEvent, etc.)
│   └── mod.ts      # Re-exports all types
├── data/           # Pure data/constants
│   ├── modules.ts  # Module registry data (MODULES, MODULES_KEYS)
│   └── mod.ts      # Re-exports all data
├── ops/            # Pure operations (no side effects)
│   ├── validation.ts  # Dependency validation, sorting
│   ├── hooks.ts      # Deferred promise creation
│   ├── metadata.ts   # Metadata creation
│   └── mod.ts        # Re-exports all ops
├── io/             # Side-effectful operations
│   ├── prefs.ts    # Preference operations
│   ├── modules.ts  # Module loading
│   ├── registry.ts # Registry management
│   ├── hooks.ts    # Hook state management
│   ├── nma.ts      # NMA system initialization
│   ├── init.ts     # Module initialization
│   └── mod.ts      # Re-exports all IO
├── state/          # Module-level state management
│   ├── registry.ts # Module registry state (_modules map)
│   ├── hooks.ts    # Hooks state (_moduleLoadStates, _initCompleted)
│   └── mod.ts      # Re-exports all state
├── nma/            # Already refactored (NMA system)
├── try.ts          # Try/Success/Failure type (utility module)
└── mod.ts          # Main entry point
```

## Design Principles

### 1. **Separation of Concerns**

- **types/** - Pure type definitions, no runtime code
- **data/** - Pure data structures and constants
- **ops/** - Pure functions with no side effects (data transformations)
- **io/** - Side-effectful operations (file I/O, network, preferences, etc.)
- **state/** - Module-level state management (Julia-like module state)

### 2. **Pure vs Impure**

- **Pure functions** (in `ops/`):
  - `validateDependencies()` - validates module dependencies
  - `sortByDependencies()` - topological sort
  - `createDeferred()` - creates deferred promise object
  - `defaultMetadata()` - creates default metadata

- **Side-effectful functions** (in `io/`):
  - `loadSingleModule()` - dynamic imports
  - `registerModule()` - modifies global state
  - `cleanupModule()` - calls module cleanup
  - `setPrefFeatures()` - modifies Firefox preferences

### 3. **State Management**

Module-level state is centralized in `state/`, following Julia's module-level state pattern:

```typescript
// state/registry.ts
const _modules: Map<string, ModuleInfo> = new Map();
export const getModulesMap = () => _modules;

// state/hooks.ts
const _moduleLoadStates: Map<string, DeferredState> = new Map();
let _initCompleted = false;
export const getModuleLoadStatesMap = () => _moduleLoadStates;
export const isInitCompleted = () => _initCompleted;
export const setInitCompleted = (value: boolean) => {
  _initCompleted = value;
};
```

### 4. **Entry Point**

`mod.ts` serves as the main entry point, providing:

- Public API functions (`initScripts`, `hotswapModules`, etc.)
- Comprehensive re-exports of all submodules
- Clean, organized interface for external consumers

## Migration from Old Structure

### Before

```
loader/
├── index.ts              # Monolithic file with types, logic, I/O mixed
├── modules.ts            # Module registry
├── module-registry.ts    # Registry management
├── modules-hooks.ts      # Hooks + re-exports
├── try.ts                # Try type
└── nma/                  # NMA system (already refactored)
```

### After

```
loader/
├── types/     # Extracted types from index.ts, module-registry.ts
├── data/      # Extracted data from modules.ts
├── ops/       # Extracted pure functions from index.ts, module-registry.ts
├── io/        # Extracted I/O operations from index.ts, module-registry.ts, modules-hooks.ts
├── state/     # Extracted state management from module-registry.ts, modules-hooks.ts
├── mod.ts     # New entry point (replaces index.ts)
├── try.ts     # Kept as-is (utility)
└── nma/       # Kept as-is (already refactored)
```

## Key Changes

1. **Separated types** from implementation
2. **Isolated pure operations** from side effects
3. **Centralized state management** in dedicated modules
4. **Created clear module boundaries** with explicit exports
5. **Maintained backward compatibility** through comprehensive re-exports in `mod.ts`

## Benefits

1. **Testability**: Pure operations can be tested without mocking
2. **Maintainability**: Clear separation makes code easier to understand
3. **Reusability**: Pure functions can be reused across contexts
4. **Type Safety**: Centralized type definitions
5. **Predictability**: State changes are explicit and localized

## Lint Notes

The codebase uses `any` types in specific places for dynamic module loading:

- `instance: any` parameters are necessary for dynamic module instantiation
- These are marked with `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
- This is intentional and follows the existing pattern in the codebase

## External Changes

Updated import in `browser-features/chrome/main.ts`:

- **Before**: `from "#bridge-loader-features/loader/index.ts"`
- **After**: `from "#bridge-loader-features/loader/mod.ts"`
