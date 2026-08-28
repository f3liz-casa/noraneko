// SPDX-License-Identifier: MPL-2.0
/// <reference path="./gecko-types.d.ts" />

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
  _initialized = false;
  _uniquePanelIDCounter = 0;
  mProgressListeners: any[] = [];
  mTabsProgressListeners: any[] = [];
  
  // tabbrowser.js: AsyncTabSwitcher and friends reach the window and the
  // document through these, not through `window`. Firefox 143 (the current
  // runtime) reads `ownerGlobal`; 149 renamed it `documentGlobal`.
  ownerGlobal: Window;
  documentGlobal: Window;
  ownerDocument: Document;
  // Tabs whose layers the switcher keeps warm, and browsers in print preview.
  _tabLayerCache: any[] = [];
  _printPreviewBrowsers = new Set<any>();

  // Original Enums
  public closingTabsEnum = {
    ALL: 0, OTHER: 1, TO_START: 2, TO_END: 3, MULTI_SELECTED: 4, DUPLICATES: 6, ALL_DUPLICATES: 7,
  };

  constructor(public window: Window) {
    this.ownerGlobal = window;
    this.documentGlobal = window;
    this.ownerDocument = (window as any).document;
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
    (this as any)._lastFindValue = "";
  }

  // Filled in by defineESModuleGetters above (type only; `declare` emits nothing).
  declare readonly AsyncTabSwitcher: any;
  declare readonly PictureInPicture: any;
  declare readonly SmartTabGroupingManager: any;
  declare readonly SponsorProtection: any;
  declare readonly TabMetrics: any;
  declare readonly TabStateFlusher: any;
  declare readonly TaskbarTabsUtils: any;
  declare readonly TaskbarTabs: any;
  declare readonly UrlbarProviderOpenTabs: any;
  declare readonly GenAI: any;
  declare readonly TabNotes: any;
  // Assigned in the constructor via `(this as any)`.
  declare _taskbarTab: any;
  declare _taskbarTabTitleLastProfile: any;
  declare _lastFindValue: string;

  // DOM elements bound in _bindDomElements() — matches original tabbrowser.js.
  // `tabContainer` is a getter from tab-collection; an instance field here
  // would shadow it, hence `declare`.
  declare readonly tabContainer: any;
  tabGroupMenu: any = null;
  tabNoteMenu: any = null;
  tabbox: any = null;
  tabpanels: any = null;
  pinnedTabsContainer: any = null;
  splitViewCommandSet: any = null;

  // Called by initCompat before init(); init() itself comes from lifecycle.ts.
  _bindDomElements() {
    const doc = (this.window as any).document;
    this.tabGroupMenu = doc.getElementById("tab-group-editor");
    this.tabNoteMenu = doc.getElementById("tab-note-menu");
    this.tabbox = doc.getElementById("tabbrowser-tabbox");
    this.tabpanels = doc.getElementById("tabbrowser-tabpanels");
    this.pinnedTabsContainer = doc.getElementById("pinned-tabs-container");
    this.splitViewCommandSet = doc.getElementById("splitViewCommands");
  }

  /**
   * Adopt tabs that already exist in the DOM. Firefox's own Tabbrowser has
   * already run init() by the time browser-window-domcontentloaded fires, so
   * the initial <tab> and its linkedBrowser are there; register them in our
   * state instead of creating a second tab.
   */
  _adoptExistingTabs() {
    // Firefox's Tabbrowser already numbered the panels it made (panel-<win>-1
    // for the first tab). Two counters starting at 0 would hand the next tab
    // the same id, and a tabbox cannot tell two tabs apart by one panel.
    for (const panel of Array.from(this.tabpanels?.children ?? []) as Element[]) {
      const m = /^panel-\d+-(\d+)$/.exec(panel.id);
      if (m) this._uniquePanelIDCounter = Math.max(this._uniquePanelIDCounter, Number(m[1]));
    }
    const tabEls = Array.from(
      this.tabContainer?.querySelectorAll?.('tab[is="tabbrowser-tab"]') ?? [],
    ) as any[];
    for (const tabEl of tabEls) {
      if (tabEl._tabId) continue;
      const id = crypto.randomUUID();
      const browser = tabEl.linkedBrowser ?? null;
      const uri = browser?.currentURI?.spec ?? "about:blank";
      send({
        type: "ADD_TAB",
        tab: TabOps.createTab(id, uri, {
          isPinned: !!tabEl.pinned,
          isSelected: !!tabEl.selected,
          label: tabEl.label || "New Tab",
        }),
        index: appState.value.tabOrder.length,
      });
      tabEl._tabId = id;
      DOMRegistry.registerTab(id, tabEl);
      if (browser) {
        DOMRegistry.registerBrowser(id, browser);
        this._tabForBrowser.set(browser, tabEl);
      }
      if (tabEl.selected) send({ type: "SELECT_TAB", tabId: id });
    }
    if (tabEls.length) {
      console.debug(`[noraneko/tabbrowser] adopted ${tabEls.length} existing tab(s)`);
    }
  }

  /**
   * Returns the original AsyncTabSwitcher instance initialized with THIS compat class.
   * This ensures the legacy switcher "thinks" it's talking to the old tabbrowser.
   */
  _switcher: any = null;

  // Expose panel container for legacy direct DOM access
  get mPanelContainer() { return this.tabpanels; }

  // Internal helper to attempt wiring into a browser's webProgress (best-effort)
  _wireProgressListener(_tab: any, browser: any) {
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

  // Synchronously create minimal XUL-like DOM elements for legacy modules.
  _xulEl(tagName: string, attrs?: Record<string, any>) {
    const doc = (this.window as any).document;
    let el: Element;
    // A customized built-in (`is`) only upgrades when passed at creation;
    // setAttribute("is") afterwards leaves a plain <tab>/<browser>.
    const init = attrs?.is ? { is: attrs.is } : undefined;
    try {
      if (typeof doc.createXULElement === "function") {
        el = doc.createXULElement(tagName, init);
      } else {
        el = doc.createElement(tagName, init);
      }
    } catch (_) {
      el = doc.createElement(tagName, init);
    }
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        if (k === "is") continue;
        const v = attrs[k];
        if (k === "class" || k === "className") (el as any).className = v;
        else el.setAttribute(k, String(v));
      }
    }
    return el;
  }

  /**
   * Create and insert browser/tab DOM elements synchronously for the given tab id.
   * This ensures legacy callers get real elements immediately instead of stubs.
   */
  _createBrowserDOM(id: string, options: any = {}) {
    try {
      const state = appState.value.tabs[id];
      const uri = state?.uri ?? "about:blank";

      // Create tab element using module-provided helper if available.
      const tabEl = (this as any)._createTab ? (this as any)._createTab({
        uriString: uri,
        userContextId: state?.userContextId,
        openerTab: state?.openerTabId ? DOMRegistry.getTab(state.openerTabId) : null,
        pinned: state?.isPinned,
        noInitialLabel: false,
        skipBackgroundNotify: false,
        animate: false,
      }) : this._xulEl("tab");

      (tabEl as any)._tabId = id;
      DOMRegistry.registerTab(id, tabEl);

      // Insert tab into tabContainer in the correct order according to appState.
      const order = appState.value.tabOrder;
      const idx = order.indexOf(id);
      const nextId = order[idx + 1];
      const nextEl = nextId ? DOMRegistry.getTab(nextId) : null;
      if (nextEl && this.tabContainer?.insertBefore) this.tabContainer.insertBefore(tabEl, nextEl);
      else this.tabContainer?.appendChild?.(tabEl);
      // tabs.js caches `allTabs`; tabbrowser.js drops that cache on every
      // insertion, and selectedIndex/selectedItem look the tab up through it.
      this.tabContainer?._invalidateCachedTabs?.();

      // Create actual browser element for the tab.
      const res = (this as any)._createBrowserForTab ? (this as any)._createBrowserForTab(tabEl, {
        uriString: uri,
        userContextId: state?.userContextId,
        remoteType: options.remoteType,
      }) : { browser: null };
      const browser = res?.browser;
      if (browser) {
        DOMRegistry.registerBrowser(id, browser);
        // tabbrowser.js _insertBrowser: the panel (browserSidebarContainer)
        // goes into the deck under a unique id, and the tab points at it
        // through linkedPanel — that is how the tabbox finds what to show.
        const panel = this.getPanel(browser);
        if (panel) {
          panel.id = this._generateUniquePanelID();
          (tabEl as any).linkedPanel = panel.id;
          this.tabpanels?.appendChild?.(panel);
        }
        this._tabForBrowser.set(browser, tabEl);
        try { this._wireProgressListener(tabEl, browser); } catch (_) { /* best-effort */ }
      }
    } catch (e) {
      console.error("Failed to synchronously create browser DOM for tab", id, e);
    }
  }

  // tabs.js getRelatedElement calls this for a selected tab that has no
  // linkedPanel. A tab that already has its browser must not get a second
  // one (and _createBrowserDOM would also mint a second <tab>).
  _insertBrowser(tabOrId: any, options: any = {}) {
    const id = typeof tabOrId === "string" ? tabOrId : tabOrId?._tabId;
    if (!id || DOMRegistry.getBrowser(id)) return;
    this._createBrowserDOM(id, options);
  }

  moveTabRelative(tab: any, target: any, position: "before" | "after" = "after") { const id = tab?._tabId; const targetId = target?._tabId; if (id && targetId) send({ type: "MOVE_TAB_RELATIVE", tabId: id, targetId, position }); }

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

  reloadAllTabs() { for (const id of appState.value.tabOrder) { const tabEl = DOMRegistry.getTab(id); if (tabEl) this.reloadTab(tabEl); } }

  // Minimal compatibility helpers and no-op implementations for legacy callers
  showFullScreenViewContextMenuItems(...args: any[]) { /* no-op compat */ }
  shouldActivateDocShell(browser?: any) { const b = browser || this.selectedBrowser; return !!(b && (b as any).docShell); }
  updateTitlebar() { try { if ((BrowserSystem as any)?.updateTitlebar) (BrowserSystem as any).updateTitlebar(this.window); } catch (_) { /* swallow */ } }
  createUserContextMenu(menu: any) { // Minimal fallback used by some legacy callers
    try { if ((this as any).createReopenInContainerMenu) return (this as any).createReopenInContainerMenu(menu); } catch (_) {}
    return null;
  }

}

