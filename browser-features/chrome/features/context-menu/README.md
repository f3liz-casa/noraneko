# Context Menu

Simple event handler setup for browser context menus.

## 🎯 Overview

This lightweight module hooks up event listeners to the content area and tab context menus, ensuring that custom menu items registered through the UI library are properly displayed.

## 📂 Structure

```
context-menu/
├── mod.ts              # Module entry point
├── README.md           # This file
└── io/                 # Side effects
    ├── events.ts       # Event listener setup
    └── mod.ts          # Re-exports
```

## 🚀 Features

- **Content area menu**: Hooks into right-click context menu on web pages
- **Tab menu**: Hooks into tab bar context menu
- **Automatic cleanup**: Properly removes listeners on module cleanup
- **Minimal footprint**: No state, no UI - just event plumbing

## 🏗️ Design Principles

### Simplicity First

This module demonstrates the simplest possible DOP/FP structure:

- No data layer (no constants needed)
- No ops layer (no pure operations)
- No state layer (no reactive state)
- Only IO layer (just event listener setup)

### Single Responsibility

The module has one job: ensure context menu popup handlers are called when menus are shown.

## 🔧 Usage

This module is typically loaded automatically and requires no manual interaction. It works behind the scenes to enable other features' context menu integrations.

## 📊 Data Flow

```
User right-clicks
    ↓
Browser fires "popupshowing" event
    ↓
Event listener → onPopupShowing()
    ↓
UI library renders custom menu items
```

## 🎯 API Reference

### Functions

- `setupContextMenuListeners()`: Sets up event listeners and returns cleanup function
- `handleContentAreaPopupShowing()`: Handler for content area menu
- `handleTabPopupShowing()`: Handler for tab menu

## 🧪 Implementation Notes

- Relies on `lib/ui/mod.ts` for the actual popup showing logic
- Uses optional chaining to safely handle missing menu elements
- Follows the cleanup pattern with returned cleanup functions

## Happy Coding! :3
