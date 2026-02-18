# Noraneko Architecture

This document provides a high-level overview of the Noraneko browser architecture.

## What is Noraneko?

Noraneko is a Firefox-based browser (testbed for Floorp 12) that extends Firefox with custom features, UI components, and modules. It uses Mozilla's artifact build system combined with a TypeScript/Deno-based toolchain.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Noraneko Browser                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     browser-features/                               │ │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐      │ │
│  │  │     chrome/     │ │    modules/     │ │     shared/     │      │ │
│  │  │   (UI/Content)  │ │ (System Modules)│ │  (Common Code)  │      │ │
│  │  │                 │ │                 │ │                 │      │ │
│  │  │ • Solid.js UI   │ │ • Actors        │ │ • CSK Commands  │      │ │
│  │  │ • Components    │ │ • Observers     │ │ • Type Defs     │      │ │
│  │  │ • Sidebars      │ │ • Handlers      │ │ • Utilities     │      │ │
│  │  └────────┬────────┘ └────────┬────────┘ └─────────────────┘      │ │
│  └───────────│────────────────────│─────────────────────────────────────┘ │
│              │                    │                                      │
│              │    Event Dispatcher                                       │
│              ▼                    ▼                                      │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         bridge/                                     │ │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐      │ │
│  │  │     startup/    │ │ loader-features/│ │  loader-modules/│      │ │
│  │  │ (Entry Point)   │ │ (Feature Loader)│ │ (Module Loader) │      │ │
│  │  │                 │ │                 │ │                 │      │ │
│  │  │ • Boot Scripts  │ │ • Module Init   │ │ • Constants     │      │ │
│  │  │ • Early Init    │ │ • EventDispatch │ │ • System Mods   │      │ │
│  │  │                 │ │ • Event System  │ │                 │      │ │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────┘      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                         Firefox Runtime                                  │
│                    (noraneko-runtime binary)                            │
└─────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
noraneko/
├── browser-features/          # Browser feature implementations
│   ├── chrome/                # UI components (Solid.js + XUL)
│   │   ├── common/            # Feature modules (sidebar, etc.)
│   │   ├── static/            # Static content
│   │   ├── utils/             # Chrome utilities
│   │   └── vite.config.ts     # Vite bundler config
│   ├── modules/               # System modules
│   │   ├── actors/            # XPCOM actors
│   │   └── modules/           # System module code
│   ├── shared/                # Shared code between chrome and modules
│   │   └── custom-shortcut-key/
│   ├── pages-newtab/          # New tab page
│   └── skin/                  # CSS themes and styles
│       ├── fluerial/          # Fluerial theme
│       ├── lepton/            # Lepton theme
│       └── noraneko/          # Noraneko theme
│
├── bridge/                    # Bridges between Noraneko and Firefox
│   ├── startup/               # Startup scripts (earliest execution)
│   ├── loader-features/       # Feature loader and module system
│   │   └── loader/
│   │       ├── index.ts       # Main loader
│   │       ├── modules.ts     # Module registry
│   │       ├── modules-hooks.ts
│   │       └── event-dispatcher-registry.ts
│   └── loader-modules/        # System module loader
│
├── libs/                      # Internal libraries
│   ├── @types/gecko/          # Gecko/Firefox type definitions
│   ├── solid-xul/             # Solid.js XUL integration
│   ├── vite-oxc-decorator-stage-3/
│   └── vite-plugin-gen-jarmn/
│
├── tools/                     # Build system
│   ├── feles-build.ts         # Main build entry point
│   ├── src/                   # Build scripts
│   ├── patches/               # Runtime patches
│   └── scripts/               # Utility scripts
│
├── docs/                      # Documentation
├── i18n/                      # Internationalization
├── static/                    # Static assets
│   └── gecko/                 # Gecko-specific files
├── vendor/                    # Vendored dependencies
│
├── deno.json                  # Deno workspace config
├── package.json               # Node dependencies
└── moz.build                  # Mozilla build integration
```

## Component Responsibilities

### browser-features/chrome

**Purpose:** Implements the user-facing features and UI components.

**Technology:** 
- Solid.js for reactive UI
- Custom XUL bindings (`@nora/solid-xul`)
- Vite for bundling

**Key Features:**
- Sidebar panel system
- Addon panels
- Undo closed tab UI
- Custom shortcut keys

**Output:** `chrome://noraneko/content/*`

### browser-features/modules

**Purpose:** System-level modules that integrate with Firefox internals.

**Technology:**
- TypeScript/JavaScript
- XPCOM actors
- Firefox's module system

**Components:**
- Parent/Child actors
- System observers
- Background handlers

**Output:** `resource://noraneko/modules/*`

### browser-features/shared

**Purpose:** Code shared between chrome and modules.

**Contains:**
- Type definitions
- Utility functions
- Command definitions
- Codecs (io-ts)

**Import Path:** `@nora/shared/`

### browser-features/skin

**Purpose:** CSS themes and styling.

**Themes:**
- **Fluerial** - Modern fluent design
- **Lepton** - Compact/efficient design
- **Noraneko** - Default Noraneko theme

**Output:** `skin://noraneko/*`

### bridge/startup

**Purpose:** First code to run during browser startup.

**Responsibilities:**
- Initialize Noraneko bootstrap
- Load feature loader
- Set up early preferences