// Modules are merged in this order; later ones win on a name clash.
const moduleMethods = [
    ["internals", internals.methods],
    ["lifecycle", lifecycle.methods],
    ["tab-crud", tabCrud.methods],
    ["browser-findbar", browserFindbar.methods],
    ["browser-swap", browserSwap.swapBrowserMethods],
    ["browser-create", browserCreate.methods],
    ["tab-misc", tabMisc.methods],
    ["tab-events", tabEvents.methods],
    ["tab-info", tabInfo.methods],
    ["browser-discard", browserDiscard.methods],
    ["title-icon", titleIcon.methods],
    ["extended", extended.methods],
    ["split-view-ops", splitViewOps.methods],
    ["tab-dedup", tabDedup.methods],
    ["tab-collection", tabCollection.methods],
    ["tab-groups", tabGroups.methods],
    ["browser-panel", browserPanel.methods],
    ["tab-keyboard", tabKeyboard.methods],
] as const;

// Build-time twin of the runtime warning in initCompat(). Each module ends in
// `satisfies` rather than a type annotation, so its member names survive as
// literal types; fold the tuple once and collect every name seen twice.
type MembersOf<T> = T extends readonly [string, infer M] ? keyof M : never;
type DuplicateMembers<Ms, Seen = never, Out = never> =
  Ms extends readonly [infer H, ...infer R]
    ? DuplicateMembers<R, Seen | MembersOf<H>, Out | (MembersOf<H> & Seen)>
    : Out;
