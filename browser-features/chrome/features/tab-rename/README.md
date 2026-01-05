# Tab Rename Module

Allows users to set custom names for tabs that persist across sessions. Custom names are displayed in place of the page title.

## Directory Structure

```
tab-rename/
├── mod.ts          # Module entry point
├── types/          # Type definitions
│   ├── TabRenameData.ts # Tab rename data type
│   └── mod.ts      # Re-exports
├── data/           # Constants
│   ├── constants.ts# Pref names
│   └── mod.ts      # Re-exports
├── ops/            # Pure operations
│   ├── tabs.ts     # Tab ID, serialization
│   └── mod.ts      # Re-exports
├── io/             # Side effects
│   ├── tabs.ts     # Persistence, DOM ops
│   └── mod.ts      # Re-exports
├── state/          # Reactive state
│   ├── signals.ts  # Renamed tabs map
│   └── mod.ts      # Re-exports
└── ui/             # UI components
    ├── input.ts    # Rename input UI
    ├── styles/     # CSS styles
    │   └── tab-rename.css
    └── mod.ts      # Re-exports
```

## Design Principles

### 1. Data-Oriented

Tab rename data is a simple Map structure:

```typescript
interface TabRenameData {
  tabId: string;
  customName: string;
  originalTitle: string;
}

type TabRenameMap = Map<string, TabRenameData>;
```

### 2. Pure Operations

Tab ID generation and map manipulation are pure functions in `ops/`:

```typescript
import { getTabId, setTabNameInMap } from "./ops/mod.ts";

const tabId = getTabId(tab);
const newMap = setTabNameInMap(map, tabId, "My Custom Name", "Original Title");
```

### 3. Side Effects in I/O

All persistence and DOM manipulation is in `io/`:

```typescript
import { setTabName, applyTabName } from "./io/mod.ts";

// Sets name and saves to preferences
setTabName(tab, "New Name");

// Applies custom name to DOM
applyTabName(tab);
```

### 4. Reactive State

Tab rename map is a Preact signal:

```typescript
import { renamedTabs } from "./state/mod.ts";

// Access the map
console.log(renamedTabs.value.size);
```

## Usage

### Programmatic API

```typescript
import {
  setTabName,
  getTabName,
  getOriginalTitle,
  clearTabName,
} from "./tab-rename/mod.ts";

// Set a custom name
setTabName(tab, "My Custom Tab");

// Get the custom name
const customName = getTabName(tab);

// Get the original title
const original = getOriginalTitle(tab);

// Clear the custom name
clearTabName(tab);
```

### Global Function

The module exposes a global function for UI integration:

```typescript
window.gNoraShowTabRenameInput(tab);
```

This shows an inline input for renaming the tab.

## Features

- Custom tab names persist across sessions
- Inline input for renaming
- Original title preserved
- CSS-based display (no JS overhead)
- Automatic application on tab open
- Data stored in preferences

## CSS Integration

Custom names are applied via CSS custom properties:

```css
.tabbrowser-tab[data-customlabel]::before {
  content: var(--customlabel);
}
```
