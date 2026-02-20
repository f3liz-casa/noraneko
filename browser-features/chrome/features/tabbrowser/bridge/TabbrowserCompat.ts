// SPDX-License-Identifier: MPL-2.0

import { appState, selectedTab as selectedTabSignal, orderedTabs, send } from "../state/store.ts";
import * as TabOps from "../ops/tab-ops.ts";
import * as GroupOps from "../ops/group-ops.ts";
import { DOMRegistry } from "./DOMRegistry.ts";
import { BrowserSystem } from "./BrowserSystem.ts";
import { NavigationSystem } from "./NavigationSystem.ts";
import type { TabId } from "../types/TabState.ts";

// Module method mixes (real implementations ported from Firefox tabbrowser.js)
import * as internals from "./modules/internals.ts";
import * as lifecycle from "./modules/lifecycle.ts";
import * as tabCrud from "./modules/tab-crud.ts";
import * as browserFindbar from "./modules/browser-findbar.ts";
import * as browserSwap from "./modules/browser-swap.ts";
import * as browserCreate from "./modules/browser-create.ts";
import * as tabMisc from "./modules/tab-misc.ts";
import * as tabEvents from "./modules/tab-events.ts";
import * as tabInfo from "./modules/tab-info.ts";
import * as browserDiscard from "./modules/browser-discard.ts";
import * as titleIcon from "./modules/title-icon.ts";
import * as extended from "./modules/extended.ts";
import * as splitViewOps from "./modules/split-view-ops.ts";
import * as tabDedup from "./modules/tab-dedup.ts";
import * as tabCollection from "./modules/tab-collection.ts";
import * as tabGroups from "./modules/tab-groups.ts";
import * as browserPanel from "./modules/browser-panel.ts";
import * as tabKeyboard from "./modules/tab-keyboard.ts";

// Access globals available in the Chrome context
declare const ChromeUtils: any;
declare const Services: any;
declare const Ci: any;

/**
 * TabbrowserCompat - gBrowser Replacement
 * 
 * This class masquerades as the original Tabbrowser class to maintain 
 * compatibility with existing .sys.mjs modules and chrome scripts.
 */
export class TabbrowserCompat {
  private _initialized = false;
  private _uniquePanelIDCounter = 0;
  private mProgressListeners: any[] = [];
  private mTabsProgressListeners: any[] = [];
  
  // Original Enums
  public closingTabsEnum = {
    ALL: 0, OTHER: 1, TO_START: 2, TO_END: 3, MULTI_SELECTED: 4, DUPLICATES: 6, ALL_DUPLICATES: 7,
  };

  constructor(protected window: Window) {
    // Define lazy module getters exactly like tabbrowser.js (Lines 105-130)
    ChromeUtils.defineESModuleGetters(this, {
      AsyncTabSwitcher: "moz-src:///browser/components/tabbrowser/AsyncTabSwitcher.sys.mjs",
      PictureInPicture: "resource://gre/modules/PictureInPicture.sys.mjs",
      SmartTabGroupingManager: "moz-src:///browser/components/tabbrowser/SmartTabGrouping.sys.mjs",
      SponsorProtection: "moz-src:///browser/components/newtab/SponsorProtection.sys.mjs",
      TabMetrics: "moz-src:///browser/components/tabbrowser/TabMetrics.sys.mjs",
      TabStateFlusher: "resource:///modules/sessionstore/TabStateFlusher.sys.mjs",
      TaskbarTabsUtils: "resource:///modules/taskbartabs/TaskbarTabsUtils.sys.mjs",
      TaskbarTabs: "resource:///modules/taskbartabs/TaskbarTabs.sys.mjs",
      UrlbarProviderOpenTabs: "moz-src:///browser/components/urlbar/UrlbarProviderOpenTabs.sys.mjs",
      GenAI: "resource:///modules/GenAI.sys.mjs",
      TabNotes: "moz-src:///browser/components/tabnotes/TabNotes.sys.mjs",
    });

    // Initialize internal collections and state expected by module implementations.
    // These mirror fields used extensively in the ported modules so they exist
    // synchronously on the compat instance.
    (this as any)._tabForBrowser = new Map();
    (this as any)._tabFilters = new Map();
    (this as any)._tabListeners = new Map();
    (this as any)._removingTabs = new Set();
    (this as any)._lastRelatedTabMap = new WeakMap();
    (this as any)._taskbarTab = null;
    (this as any)._taskbarTabTitle = null;
    (this as any)._taskbarTabTitleLastProfile = null;
    (this as any)._cachedTitleInfo = {};
    (this as any)._tabSwitchTelemetry = new Map();
    (this as any)._previousURL = null;
    (this as any)._dataURLRegEx = /^data:/;
    (this as any)._nonPrintingRegEx = /^(?:\s|\u00A0)*$/;
    (this as any)._shouldExposeContentTitle = true;
    (this as any)._shouldExposeContentTitlePbm = false;
    (this as any)._tabpanelsSelectHandler = null;
  }

