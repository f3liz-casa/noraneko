# Statusbar Module

Provides a customizable statusbar at the bottom of the browser window. The statusbar can display various widgets and the status panel text.

## Directory Structure

```
statusbar/
├── mod.ts          # Module entry point
├── data/           # Constants & defaults
│   ├── constants.ts# Pref names, defaults, config
│   └── mod.ts      # Re-exports
├── state/          # Reactive state
│   ├── signals.ts  # Statusbar visibility signal
│   └── mod.ts      # Re-exports
├── io/             # Side-effectful operations
│   ├── customizable-ui.ts # CustomizableUI management
│   └── mod.ts      # Re-exports
└── ui/             # UI components
    ├── components/ # Individual components
    │   ├── StatusBar.tsx # Main toolbar
    │   └── ContextMenuItem.tsx # Context menu toggle
    ├── styles/     # CSS styles
    │   └── statusbar.css
    └── mod.ts      # Re-exports
```

## Design Principles

### 1. Reactive State with Pref Sync

The statusbar visibility is managed via Preact signals with bidirectional preference sync:

```typescript
import { showStatusBar, toggleStatusBar } from "./state/mod.ts";

// Read state
console.log(showStatusBar.value);

// Toggle statusbar
toggleStatusBar();

// Changes are automatically synced to preferences
```

### 2. Separation of Concerns

- **state/**: Pure reactive state
- **io/**: CustomizableUI registration, DOM manipulation
- **ui/**: Rendering components
- **data/**: Configuration constants

### 3. CustomizableUI Integration

The statusbar integrates with Firefox's CustomizableUI:

```typescript
// Registers area, toolbar, and widgets
initializeCustomizableUI();

// Cleanup
cleanupCustomizableUI();
```

### 4. Status Panel Integration

Moves the status panel label into the statusbar when enabled:

```typescript
// Automatically observes status panel changes
setupStatusPanel();
```

## Features

- Customizable toolbar at bottom of window
- Toggle via toolbar context menu
- Displays status panel text (link previews, etc.)
- Supports full widget customization
- Hides during fullscreen
- Preference persistence

## Usage

The module automatically initializes. Access state programmatically:

```typescript
import { showStatusBar, toggleStatusBar } from "./statusbar/mod.ts";

// Check if statusbar is visible
if (showStatusBar.value) {
  // ...
}

// Toggle programmatically
toggleStatusBar();
```

## Global API

Exposed via `window.gFloorp.statusBar`:

```typescript
window.gFloorp.statusBar.setShow(true);
```
