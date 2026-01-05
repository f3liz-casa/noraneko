# Sidebar Module

Data-Oriented Programming (DOP) / Functional Programming (FP) style module following Julia/Kotlin conventions.

## Directory Structure

```
sidebar/
├── mod.ts          # Module entry point
├── types/          # Type definitions & Valibot schemas
│   ├── Panel.ts    # Panel type + schema
│   ├── Config.ts   # Config type + schema
│   ├── State.ts    # Window state types
│   ├── Extension.ts# Extension sidebar types
│   ├── Icon.ts     # Icon registration types
│   └── mod.ts      # Re-exports
├── data/           # Constants & defaults
│   ├── defaults.ts # Default values & pref names
│   ├── statics.ts  # Static panel data
│   └── mod.ts      # Re-exports
├── ops/            # Pure operations (no side effects)
│   ├── codec.ts    # Serialize/deserialize
│   ├── panels.ts   # Panel list operations
│   └── mod.ts      # Re-exports
├── io/             # Side-effectful operations
│   ├── favicon.ts  # Favicon fetching
│   ├── extensions.ts # Extension panel I/O
│   ├── user-context.ts # Container I/O
│   ├── web-request.ts # HTTP observer
│   └── mod.ts      # Re-exports
├── state/          # Reactive state
│   ├── signals.ts  # Preact signals
│   └── mod.ts      # Re-exports
└── ui/             # UI components
    ├── DockBar.tsx # Dock bar component
    ├── render.tsx  # DOM rendering utilities
    ├── styles/     # CSS styles
    └── mod.ts      # Re-exports
```

## Design Principles

### 1. Types First (Data-Oriented)

Types and Valibot schemas are co-located in `types/`:

```typescript
// types/Panel.ts
export const PanelSchema = v.object({ ... });
export type Panel = v.InferOutput<typeof PanelSchema>;
```

### 2. Pure Operations in `ops/`

Pure functions that transform data without side effects:

```typescript
// ops/panels.ts
export function findById(panels: Panels, id: string): Panel | undefined;
export function updatePanel(panels: Panels, updated: Panel): Panels;
```

### 3. Effects in `io/`

All side-effectful operations (network, DOM, prefs) are isolated:

```typescript
// io/favicon.ts
export async function getFavicon(panel: Panel): Promise<string>;
```

### 4. Reactive State in `state/`

Preact signals with preference persistence:

```typescript
// state/signals.ts
export const panels: () => Panels;
export const setPanels: (panels: Panels) => void;
```

### 5. Julia-style `mod.ts`

Each directory has a `mod.ts` that re-exports its contents.

## Usage

```typescript
import { defineModule } from "@lib/core";
import { Panel, Config } from "./types/mod.ts";
import { parsePanels, findById } from "./ops/mod.ts";
import { getFavicon } from "./io/mod.ts";
import { panels, setPanels } from "./state/mod.ts";
```