  // DOM elements set up in init() — matches original tabbrowser.js
  tabContainer: any = null;
  tabGroupMenu: any = null;
  tabNoteMenu: any = null;
  tabbox: any = null;
  tabpanels: any = null;
  pinnedTabsContainer: any = null;
  splitViewCommandSet: any = null;

  init() {
    if (this._initialized) return;
    const doc = (this.window as any).document;
    this.tabContainer = doc.getElementById("tabbrowser-tabs");
    this.tabGroupMenu = doc.getElementById("tab-group-editor");
    this.tabNoteMenu = doc.getElementById("tab-note-menu");
    this.tabbox = doc.getElementById("tabbrowser-tabbox");
    this.tabpanels = doc.getElementById("tabbrowser-tabpanels");
    this.pinnedTabsContainer = doc.getElementById("pinned-tabs-container");
    this.splitViewCommandSet = doc.getElementById("splitViewCommands");
    this._setupEventListeners();
    this._initialized = true;
  }

  /**
   * Returns the original AsyncTabSwitcher instance initialized with THIS compat class.
   * This ensures the legacy switcher "thinks" it's talking to the old tabbrowser.
   */
  private _switcher: any = null;
  _getSwitcher() {
    if (!this._switcher) {
      this._switcher = new (this as any).AsyncTabSwitcher(this);
    }
    return this._switcher;
  }

  // ==========================================================================
  // Logic Reliance: We delegate to original .sys.mjs where possible
  // ==========================================================================

  warmupTab(tab: any) {
    if (Services.appinfo.browserTabsRemoteAutostart) {
      this._getSwitcher().warmupTab(tab);
    }
  }

  discardBrowser(tab: any) {
    const id = (tab as any)?._tabId;
    if (id) {
      // Rely on original TabStateFlusher to save data before discard
      (this as any).TabStateFlusher.flush(this.getBrowserForTab(tab));
      
      send({ type: "DISCARD_TAB", tabId: id });
      const browser = DOMRegistry.getBrowser(id);
      if (browser) {
          browser.parentNode?.parentNode?.parentNode?.remove();
          DOMRegistry.unregisterBrowser(id);
      }
      tab.dispatchEvent(new CustomEvent("TabBrowserDiscarded", { bubbles: true }));
    }
  }

  // ==========================================================================
  // Context Menu Implementation (Now relying on GenAI/TabNotes .sys.mjs)
  // ==========================================================================

  updateContextMenu(popup: any) {
    const triggerTab = popup.triggerNode?.closest("tab");
    const contextTab = triggerTab || this.selectedTab;
    if (!contextTab) return;

    // Delegate to original GenAI menu builder
    (this as any).GenAI.buildTabMenu(popup.querySelector("#context_askChat"), this);
    
    // ... (rest of context menu visibility logic from previous turn) ...
  }

  // ==========================================================================
  // Infrastructure & Lifecycle
  // ==========================================================================

  handleEvent(event: Event) {
    switch (event.type) {
      case "keydown": break;
      case "visibilitychange": this._handleVisibilityChange(); break;
      case "pagetitlechanged":
        const tab = this.getTabForBrowser(event.target);
        if (tab) this.setTabTitle(tab);
        break;
      case "DOMAudioPlaybackStarted":
        const startTab = this.getTabForBrowser(event.target);
        if (startTab) send({ type: "UPDATE_AUDIO_STATE", tabId: startTab._tabId, soundPlaying: true });
        break;
      case "DOMAudioPlaybackStopped":
        const stopTab = this.getTabForBrowser(event.target);
        if (stopTab) send({ type: "UPDATE_AUDIO_STATE", tabId: stopTab._tabId, soundPlaying: false });
        break;
    }
  }

