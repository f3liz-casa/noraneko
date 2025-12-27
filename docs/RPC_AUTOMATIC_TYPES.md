# Automatic EventDispatcher Type Inference

## Overview

The EventDispatcher system features **automatic type inference** using TypeScript's declaration merging. This means:
- ✅ No manual interface declarations needed
- ✅ Types extracted directly from `@eventMethod` decorated methods
- ✅ Single source of truth - define methods once
- ✅ Refactoring safe - change methods, types update automatically
- ✅ Full IDE autocomplete support

## How It Works

### 1. Module Declaration Merging

Each module registers itself in a global registry:

```typescript
import { component, eventMethod } from "#features-chrome/utils/base";

@component({
  moduleName: "my-module",
  hot: import.meta.hot,
})
export default class MyModule {
  @eventMethod
  myMethod(arg: string): void { /* ... */ }
  
  @eventMethod
  getData(): string { /* ... */ }
}

// Register interface globally
declare global {
  interface FeatureModuleRegistry {
    MyModule: typeof MyModule;
  }
  interface FeatureModuleEventMethods {
    "my-module": {
      myMethod(arg: string): void;
      getData(): string;
    };
  }
}
```

### 2. Automatic Type Extraction

The type system automatically:
1. Extracts module name from `@component({ moduleName })`
2. Extracts event methods decorated with `@eventMethod`
3. Wraps all methods with `Either<Error, T>` for error safety
4. Creates type mapping from module name to methods

### 3. Using Inferred Types

```typescript
import { component } from "#features-chrome/utils/base";
import type { EventDispatcherDependencies } from "../event-dispatcher-interfaces.ts";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";

@component({
  moduleName: "consumer-module",
  softDependencies: ["my-module"],
  hot: import.meta.hot,
})
export class ConsumerModule {
  // Types automatically inferred from my-module's event methods!
  protected events!: EventDispatcherDependencies<["my-module"]>;
  
  async init() {
    // Full IDE autocomplete - no manual interfaces needed!
    const result = await this.events["my-module"].myMethod("test");
    
    pipe(
      result,
      E.fold(
        (error) => console.error("Failed:", error),
        () => console.log("Success")
      )
    );
  }
}
```

## Type System Architecture

### Core Types (features-event-dispatcher.d.ts)

```typescript
// Extract event methods via declaration merging
interface FeatureModuleEventMethods {
  // Modules add their event interfaces here
  "my-module": {
    myMethod(arg: string): void;
    getData(): string;
  };
}

// Global registry (augmented by each module)
interface FeatureModuleRegistry {
  // Modules add themselves here
}
```

### Either Wrapping

All event methods are automatically wrapped:

```typescript
// Original method: (arg: string) => string
// Becomes: (arg: string) => Promise<Either<Error, string>>

// For soft dependencies, undefined is added:
// Becomes: (arg: string) => Promise<Either<Error, string | undefined>>
```

## Benefits

### 1. No Duplication

**Before (manual interfaces):**
```typescript
// event-dispatcher-interfaces.ts
export interface MyModuleEvents {
  myMethod(arg: string): Promise<Either<Error, void>>;
  getData(): Promise<Either<Error, string>>;
}

// my-module/index.ts - had to define methods twice
```

**After (automatic inference):**
```typescript
// my-module/index.ts
import { component, eventMethod } from "#features-chrome/utils/base";

@component({
  moduleName: "my-module",
  hot: import.meta.hot,
})
export default class MyModule {
  @eventMethod
  myMethod(arg: string): void { /* ... */ }
  
  @eventMethod
  getData(): string { /* ... */ }
}

declare global {
  interface FeatureModuleRegistry {
    MyModule: typeof MyModule;
  }
  interface FeatureModuleEventMethods {
    "my-module": {
      myMethod(arg: string): void;
      getData(): string;
    };
  }
}

// Types automatically available everywhere!
```

### 2. Refactoring Safety

Change a method signature:
```typescript
// Change from string to number
@eventMethod
getData(): number { /* ... */ }
```

All consumers get type errors if they use it incorrectly - no manual interface update needed!

### 3. IDE Autocomplete

Full autocomplete works because types are inferred from actual implementations:

```typescript
this.events["my-module"]. // <-- IDE shows all available methods with signatures
```

## Migration Guide

### Step 1: Add Declaration Merging

Add this to the end of your module file:

```typescript
declare global {
  interface FeatureModuleRegistry {
    YourModuleClassName: typeof YourModuleClassName;
  }
  interface FeatureModuleEventMethods {
    "your-module": {
      yourMethod(arg: string): void;
    };
  }
}
```

### Step 2: Use @eventMethod Decorator

```typescript
import { component, eventMethod } from "#features-chrome/utils/base";

@component({
  moduleName: "your-module",
  hot: import.meta.hot,
})
export default class YourModule {
  @eventMethod
  yourMethod(arg: string): void { /* ... */ }
}
```

### Step 3: Update Events Type Declaration

```typescript
import type { EventDispatcherDependencies } from "../event-dispatcher-interfaces.ts";

protected events!: EventDispatcherDependencies<["dependency"]>;
```

### Step 4: Remove Manual Interfaces

Delete manual interface declarations - they're no longer needed as they're in the global registry!

## Advanced Usage

### Multiple Dependencies

```typescript
protected events!: EventDispatcherDependencies<["module-a", "module-b"]>;
```

### Accessing Methods

```typescript
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";

// All methods return Either<Error, T | undefined>
const result = await this.events["module-a"].method();

pipe(
  result,
  E.fold(
    (error) => console.error("Error:", error),
    (value) => {
      if (value === undefined) {
        console.log("Module not available");
      } else {
        console.log("Got value:", value);
      }
    }
  )
);
```

## Troubleshooting

### "Type 'X' is not assignable to type 'Y'"

Make sure you:
1. Used `@eventMethod` decorator on exposed methods
2. Registered module in `FeatureModuleRegistry` and `FeatureModuleEventMethods`
3. Used correct module name in dependency array

### Autocomplete Not Working

1. Restart TypeScript server in your IDE
2. Check that module is registered globally
3. Verify `features-event-dispatcher.d.ts` is in your project

### "Cannot find name 'FeatureModuleRegistry'"

Import the types:
```typescript
import type { EventDispatcherDependencies } from "../event-dispatcher-interfaces.ts";
```

## Technical Details

This system uses:
- **Declaration Merging**: Augments global `FeatureModuleRegistry` and `FeatureModuleEventMethods`
- **Conditional Types**: Extracts metadata types
- **Mapped Types**: Creates event method mappings
- **Type Inference**: Extracts method signatures

No code generation, no build step - pure TypeScript type system!
