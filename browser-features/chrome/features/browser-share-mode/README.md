# Browser Share Mode

Simple feature that provides a "Share Mode" toggle in the Tools menu. When enabled, it hides various UI elements and displays a share mode indicator.

## Directory Structure

```
browser-share-mode/
├── mod.ts          # Module entry point
├── state/          # Reactive signals
│   ├── signals.ts  # Share mode toggle state
│   └── mod.ts      # Re-exports
└── ui/             # UI components
    ├── components/ # Menu item component
    │   └── ShareModeMenuItem.tsx
    ├── styles/     # CSS styles
    │   └── share-mode.css
    └── mod.ts      # Re-exports
```

## Design Principles

### 1. Reactive State

The share mode toggle is managed via Preact signals:

```typescript
import { shareModeEnabled, toggleShareMode } from "./state/mod.ts";

// Read the current state
console.log(shareModeEnabled.value);

// Toggle share mode
toggleShareMode();
```

### 2. Functional UI

UI component is a pure function that renders based on signal state:

```typescript
export function ShareModeMenuItem() {
  return (
    <>
      <xul:menuitem
        checked={shareModeEnabled.value}
        onCommand={toggleShareMode}
      />
      {shareModeEnabled.value && <style>{shareModeStyle}</style>}
    </>
  );
}
```

### 3. Lifecycle Management

Module properly manages initialization and cleanup:

```typescript
export default defineModule({
  init(ctx) {
    cleanup = renderShareModeMenuItem();
  },
  cleanup(ctx) {
    cleanup?.();
  },
});
```

## Usage

The module automatically registers itself and renders the menu item in the Tools menu. No manual setup required.

```typescript
import ShareModeModule from "./browser-share-mode/mod.ts";
```

## Features

- Simple toggle in Tools menu (S accesskey)
- Hides non-essential UI elements when enabled
- Shows "Share Mode" indicator on FxA button
- CSS-only implementation (no JavaScript overhead)