  _generateUniquePanelID(): string { 
    const outerID = (this.window as any).docShell?.outerWindowID || "0"; 
    return `panel-${outerID}-${++this._uniquePanelIDCounter}`; 
  }

  destroy() { 
    const doc = this.window.document; 
    doc.removeEventListener("keydown", this, { capture: true } as any); 
    this.window.removeEventListener("visibilitychange", this); 
  }

  private _handleVisibilityChange() { 
    const inactive = this.window.document.hidden; 
    if (!this._switcher) {
        for (const id of appState.value.tabOrder) {
            const browser = DOMRegistry.getBrowser(id);
            if (browser) (browser as any).docShellIsActive = !inactive;
        }
    }
  }

  // ==========================================================================
  // Public API Bridge (Delegates to DOP Ops)
  // ==========================================================================

  get tabs() { return orderedTabs.value.map(t => DOMRegistry.getTab(t.id)).filter(Boolean) as Element[]; }
  get selectedTab() { const data = selectedTabSignal.value; return data ? DOMRegistry.getTab(data.id) : null; }
  set selectedTab(val: any) {
    if (val && (val as any)._tabId) {
      const oldTab = this.selectedTab;
      send({ type: "SELECT_TAB", tabId: (val as any)._tabId });
      val.dispatchEvent(new CustomEvent("TabSelect", { bubbles: true, detail: { previousTab: oldTab } }));
      this._tabAttrModified(oldTab, ["selected"]);
      this._tabAttrModified(val, ["selected"]);
      this.updateCurrentBrowser(false);
    }
  }
  get selectedBrowser() { const data = selectedTabSignal.value; return data ? DOMRegistry.getBrowser(data.id) : null; }

  addTab(uri: string, options: any = {}) {
    const id = crypto.randomUUID();
    const tabIndex = TabOps.calculateInsertionIndex(appState.value, { tabIndex: options.tabIndex, openerTabId: options.openerTabId, isPinned: options.pinned });
    const newTabData = TabOps.createTab(id, uri, options);
    send({ type: "ADD_TAB", tab: newTabData, index: tabIndex });
    if (!options.createLazyBrowser) this._insertBrowser(id, options);
    const tabEl = DOMRegistry.getTab(id);
    if (tabEl) tabEl.dispatchEvent(new CustomEvent("TabOpen", { bubbles: true, detail: options.eventDetail }));
    return tabEl;
  }

  removeTab(tab: any, options: any = {}) {
    const id = tab?._tabId;
    if (id && this._beginRemoveTab(tab, options)) {
        if (!options.animate) this._endRemoveTab(tab);
        else setTimeout(() => this._endRemoveTab(tab), 300);
    }
  }

  _beginRemoveTab(tab: any, options: any = {}): boolean {
    const id = tab._tabId;
    if (appState.value.tabs[id]?.isClosing) return false;
    send({ type: "BEGIN_CLOSE_TAB", tabId: id });
    tab.dispatchEvent(new CustomEvent("TabClose", { bubbles: true, detail: options }));
    return true;
  }

  _endRemoveTab(tab: any) {
    const id = tab._tabId;
    const browser = DOMRegistry.getBrowser(id);
    if (browser) { browser.parentNode?.parentNode?.parentNode?.remove(); DOMRegistry.unregisterBrowser(id); }
    send({ type: "END_CLOSE_TAB", tabId: id });
  }

  // Forwarded properties
  get docShell() { return (this.selectedBrowser as any)?.docShell; }
  get webNavigation() { return (this.selectedBrowser as any)?.webNavigation; }
  get webProgress() { return (this.selectedBrowser as any)?.webProgress; }
  get contentTitle() { return (this.selectedBrowser as any)?.contentTitle; }

  // Expose panel container for legacy direct DOM access
  get mPanelContainer() { return this.tabpanels; }

  loadURI(uri: string, options: any = {}) { NavigationSystem.loadURI((this.selectedTab as any)._tabId, uri, options); }

