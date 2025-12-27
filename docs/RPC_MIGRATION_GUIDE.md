# Module EventDispatcher Communication System - Migration Guide

## Overview

This guide explains how to migrate modules from using direct dependencies (imports, `Services.obs`, global variables) to using the EventDispatcher registry for inter-module communication.

## Type-Safe this.events Pattern (Current)

The recommended way to use EventDispatcher is via the type-safe `this.events` pattern:

```typescript
import { component } from "#features-chrome/utils/base";
import type { EventDispatcherDependencies } from "../event-dispatcher-interfaces.ts";

@component({
  moduleName: "my-module",
  softDependencies: ["sidebar", "other-module"],
  hot: import.meta.hot,
})
export default class MyModule {
  // Type-safe EventDispatcher access to dependencies
  protected events!: EventDispatcherDependencies<["sidebar", "other-module"]>;

  init() {
    // Call event methods with full IDE autocomplete support!
    await this.events.sidebar.registerSidebarIcon({...});
    
    // Returns Either<Error, T | undefined> for soft dependencies
    const result = await this.events["other-module"].getData();
  }
}
```

**Benefits:**
- ✅ Clean syntax: `this.events.sidebar.method()`
- ✅ IDE autocomplete works automatically
- ✅ Type-safe based on module interfaces
- ✅ No manual proxy creation needed
- ✅ Consistent pattern across all modules
- ✅ Either-based error handling

## Why Migrate?

**Before (Problems):**
- Modules directly import each other, creating tight coupling
- Using `Services.obs` for communication, which is browser-specific
- No graceful handling of missing modules
- Circular dependencies are possible
- Hard to test modules in isolation

**After (Benefits):**
- Modules communicate via EventDispatcher without direct imports
- Graceful degradation when dependencies are missing
- No circular dependencies
- Easy to test modules independently
- Better separation of concerns

## Key Concepts

### 1. EventDispatcher Registry

The EventDispatcher registry is a centralized system that:
- Manages module communication
- Routes event calls between modules
- Handles missing/unloaded modules gracefully
- Supports both hard and soft dependencies

### 2. Module Configuration

Each module is configured via the `@component` decorator:

```typescript
@component({
  moduleName: "my-module",
  dependencies: [],           // Hard dependencies (must be loaded)
  softDependencies: [],       // Soft dependencies (optional)
  hot: import.meta.hot,
})
export default class MyModule {
  protected events!: EventDispatcherDependencies<[...]>;
  // ...
}
```

### 3. Event Methods vs Regular Methods

**Event Methods:** Exposed to other modules via `@eventMethod` decorator
**Regular Methods:** Private to the module, not accessible externally

## Migration Steps

### Step 1: Add Event Interface (if needed)

First, if your dependency module doesn't have an event interface defined, add it to its module file with declaration merging:

```typescript
export interface MyModuleEventDispatcher {
  doSomething(): void;
  getData(): string;
}

// Register globally
declare global {
  interface FeatureModuleEventMethods {
    "my-module": MyModuleEventDispatcher;
  }
}
```

### Step 2: Use this.events Pattern

**Before:**
```typescript
import { OtherModule } from "../other-module/index.ts";

class MyModule {
  init() {
    const other = new OtherModule();
    other.doSomething();
  }
}
```

**After:**
```typescript
import { component } from "#features-chrome/utils/base";
import type { EventDispatcherDependencies } from "../event-dispatcher-interfaces.ts";

@component({
  moduleName: "my-module",
  softDependencies: ["other-module"],
  hot: import.meta.hot,
})
export default class MyModule {
  protected events!: EventDispatcherDependencies<["other-module"]>;

  init() {
    // Clean, type-safe EventDispatcher call with IDE autocomplete!
    await this.events["other-module"].doSomething();
  }
}
```

### Step 3: Remove Services.obs Usage

**Before:**
```typescript
// Sending
Services.obs.notifyObservers(
  { data: "hello" } as nsISupports,
  "my-custom-topic"
);

// Receiving
const observer = (subject: nsISupports, topic: string, data: string) => {
  console.log("Received:", (subject as any).data);
};
Services.obs.addObserver(observer, "my-custom-topic", false);
```

**After:**
```typescript
// Use EventDispatcher calls instead
await this.events["target-module"].handleData("hello");

// Or for broadcasting events, use DOM custom events
const event = new CustomEvent("my-custom-event", {
  detail: { data: "hello" }
});
document.dispatchEvent(event);
```

### Step 4: Define Event Methods with @eventMethod Decorator

Add event methods using the `@eventMethod` decorator:

```typescript
import { component, eventMethod } from "#features-chrome/utils/base";

@component({
  moduleName: "my-module",
  softDependencies: ["other-module"],
  hot: import.meta.hot,
})
export default class MyModule {
  protected events!: EventDispatcherDependencies<["other-module"]>;

  // Event methods exposed to other modules
  @eventMethod
  handleData(data: string): void {
    console.log("Handling data:", data);
  }

  @eventMethod
  getData(): string {
    return this.internalData;
  }

  @eventMethod
  async performAction(action: string): Promise<string> {
    // Perform action
    return `Completed: ${action}`;
  }

  // Regular private methods (NOT exposed to other modules)
  private internalData = "test";
}
```

### Step 5: Call Event Methods

Use `this.events` to call methods on other modules:

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
    // Call event method - returns Either<Error, T | undefined>
    const result = await this.events["target-module"].getData();

    // Handle the Either result
    pipe(
      result,
      E.fold(
        (error) => console.error("Failed:", error),
        (data) => {
          if (data === undefined) {
            console.log("Module not available");
          } else {
            console.log("Got data:", data);
          }
        }
      )
    );
  }
}
```

## Best Practices

1. **Use Soft Dependencies:** For optional features, use `softDependencies`
2. **Define Clear Interfaces:** Create TypeScript interfaces for event methods
3. **Handle Either Results:** Always handle both success and error cases with `E.fold`
4. **Avoid Services.obs:** Use EventDispatcher for module communication, custom events for broadcasting
5. **Keep Event Methods Simple:** Event methods should be straightforward and well-documented
6. **Don't Mix Patterns:** Don't use both old and new patterns in the same module

## Examples

See the following files for complete examples:
- `browser-features/chrome/common/sidebar-addon-panel/index.ts` - Real-world example
- `browser-features/chrome/common/sidebar/index.ts` - Real-world example
- `browser-features/chrome/test/unit/event-dispatcher-registry.test.ts` - Test examples

## Migration Checklist

- [ ] Identify all `Services.obs.notifyObservers` calls
- [ ] Identify all `Services.obs.addObserver` calls
- [ ] Identify all direct module imports
- [ ] Identify all global variable usage for module communication
- [ ] Define event interfaces for all modules
- [ ] Add `@eventMethod` decorator to exposed methods
- [ ] Replace direct calls with `this.events` calls
- [ ] Replace Services.obs with EventDispatcher or custom events
- [ ] Add soft dependency handling with Either
- [ ] Test modules work independently
- [ ] Test modules work when dependencies are missing
- [ ] Update documentation
