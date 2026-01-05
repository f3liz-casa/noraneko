# Browser Tab Color

Automatically theme the browser's tab bar based on the website's manifest `theme_color`.

## 🎨 Overview

This feature reads the `manifest.json` of the current website and applies its `theme_color` to the browser's tab bar, creating a more cohesive and immersive browsing experience. The text color is automatically calculated to ensure good contrast.

## 📂 Structure

```
browser-tab-color/
├── mod.ts              # Module entry point
├── README.md           # This file
├── data/               # Constants & defaults
│   ├── constants.ts    # Pref keys, CSS vars, DOM IDs
│   └── mod.ts          # Re-exports
├── ops/                # Pure operations
│   ├── color.ts        # Color calculations
│   ├── styles.ts       # CSS generation
│   └── mod.ts          # Re-exports
├── io/                 # Side effects
│   ├── dom.ts          # DOM manipulation & manifest fetching
│   └── mod.ts          # Re-exports
└── state/              # Reactive state
    ├── signals.ts      # Signals & pref sync
    └── mod.ts          # Re-exports
```

## 🚀 Features

- **Automatic theming**: Reads `theme_color` from website manifest
- **Smart contrast**: Calculates appropriate text color (black/white) based on background luminance
- **Preference sync**: Integrates with Firefox preferences
- **Event-driven**: Updates on tab switch and navigation
- **Global API**: Accessible via `window.gFloorp.tabColor`

## 🔧 Usage

### Via Preference

```javascript
// Enable/disable via preference
Services.prefs.setBoolPref("noraneko.tabcolor.enable", true);
```

### Via Global API

```javascript
// Toggle tab coloring
window.gFloorp.tabColor.toggle();

// Set enabled state
window.gFloorp.tabColor.setEnable(true);
```

### Via Module Export

```typescript
import { toggleTabColor, setTabColorEnabled } from "./browser-tab-color/mod.ts";

toggleTabColor();
setTabColorEnabled(false);
```

## 🏗️ Design Principles

### Data-Oriented Programming (DOP)

- **Constants first**: All magic strings and values in `data/`
- **Immutable data**: Pure functions don't mutate state
- **Separation**: Data structures separate from operations

### Functional Programming (FP)

- **Pure operations**: Color calculations in `ops/` have no side effects
- **Effect isolation**: All DOM manipulation confined to `io/`
- **Composable**: Small, focused functions

### Reactive State

- **Preact signals**: Reactive state management
- **Automatic sync**: Preference changes reflect immediately
- **Effects**: Side effects triggered by state changes

## 📊 Data Flow

```
User Action / Pref Change
    ↓
tabColorEnabled signal
    ↓
effect() → updateTabColor()
    ↓
getCurrentManifest() → DOM manipulation
    ↓
Visual update in browser
```

## 🎯 API Reference

### Signals

- `tabColorEnabled`: Signal<boolean> - Whether tab coloring is enabled

### Functions

- `toggleTabColor()`: Toggle the feature
- `setTabColorEnabled(enabled: boolean)`: Set the enabled state
- `updateTabColor(enabled: boolean)`: Manually trigger update

### Pure Operations

- `getTextColor(backgroundColor: string)`: Calculate appropriate text color
- `isValidColor(color: string)`: Validate color string
- `generateTabColorStyles(themeColor: string)`: Generate CSS

## 🧪 Implementation Notes

- Uses `chroma-js` for color validation and luminance calculations
- Relies on Firefox's `ManifestObtainer` to fetch website manifests
- Applies theme only if manifest contains valid `theme_color`
- Automatically cleans up styles when disabled or navigating away

## Happy Coding! :3
