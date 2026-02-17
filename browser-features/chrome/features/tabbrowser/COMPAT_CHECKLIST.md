# Tabbrowser Compatibility Checklist

This checklist tracks the implementation status of the legacy `tabbrowser.js` API in the new TypeScript DOP architecture (`TabbrowserCompat.ts`).

## Core / Identity
- [ ] `init()`
- [ ] `destroy()`
- [ ] `get tabs()` (Implemented)
- [ ] `get selectedTab()` (Implemented)
- [ ] `set selectedTab(val)` (Implemented)
- [ ] `get selectedBrowser()` (Implemented)
- [ ] `get browsers()` (Implemented)

## Navigation (Forwarded to selectedBrowser)
- [ ] `loadURI(uri, params)` (Partial)
- [ ] `fixupAndLoadURIString(uriString, params)`
- [ ] `reload()`
- [ ] `reloadWithFlags(aFlags)`
- [ ] `stop()`
- [ ] `goBack(requireUserInteraction)`
- [ ] `goForward(requireUserInteraction)`
- [ ] `gotoIndex(aIndex)`
- [ ] `get canGoBack()`
- [ ] `get canGoForward()`

## Tab Lifecycle
- [ ] `addTab(uri, params)` (Partial)
- [ ] `addWebTab(aURI, params)`
- [ ] `addTrustedTab(aURI, options)`
- [ ] `removeTab(tab, params)` (Partial)
- [ ] `removeCurrentTab(params)`
- [ ] `duplicateTab(aTab, ...)`
- [ ] `pinTab(aTab)`
- [ ] `unpinTab(aTab)`

## Grouping & Split View
- [ ] `get tabGroups()`
- [ ] `_createTabGroup(...)`
- [ ] `getAllTabGroups(...)`
- [ ] `getTabGroupById(id)`
- [ ] `moveTabToExistingGroup(...)`
- [ ] `addTabSplitView(...)`
- [ ] `unsplitTabs(...)`

## Progress & Events
- [ ] `addProgressListener(aListener)`
- [ ] `removeProgressListener(aListener)`
- [ ] `handleEvent(aEvent)`
- [ ] `observe(aSubject, aTopic)`

## Subsystems
- [ ] `getFindBar(aTab)`
- [ ] `getNotificationBox(aBrowser)`
- [ ] `getTabDialogBox(aBrowser)`
- [ ] `setIcon(aTab, aIconURL, ...)`
- [ ] `updateTitlebar()`

*(Note: This is a high-level summary. The full grep list contains ~200 items to be implemented.)*