**Output:** `chrome://noraneko-startup/content/*`

### bridge/loader-features

**Purpose:** Loads and manages feature modules.

**Key Components:**
- **Module Loader** - Loads modules based on preferences
- **EventDispatcher Registry** - Inter-module communication with Result error handling
- **Event Dispatcher** - Event routing between modules
- **Dependency Manager** - Handles module dependencies

**Features:**
- Soft and hard dependencies
- Graceful degradation
- Hot module replacement (dev)

### bridge/loader-modules

**Purpose:** Provides system modules and constants to Noraneko.

**Contents:**
- `NoranekoConstants` - Build info, versions
- `BrowserGlue` - Browser integration

**Output:** `resource://noraneko/*`

### libs/solid-xul

**Purpose:** Custom Solid.js integration for XUL elements.

**Features:**
- XUL element creation
- Custom JSX runtime
- DOM manipulation utilities

### tools/

**Purpose:** Build system implementation.

See [BUILD_SYSTEM.md](./BUILD_SYSTEM.md) for detailed documentation.

## Module Communication

Noraneko uses an **EventDispatcher-based system** for inter-module communication:

```typescript
// Module A exposes methods with @eventMethod decorator
import { component, eventMethod } from "#features-chrome/utils/base";

@component({
  moduleName: "my-module",
  hot: import.meta.hot,
})
export default class MyModule {
  @eventMethod
  getData(): string {
    return this.data;
  }
}

// Module B calls methods via this.events
import { component } from "#features-chrome/utils/base";
import type { EventDispatcherDependencies } from "../event-dispatcher-interfaces.ts";
import { pipe, Result as R } from "@mobily/ts-belt";

@component({
  moduleName: "other-module",
  softDependencies: ["my-module"],
  hot: import.meta.hot,
})
export default class OtherModule {
  protected events!: EventDispatcherDependencies<["my-module"]>;

  async init() {
    const result = await this.events["my-module"].getData();
    pipe(
      result,
      R.match(
        (data) => console.log("Got data:", data),
        (error) => console.error("Failed:", error)
      )
    );
  }
}
```

**Benefits:**
- No direct imports between modules
- Graceful handling of missing modules
- Clear API boundaries
- Type-safe error handling with Result

See [RPC_SYSTEM_README.md](./RPC_SYSTEM_README.md) for details.

## Chrome URLs

| URL | Source | Description |
|-----|--------|-------------|
| `chrome://noraneko/content/` | `browser-features/chrome/_dist` | Main UI content |
| `chrome://noraneko-startup/content/` | `bridge/startup/_dist` | Startup scripts |
| `resource://noraneko/` | `bridge/loader-modules/_dist` | System modules |
| `skin://noraneko/` | `browser-features/skin` | CSS themes |

## Build Process

```
Source Files                    Build                        Output
─────────────────────────────────────────────────────────────────────
browser-features/chrome/   ───► Vite ───►   _dist/content/
browser-features/skin/     ───► Copy ───►   _dist/skin/
bridge/startup/            ───► tsdown ──►  _dist/startup/
bridge/loader-modules/     ───► tsdown ──►  _dist/resource/
                                   │
                                   ▼
                           Runtime Binary
                          (with patches)
```

## Runtime Integration

Noraneko integrates with Firefox through:

1. **Patches** - Modify Firefox source to load Noraneko
2. **Manifest** - `chrome.manifest` registers chrome URLs
3. **Startup Script** - Runs during browser initialization
4. **Actors** - XPCOM actors for process communication

## Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| Assets | Symlinks to source | Copied to `_dist/noraneko/` |
| HMR | Enabled (Vite) | Disabled |
| Source Maps | Yes | Yes |
| Minification | No | No (intentional) |
| Binary | Downloaded artifact | Built via mach |

## Technology Stack

| Layer | Technology |
|-------|------------|
| Build Runner | Deno |
| Build Tools | Vite, tsdown, Rolldown |
| UI Framework | Solid.js |
| XUL Binding | solid-xul |
| Type System | TypeScript |
| Inter-module Communication | EventDispatcher with ts-belt Result |
| Styling | CSS, Tailwind CSS |
| Runtime | Firefox/Gecko |
| Package Manager | Deno |

## Key Concepts

### Artifact Builds
Noraneko uses Firefox's artifact build system - a prebuilt binary is downloaded and patched rather than compiling Firefox from source.

### Chrome Registration
Firefox uses `chrome.manifest` files to register content at chrome:// URLs. Noraneko creates its own manifest during build.

### Hot Module Replacement (HMR)
During development, Vite provides HMR for instant updates without browser restart. The `@component` decorator enables HMR for module classes.

### Soft Dependencies
Modules can declare soft dependencies that are optional. If a soft dependency isn't loaded, the module continues to work with degraded functionality.

## Further Reading

- [BUILD_SYSTEM.md](./BUILD_SYSTEM.md) - Detailed build system documentation
- [RPC_SYSTEM_README.md](./RPC_SYSTEM_README.md) - Inter-module EventDispatcher system
- [RPC_MIGRATION_GUIDE.md](./RPC_MIGRATION_GUIDE.md) - Migration guide for EventDispatcher
- [SHARED_CODE_STRUCTURE.md](./SHARED_CODE_STRUCTURE.md) - Shared code organization