// Known, intentional clashes (see the analysis note); remove once merged.
type KnownClash = "addTabGroup" | "removeTabGroup";
type Duplicates = Exclude<DuplicateMembers<typeof moduleMethods>, KnownClash>;
// A duplicate shows up here as `Type true is not assignable to { duplicate: "name" }`.
const _noDuplicateMembers: [Duplicates] extends [never] ? true : { duplicate: Duplicates } = true;

export function initCompat(window: any) {
  // Merge canonical module implementations onto the compat prototype so
  // the instance exposes full gBrowser behavior (modules may overwrite
  // lightweight shim methods defined above).
  // Later modules win on name clashes. Say so out loud instead of silently
  // shadowing an earlier implementation.
  const owner = new Map<string, string>();
  for (const [name, m] of moduleMethods) {
    for (const key of Object.keys(m)) {
      const prev = owner.get(key);
      if (prev) {
        console.warn(
          `[noraneko/tabbrowser] duplicate method \`${key}\`: ${prev} overridden by ${name}`,
        );
      }
      owner.set(key, name);
    }
    // defineProperties (not Object.assign): modules declare getters/setters
    // such as `selectedTab`, and assign would evaluate them once against the
    // module object and copy the stale value.
    try {
      Object.defineProperties(
        TabbrowserCompat.prototype,
        Object.getOwnPropertyDescriptors(m),
      );
    } catch (_) { /* best-effort merge */ }
  }

  const compat = new TabbrowserCompat(window);
  compat._bindDomElements();
  compat._adoptExistingTabs();
  compat.init();
  // Firefox's own Tabbrowser has already run init() on this window and is
  // still listening: its tabpanels `select` handler and its document
  // keydown/keypress handlers call back into *that* instance. Left alone,
  // every tab switch would run two updateCurrentBrowser()s (two async
  // switchers over the same browsers) and every shortcut would be handled
  // twice. The listeners are inline closures and cannot be removed, so
  // shadow the methods they reach for. Its other listeners (title changes,
  // audio playback, crashes, ...) still act on the shared DOM.
  const original = window.gBrowser;
  if (original && original !== compat) {
    original.updateCurrentBrowser = () => {};
    original.handleEvent = () => {};
  }
  // browser.js declares `var gBrowser` (writable, non-configurable), so
  // defineProperty is refused and plain assignment is the way to replace it.
  window.gBrowser = compat;
}
