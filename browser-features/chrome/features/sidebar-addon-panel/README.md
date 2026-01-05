# Sidebar Addon Panel Module

Data-Oriented Programming (DOP) / Functional Programming (FP) style module following Julia/Kotlin conventions.

## Directory Structure

```
sidebar-addon-panel/
├── mod.ts              # Module entry point
├── types/              # Type definitions
│   ├── Browser.ts      # Browser component types
│   ├── Panel.ts        # Panel & migration types
│   └── mod.ts          # Re-exports
├── data/               # Constants & defaults
│   ├── migration.ts    # Legacy data migration
│   ├── icons.ts        # Icon URLs
│   └── mod.ts          # Re-exports
├── ops/                # Pure operations (no side effects)
│   ├── navigation.ts   # Navigation command creators
│   └── mod.ts          # Re-exports
├── io/                 # Side-effectful operations
│   ├── panel-window.ts # WebsitePanel parent window I/O
│   ├── panel-child.ts  # WebsitePanelWindowChild I/O
│   └── mod.ts          # Re-exports
├── state/              # Reactive state
│   ├── callbacks.ts    # Callback registry state
│   └── mod.ts          # Re-exports
└── ui/                 # UI components
    ├── components/     # Preact/XUL components
    ├── browsers/       # Browser site components
    ├── styles/         # CSS styles
    └── mod.ts          # Re-exports
```

## Design Principles

### 1. Types First (Data-Oriented)

Types are co-located in `types/`:

```typescript
// types/Browser.ts
export type BrowserType = "web" | "extension" | "static";
export type BrowserProps = { id: string; type: BrowserType; url: string };
```

### 2. Pure Operations in `ops/`

Pure functions that describe navigation actions without side effects:

```typescript
// ops/navigation.ts
export type NavCommand = {
  panelId: string;
  action: "back" | "forward" | "reload";
};
export function createNavCommand(
  panelId: string,
  action: NavAction,
): NavCommand;
```

### 3. Effects in `io/`

All side-effectful operations (browser window access, DOM, prefs) are isolated:

```typescript
// io/panel-window.ts
export function toggleMutePanel(panelId: string): void;
export function zoomInPanel(panelId: string): void;
```

### 4. Reactive State in `state/`

Callback registry and module-level state:

```typescript
// state/callbacks.ts
export const callbacks: {
  dataUpdate: Set<Callback>;
  selectionChange: Set<Callback>;
};
```

### 5. Julia-style `mod.ts`

Each directory has a `mod.ts` that re-exports its contents.

## Usage

```typescript
import { defineModule } from "@lib/core";
import type { BrowserType } from "./types/mod.ts";
import { migratePanelSidebarData, ICON_NOTES } from "./data/mod.ts";
import { goBack, goForward, reload } from "./io/mod.ts";
import { callbacks } from "./state/mod.ts";
```
