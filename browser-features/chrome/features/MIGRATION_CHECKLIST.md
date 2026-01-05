# Migration Checklist for Browser Features

## ✅ Completed Features

### browser-share-mode

- [x] Created state/ directory with signals
- [x] Created ui/ directory with components
- [x] Migrated from SolidJS to Preact
- [x] Created mod.ts entry point
- [x] Created README.md
- [x] CSS moved to ui/styles/

### reverse-sidebar-position

- [x] Created mod.ts entry point (disabled)
- [x] Created README.md
- [x] Documented disabled state

### statusbar

- [x] Created data/ directory with constants
- [x] Created state/ directory with signals
- [x] Created io/ directory with CustomizableUI logic
- [x] Created ui/ directory with components
- [x] Migrated from SolidJS to Preact
- [x] Created mod.ts entry point
- [x] Created README.md
- [x] CSS moved to ui/styles/

### tab-rename

- [x] Created types/ directory
- [x] Created data/ directory with constants
- [x] Created ops/ directory with pure functions
- [x] Created io/ directory with persistence
- [x] Created state/ directory with signals
- [x] Created ui/ directory with input component
- [x] Migrated from SolidJS to Preact
- [x] Created mod.ts entry point
- [x] Created README.md
- [x] CSS moved to ui/styles/

### browser-tab-color

- [x] Simplified structure (mod.ts + ops.ts)
- [x] Inline signals and state
- [x] Pure functions in ops.ts

### context-menu

- [x] Single-file module (mod.ts)
- [x] Inline logic
- [x] No extra directories

### update-refresh-cache

- [x] Single-file module (mod.ts)
- [x] Inline logic

### undo-closed-tab

- [x] Simplified structure
- [x] Mod.ts for logic
- [x] ui/style.tsx for component

## Remaining Tasks

### Cleanup

- [x] Remove tmp/ directory (after all features migrated)
- [x] Remove old index.ts files
- [ ] Clean up any unused imports

### Testing

- [ ] Test browser-share-mode in browser
- [ ] Test statusbar in browser
- [ ] Test tab-rename in browser
- [ ] Test context menus
- [ ] Test customization
- [ ] Verifying build success

## 🎯 Quality Checks

For each refactored module:

- [x] All files have SPDX-License-Identifier
- [x] Each directory has mod.ts for re-exports
- [x] Pure functions separated (where applicable)
- [x] Side effects contained
- [x] Preact signals for state
- [x] defineModule pattern used
- [x] Cleanup functions tracked and called
- [x] TypeScript types are explicit
- [x] No implicit any

## 📊 Statistics

### Completed

- Features refactored: 8/8 (100%)
- Complex refactorings: 2 (statusbar, tab-rename)
- Simplified modules: 4 (browser-tab-color, context-menu, update-refresh-cache, undo-closed-tab)

### Pattern Updates

We now support two patterns:

1. **Full Structure**: For complex features (types/, state/, ui/, etc.)
2. **Simple Module**: For small features (just mod.ts or mod.ts + ops.ts)

## Happy Coding! :3