  getBrowserForTab(tab: any) { return DOMRegistry.getBrowser(tab?._tabId); }
  getTabForBrowser(browser: any) { return DOMRegistry.getTab(browser?._tabId); }

  _tabAttrModified(tab: any, changed: string[]) { if (tab) tab.dispatchEvent(new CustomEvent("TabAttrModified", { bubbles: true, detail: { changed } })); }

  // Progress listener registration (gBrowser compatibility)
  addProgressListener(listener: any) { if (!this.mProgressListeners.includes(listener)) this.mProgressListeners.push(listener); }
  removeProgressListener(listener: any) { const i = this.mProgressListeners.indexOf(listener); if (i >= 0) this.mProgressListeners.splice(i, 1); }
  addTabsProgressListener(listener: any) { if (!this.mTabsProgressListeners.includes(listener)) this.mTabsProgressListeners.push(listener); }
  removeTabsProgressListener(listener: any) { const i = this.mTabsProgressListeners.indexOf(listener); if (i >= 0) this.mTabsProgressListeners.splice(i, 1); }

  _callProgressListeners(browser: any, method: string, args: any[]) {
    browser = browser || this.selectedBrowser;
    const tabsArgs = [browser, ...args];
    for (const l of (browser === this.selectedBrowser ? this.mProgressListeners : [])) if (method in l) l[method](...args);
    for (const l of this.mTabsProgressListeners) if (method in l) l[method](...tabsArgs);
  }

  // Internal helper to attempt wiring into a browser's webProgress (best-effort)
  _wireProgressListener(browser: any) {
    try {
      const wp = (browser as any)?.webProgress;
      if (!wp || typeof wp.addProgressListener !== "function") return;
      const listener = {
        onStateChange: (...a: any[]) => this._callProgressListeners(browser, "onStateChange", a),
        onLocationChange: (...a: any[]) => this._callProgressListeners(browser, "onLocationChange", a),
        onProgressChange: (...a: any[]) => this._callProgressListeners(browser, "onProgressChange", a),
        onStatusChange: (...a: any[]) => this._callProgressListeners(browser, "onStatusChange", a),
      };
      try { wp.addProgressListener(listener); } catch (_) { /* best-effort */ }
    } catch (_) { /* swallow */ }
  }

  // Basic tab manipulation wrappers (compat)
  pinTab(tab: any) { const id = tab?._tabId; if (id) send({ type: "PIN_TAB", tabId: id }); }
  unpinTab(tab: any) { const id = tab?._tabId; if (id) send({ type: "UNPIN_TAB", tabId: id }); }
  duplicateTab(tab: any) { const id = tab?._tabId; if (id) { send({ type: "DUPLICATE_TAB", tabId: id }); } }
  moveTabTo(tab: any, index: number) { const id = tab?._tabId; if (id) send({ type: "MOVE_TAB", tabId: id, newIndex: index }); }
  moveTabRelative(tab: any, target: any, position: "before" | "after" = "after") { const id = tab?._tabId; const targetId = target?._tabId; if (id && targetId) send({ type: "MOVE_TAB_RELATIVE", tabId: id, targetId, position }); }
  moveTabToSplitView(tab: any, splitViewId: any) { const id = tab?._tabId; if (id && splitViewId) send({ type: "ADD_TAB_TO_SPLIT_VIEW", splitViewId, tabId: id }); }
  swapBrowsersAndCloseOther(tabA: any, tabB: any) {
    const idA = tabA?._tabId; const idB = tabB?._tabId;
    if (!idA || !idB) return;
    const uriB = appState.value.tabs[idB]?.uri;
    if (uriB) send({ type: "UPDATE_LOCATION", tabId: idA, uri: uriB });
    this.removeTab(tabB, { animate: false });
  }

  // Multi-select support (selectedTabs and range selection)
  get selectedTabs() { return appState.value.tabOrder.filter(id => appState.value.tabs[id]?.isMultiSelected).map(id => DOMRegistry.getTab(id)).filter(Boolean) as Element[]; }
  addRangeToSelection(start: number | any, end: number | any) {
    const order = appState.value.tabOrder;
    let s = typeof start === "number" ? start : order.indexOf(start?._tabId);
    let e = typeof end === "number" ? end : order.indexOf(end?._tabId);
    if (s === -1 || e === -1) return;
    if (s > e) [s, e] = [e, s];
    const tabIds = order.slice(s, e + 1);
    send({ type: "SET_MULTI_SELECTION", tabIds, isSelected: true });
  }
  clearSelection() { send({ type: "CLEAR_MULTI_SELECTION" }); }

