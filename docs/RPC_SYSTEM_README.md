# EventDispatcher-Based Module Communication System

## What Changed

This system replaces direct module dependencies (imports, `Services.obs`, global variables) with an EventDispatcher-based communication system using fp-ts Either for error handling.

## Key Benefits

1. **Loose Coupling:** Modules no longer directly import each other
2. **Graceful Degradation:** Modules continue to work even if dependencies are missing
3. **No Circular Dependencies:** EventDispatcher prevents circular dependency issues
4. **Better Testability:** Modules can be tested in isolation
5. **Cleaner Architecture:** Clear separation between modules
6. **Type-Safe Error Handling:** Either pattern for explicit error handling

## Architecture Overview

### EventDispatcher Registry (`bridge/loader-features/loader/event-dispatcher-registry.ts`)

The central registry that:
- Manages all module event interfaces
- Routes calls between modules
- Handles missing/unloaded modules gracefully
- Wraps all methods with Either for error safety

### Module Configuration

Each module is configured via the `@component` decorator:

```typescript
import { component, eventMethod } from "#features-chrome/utils/base";

@component({
  moduleName: "my-module",
  dependencies: [],        // Hard dependencies
  softDependencies: [],    // Optional dependencies
  hot: import.meta.hot,
})
export default class MyModule {
  protected events!: EventDispatcherDependencies<[...]>;

  @eventMethod
  myMethod(arg: string): string {
    return `Hello ${arg}`;
  }
}
```

### Module Loader Integration

The loader (`bridge/loader-features/loader/index.ts`):
1. Loads all enabled modules
2. Registers event methods after initialization
3. Initializes modules in dependency order
4. Handles module failures gracefully

## How to Use EventDispatcher

### Calling Event Methods

```typescript
import { component } from "#features-chrome/utils/base";
import type { EventDispatcherDependencies } from "../event-dispatcher-interfaces.ts";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";

@component({
  moduleName: "caller-module",
  softDependencies: ["target-module"],
  hot: import.meta.hot,
})
export default class CallerModule {
  protected events!: EventDispatcherDependencies<["target-module"]>;

  async init() {
    const result = await this.events["target-module"].getData();

    pipe(
      result,
      E.fold(
        (error) => console.error("Failed:", error),
        (data) => console.log("Got data:", data)
      )
    );
  }
}
```

### Exposing Event Methods

```typescript
import { component, eventMethod } from "#features-chrome/utils/base";

@component({
  moduleName: "my-module",
  hot: import.meta.hot,
})
export default class MyModule {
  private myData = "test";

  @eventMethod
  getData(): string {
    return this.myData;
  }

  @eventMethod
  setData(value: string): void {
    this.myData = value;
  }
}

// Register interface globally
declare global {
  interface FeatureModuleEventMethods {
    "my-module": {
      getData(): string;
      setData(value: string): void;
    };
  }
}
```

## Migrated Modules

The following modules use the EventDispatcher system:

- **sidebar** (`browser-features/chrome/common/sidebar/`)
  - Exposes event methods for icon registration
  - Uses `@eventMethod` decorator for exposed methods
  - Provides type-safe interface via declaration merging

- **sidebar-addon-panel** (`browser-features/chrome/common/sidebar-addon-panel/`)
  - Uses `this.events` to communicate with sidebar module
  - Uses Either pattern for error handling
  - Gracefully handles missing sidebar module

## Key Files

### Implementation
- `bridge/loader-features/loader/event-dispatcher-registry.ts` - EventDispatcher registry
- `browser-features/chrome/utils/base.ts` - `@component` and `@eventMethod` decorators

### Type Definitions
- `browser-features/chrome/common/event-dispatcher-interfaces.ts` - Type helpers
- `browser-features/chrome/common/event-dispatcher-types.ts` - Type utilities
- `browser-features/chrome/common/features-event-dispatcher.d.ts` - Global type declarations

### Tests
- `browser-features/chrome/test/unit/event-dispatcher-registry.test.ts` - Unit tests

## Migration Path for Other Modules

To migrate a module to use EventDispatcher:

1. Read the migration guide: `docs/RPC_MIGRATION_GUIDE.md`
2. Add `@eventMethod` decorator to methods you want to expose
3. Declare interface in `FeatureModuleEventMethods`
4. Use `this.events` to call methods on other modules
5. Handle Either results with `E.fold`
6. Test the module works independently

## Services.obs Usage Note

`Services.obs` is still used for:
- **Browser-internal events** (e.g., `http-on-modify-request`) - This is correct
- **Non-module communication** (e.g., browser lifecycle events) - This is fine

`Services.obs` should NOT be used for:
- **Module-to-module communication** - Use EventDispatcher instead
- **Passing data between modules** - Use EventDispatcher instead

## Testing

Run tests with:
```bash
deno test browser-features/chrome/test/unit/event-dispatcher-registry.test.ts
```

## Backwards Compatibility

The EventDispatcher system is backwards compatible:
- Modules without `@eventMethod` methods still work
- Existing metadata format is preserved
- Old modules can coexist with new EventDispatcher-based modules

## Documentation

- **Migration Guide:** `docs/RPC_MIGRATION_GUIDE.md`
- **Examples:** `browser-features/chrome/common/sidebar/index.ts`
- **Tests:** `browser-features/chrome/test/unit/event-dispatcher-registry.test.ts`
- **Implementation:** `bridge/loader-features/loader/event-dispatcher-registry.ts`

## Questions?

Refer to the migration guide or examine the migrated modules for patterns and best practices.
