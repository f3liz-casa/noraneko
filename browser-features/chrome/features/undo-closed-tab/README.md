# Undo Closed Tab

Adds a dedicated toolbar button to undo the last closed tab.

## 🎯 Overview

This feature integrates with `CustomizableUI` to provide a drag-and-drop toolbar button that executes `window.undoCloseTab()`. It includes dynamic localization support.

## 📂 Structure

```
undo-closed-tab/
├── mod.ts              # Module entry point
├── README.md           # This file
├── data/               # Constants
│   ├── constants.ts    # Widget IDs
│   └── mod.ts          # Re-exports
├── io/                 # Side effects
│   ├── widget.ts       # Widget creation & i18n
│   └── mod.ts          # Re-exports
└── ui/                 # UI components
    ├── styles/         # CSS
    ├── style.tsx       # Style element
    └── mod.ts          # Re-exports
```

## 🚀 Features

- **Toolbar Button**: Adds a button to the browser's navbar (default position 2)
- **Native Action**: Uses `window.undoCloseTab()`
- **Localization**: Updates label and tooltip on language change

## 🔧 Usage

This module initializes automatically. The button is added to the toolbar if not present.

## 📊 Data Flow

```
init()
  ↓
createUndoClosedTabButton()
  ↓
Create Widget (CustomizableUI)
  ↓
setupWidget(node)
  ↓
Add i18next observer for labels
```

## Happy Coding! :3