  // Navigation helpers
  reloadTab(tab: any, flags: any = {}) {
    const browser = this.getBrowserForTab(tab);
    if (!browser) return;
    const b: any = browser;
    if (typeof b.reload === "function") { try { b.reload(flags?.skipCache); } catch (e) { b.contentWindow?.location?.reload(flags?.skipCache); } }
    else b.contentWindow?.location?.reload(flags?.skipCache);
  }
  reloadAllTabs(flags: any = {}) { for (const id of appState.value.tabOrder) { const tabEl = DOMRegistry.getTab(id); this.reloadTab(tabEl, flags); } }
  goBack(tab: any) { const browser = this.getBrowserForTab(tab) as any; if (!browser) return; if (browser.webNavigation?.canGoBack) browser.webNavigation.goBack(); else browser.contentWindow?.history?.back(); }
  goForward(tab: any) { const browser = this.getBrowserForTab(tab) as any; if (!browser) return; if (browser.webNavigation?.canGoForward) browser.webNavigation.goForward(); else browser.contentWindow?.history?.forward(); }

  // Minimal compatibility helpers and no-op implementations for legacy callers
  showFullScreenViewContextMenuItems(...args: any[]) { /* no-op compat */ }
  getTabPids(tabs?: any) { const ids = Array.isArray(tabs) ? tabs.map(t => t?._tabId ?? t) : tabs ? [tabs?._tabId ?? tabs] : appState.value.tabOrder; return ids.map(id => appState.value.engineStates[id]?.processId ?? null); }
  shouldActivateDocShell(browser?: any) { const b = browser || this.selectedBrowser; return !!(b && (b as any).docShell); }
  _setupInitialBrowserAndTab() { try { if (!appState.value.tabOrder.length) { const el = this.addTab("about:blank", {}); if (el) this.selectedTab = el; } else { const selId = appState.value.selectedTabId; if (!selId && appState.value.tabOrder[0]) { const t = DOMRegistry.getTab(appState.value.tabOrder[0]); if (t) this.selectedTab = t; } } } catch (_) { /* swallow */ }
  updateTitlebar() { try { if ((BrowserSystem as any)?.updateTitlebar) (BrowserSystem as any).updateTitlebar(this.window); } catch (_) { /* swallow */ } }
  createUserContextMenu(menu: any) { // Minimal fallback used by some legacy callers
    try { if ((this as any).createReopenInContainerMenu) return (this as any).createReopenInContainerMenu(menu); } catch (_) {}
    return null;
  }

  private _setupEventListeners() {
    const doc = this.window.document;
    doc.addEventListener("keydown", this, { capture: true } as any);
    this.window.addEventListener("visibilitychange", this);
    this.window.addEventListener("DOMAudioPlaybackStarted", this);
    this.window.addEventListener("DOMAudioPlaybackStopped", this);
  }
}

export function initCompat(window: any) {
  // Merge canonical module implementations onto the compat prototype so
  // the instance exposes full gBrowser behavior (modules may overwrite
  // lightweight shim methods defined above).
  const moduleMethods = [
    internals.methods,
    lifecycle.methods,
    tabCrud.methods,
    browserFindbar.methods,
    browserSwap.swapBrowserMethods,
    browserCreate.methods,
    tabMisc.methods,
    tabEvents.methods,
    tabInfo.methods,
    browserDiscard.methods,
    titleIcon.methods,
    extended.methods,
    splitViewOps.methods,
    tabDedup.methods,
    tabCollection.methods,
    tabGroups.methods,
    browserPanel.methods,
    tabKeyboard.methods,
  ].filter(Boolean as any);

  for (const m of moduleMethods) {
    try { Object.assign(TabbrowserCompat.prototype, m); } catch (_) { /* best-effort merge */ }
  }

  const compat = new TabbrowserCompat(window);
  compat.init();
  Object.defineProperty(window, "gBrowser", { get: () => compat, configurable: true });
}
