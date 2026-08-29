// SPDX-License-Identifier: MPL-2.0
/// <reference path="./gecko-types.d.ts" />

import { appState, selectedTab as selectedTabSignal, orderedTabs, send } from "../state/store.ts";
import * as TabOps from "../ops/tab-ops.ts";
import * as GroupOps from "../ops/group-ops.ts";
import { DOMRegistry } from "./DOMRegistry.ts";
import { BrowserSystem } from "./BrowserSystem.ts";
import { NavigationSystem } from "./NavigationSystem.ts";
import { TabProgressListener, URILoadingWrapper, updateUserContextUIIndicator } from "./tabbrowser-scope.ts";
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

  // ---- Fields, in tabbrowser.js order (L219~L380). ----------------------
  closingTabsEnum = {
    ALL: 0, OTHER: 1, TO_START: 2, TO_END: 3, MULTI_SELECTED: 4, DUPLICATES: 6, ALL_DUPLICATES: 7,
  };
  _lastRelatedTabMap = new WeakMap<any, any>();
  // upstream: mProgressListeners@57984f5405 FIREFOX_143_0_1_RELEASE
  mProgressListeners: any[] = [];
  // upstream: mTabsProgressListeners@ca7c4c5c4a FIREFOX_143_0_1_RELEASE
  mTabsProgressListeners: any[] = [];
  _tabListeners = new Map<any, any>();
  _tabFilters = new Map<any, any>();
  _isBusy = false;
  _awaitingToggleCaretBrowsingPrompt = false;
  _previewMode = false;
  _lastFindValue = "";
  _contentWaitingCount = 0;
  // upstream: _tabLayerCache@39645a0ef6 FIREFOX_143_0_1_RELEASE
  _tabLayerCache: any[] = [];
  tabAnimationsInProgress = 0;
  _tabForBrowser = new Map<any, any>();
  // The <browser> members a lazy browser stands in for (see _createLazyBrowser).
  _browserBindingProperties = [
    "canGoBack",
    "canGoForward",
    "goBack",
    "goForward",
    "permitUnload",
    "reload",
    "reloadWithFlags",
    "stop",
    "loadURI",
    "fixupAndLoadURIString",
    "gotoIndex",
    "currentURI",
    "documentURI",
    "remoteType",
    "preferences",
    "imageDocument",
    "isRemoteBrowser",
    "messageManager",
    "getTabBrowser",
    "finder",
    "fastFind",
    "sessionHistory",
    "contentTitle",
    "characterSet",
    "fullZoom",
    "textZoom",
    "tabHasCustomZoom",
    "webProgress",
    "addProgressListener",
    "removeProgressListener",
    "audioPlaybackStarted",
    "audioPlaybackStopped",
    "resumeMedia",
    "mute",
    "unmute",
    "blockedPopups",
    "lastURI",
    "purgeSessionHistory",
    "stopScroll",
    "startScroll",
    "userTypedValue",
    "userTypedClear",
    "didStartLoadSinceLastUserTyping",
    "audioMuted",
  ];
  _removingTabs = new Set<any>();
  _multiSelectedTabsSet = new WeakSet<any>();
  _lastMultiSelectedTabRef: WeakRef<any> | null = null;
  _clearMultiSelectionLocked = false;
  _clearMultiSelectionLockedOnce = false;
  _multiSelectChangeStarted = false;
  _multiSelectChangeAdditions = new Set<any>();
  _multiSelectChangeRemovals = new Set<any>();
  _multiSelectChangeSelected = false;
  _windowIsClosing = false;
  preloadedBrowser: any = null;
  // upstream: _printPreviewBrowsers@8a83c8e884 FIREFOX_143_0_1_RELEASE
  _printPreviewBrowsers = new Set<any>();
  // upstream: _switcher@f0d2ebed35 FIREFOX_143_0_1_RELEASE
  _switcher: any = null;
  _soundPlayingAttrRemovalTimer = 0;
  _hoverTabTimer: any = null;
  _nextNotificationBoxId = 0;
  _tabNotificationDeck: any = null;
  _dataURLRegEx = /^data:/;
  _nonPrintingRegEx = /^(?:\s|\u00A0)*$/;

  // ---- Ours. --------------------------------------------------------------
  // tabbrowser.js: AsyncTabSwitcher and friends reach the window and the
  // document through these, not through `window`. Firefox 143 (the current
  // runtime) reads `ownerGlobal`; 149 renamed it `documentGlobal`.
  // upstream: ownerGlobal@ed8ea8d6f7 FIREFOX_143_0_1_RELEASE
  ownerGlobal: Window;
  documentGlobal: Window;
  // upstream: ownerDocument@fdbc07a646 FIREFOX_143_0_1_RELEASE
  ownerDocument: Document;
  // Window-title pieces (title-icon.ts); tabbrowser.js keeps these on the
  // instance too, just without declaring them.
  _taskbarTab: any = null;
  _taskbarTabTitle: string | null = null;
  _taskbarTabTitleLastProfile: any = null;
  _cachedTitleInfo: Record<string, string> | null = null;
  _tabSwitchTelemetry = new Map<string, { count: number; timestamp: number }>();
  _previousURL: string | null = null;
  _tabpanelsSelectHandler: any = null;
  _asyncTabSwitching = false;

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
      GenAI: "resource:///modules/GenAI.sys.mjs",
      TabNotes: "moz-src:///browser/components/tabnotes/TabNotes.sys.mjs",
    });
    // Moved between 143 (resource:///modules) and 154 (moz-src:///…/urlbar);
    // TabProgressListener.onLocationChange reaches for it on every load.
    ChromeUtils.defineLazyGetter(this, "UrlbarProviderOpenTabs", () => {
      for (const url of [
        "resource:///modules/UrlbarProviderOpenTabs.sys.mjs",
        "moz-src:///browser/components/urlbar/UrlbarProviderOpenTabs.sys.mjs",
      ]) {
        try { return ChromeUtils.importESModule(url).UrlbarProviderOpenTabs; } catch (_) { /* next */ }
      }
      throw new Error("UrlbarProviderOpenTabs.sys.mjs not found under either path");
    });
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
  // Lazy preference getters, defined in init() as tabbrowser.js does.
  declare readonly _shouldExposeContentTitle: boolean;
  declare readonly _shouldExposeContentTitlePbm: boolean;
  declare readonly _showTabCardPreview: boolean;
  declare readonly _allowTransparentBrowser: boolean;
  declare readonly _tabGroupsEnabled: boolean;
  declare readonly showPidAndActiveness: boolean;
  declare readonly _unloadTabInContextMenu: boolean;
  declare readonly _notificationEnableDelay: number;

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

  // Expose panel container for legacy direct DOM access
  get mPanelContainer() { return this.tabpanels; }

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
        uri: options.uri,
        uriIsAboutBlank: options.uriIsAboutBlank,
        skipLoad: options.skipLoad,
        userContextId: state?.userContextId,
        remoteType: options.remoteType,
      }) : { browser: null };
      const browser = res?.browser;
      if (browser) {
        DOMRegistry.registerBrowser(id, browser);
        this._insertBrowser(tabEl, true);
      }
    } catch (e) {
      console.error("Failed to synchronously create browser DOM for tab", id, e);
    }
  }

  /**
   * Put a tab's <browser> into the panel deck and hook it up: progress
   * listener, drop handler, load wrappers. Also what tabs.js reaches for
   * (getRelatedElement) when a selected tab has no linkedPanel yet, and what
   * a lazy browser's first real use goes through.
   */
  _insertBrowser(aTab: any, aInsertedOnTabCreation = false) {
    const window = this.window as any;

    // If browser is already inserted or window is closed don't do anything.
    if (aTab.linkedPanel || window.closed) {
      return;
    }

    const browser = aTab.linkedBrowser;

    // If browser is a lazy browser, delete the substitute properties.
    if (this._browserBindingProperties[0] in browser) {
      for (const name of this._browserBindingProperties) {
        delete browser[name];
      }
    }

    const { uriIsAboutBlank, usingPreloadedContent } = aTab._browserParams;
    delete aTab._browserParams;
    delete browser._cachedCurrentURI;

    const panel = this.getPanel(browser);
    const uniqueId = this._generateUniquePanelID();
    panel.id = uniqueId;
    aTab.linkedPanel = uniqueId;

    // Inject the <browser> into the DOM if necessary.
    if (!panel.parentNode) {
      // NB: this appendChild call causes us to run constructors for the
      // browser element, which fires off a bunch of notifications. Some
      // of those notifications can cause code to run that inspects our
      // state, so it is important that the tab element is fully
      // initialized by this point.
      this.tabpanels.appendChild(panel);
    }

    // wire up a progress listener for the new browser object.
    const tabListener = new TabProgressListener(
      this,
      aTab,
      browser,
      uriIsAboutBlank,
      usingPreloadedContent,
    );
    const filter: any = Cc["@mozilla.org/appshell/component/browser-status-filter;1"]
      .createInstance(Ci.nsIWebProgress);
    filter.addProgressListener(tabListener, Ci.nsIWebProgress.NOTIFY_ALL!);
    browser.webProgress.addProgressListener(filter, Ci.nsIWebProgress.NOTIFY_ALL!);
    this._tabListeners.set(aTab, tabListener);
    this._tabFilters.set(aTab, filter);

    browser.droppedLinkHandler = window.handleDroppedLink;
    browser.loadURI = URILoadingWrapper.loadURI.bind(URILoadingWrapper, browser);
    browser.fixupAndLoadURIString = URILoadingWrapper.fixupAndLoadURIString.bind(
      URILoadingWrapper,
      browser,
    );

    // Most of the time, we start our browser's docShells out as inactive,
    // and then maintain activeness in the tab switcher. Preloaded about:newtab's
    // are already created with their docShell's as inactive, but then explicitly
    // render their layers to ensure that we can switch to them quickly. We avoid
    // setting docShellIsActive to false again in this case, since that'd cause
    // the layers for the preloaded tab to be dropped, and we'd see a flash
    // of empty content instead.
    //
    // So for all browsers except for the preloaded case, we set the browser
    // docShell to inactive.
    if (!usingPreloadedContent) {
      browser.docShellIsActive = false;
    }

    // If we transitioned from one browser to two browsers, we need to set
    // hasSiblings=false on both the existing browser and the new browser.
    if (this.tabs.length == 2) {
      this.tabs[0].linkedBrowser!.browsingContext!.hasSiblings = true;
      this.tabs[1].linkedBrowser!.browsingContext!.hasSiblings = true;
    } else {
      aTab.linkedBrowser.browsingContext.hasSiblings = this.tabs.length > 1;
    }

    if (aTab.userContextId) {
      browser.setAttribute("usercontextid", aTab.userContextId);
    }

    browser.browsingContext.isAppTab = aTab.pinned;

    // We don't want to update the container icon and identifier if
    // this is not the selected browser.
    if (aTab.selected) {
      updateUserContextUIIndicator(window);
    }

    // Only fire this event if the tab is already in the DOM
    // and will be handled by a listener.
    if (aTab.isConnected) {
      const evt = new CustomEvent("TabBrowserInserted", {
        bubbles: true,
        detail: { insertedOnTabCreation: aInsertedOnTabCreation },
      });
      aTab.dispatchEvent(evt);
    }
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
  // upstream: shouldActivateDocShell@3e49d252af FIREFOX_143_0_1_RELEASE
  shouldActivateDocShell(browser?: any) { const b = browser || this.selectedBrowser; return !!(b && (b as any).docShell); }
  updateTitlebar() {
    (this.window as any).document.title = this.getWindowTitleForBrowser(this.selectedBrowser!);
  }
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

  // Firefox's own Tabbrowser has already run init() on this window. Take
  // over what it holds, and quiet what it still listens to.
  const original = window.gBrowser;
  if (original && original !== compat) {
    // Whoever registered before we arrived (browser-init's onLoad may have
    // run: XULBrowserWindow, TabsProgressListener, ...) registered there.
    // Share the arrays, so a later add/remove through either instance
    // lands in the same place.
    compat.mProgressListeners = original.mProgressListeners ?? compat.mProgressListeners;
    compat.mTabsProgressListeners = original.mTabsProgressListeners ?? compat.mTabsProgressListeners;

    // Its per-tab TabProgressListener would keep updating the tab through
    // that instance. Swap in ours on the same status filter, carrying the
    // state it had gathered.
    const NOTIFY_ALL = Ci.nsIWebProgress.NOTIFY_ALL!;
    for (const tab of compat.tabs as any[]) {
      const filter = original._tabFilters?.get(tab);
      const theirs = original._tabListeners?.get(tab);
      if (!filter || !theirs) continue;
      filter.removeProgressListener(theirs);
      const ours = new TabProgressListener(
        compat, tab, tab.linkedBrowser, theirs.mBlank, false, theirs.mStateFlags, theirs.mRequestCount,
      );
      filter.addProgressListener(ours, NOTIFY_ALL);
      compat._tabListeners.set(tab, ours);
      compat._tabFilters.set(tab, filter);
      original._tabFilters.delete(tab);
      original._tabListeners.delete(tab);
      theirs.destroy();
    }

    // init() registers the instance itself as the handler for these, so
    // they can be removed (tabbrowser.js destroy() does the same).
    const doc = window.document;
    doc.removeEventListener("keydown", original, { mozSystemGroup: true });
    doc.removeEventListener("keypress", original, { mozSystemGroup: true });
    doc.removeEventListener("visibilitychange", original);
    for (const type of [
      "framefocusrequested", "activate", "deactivate",
      "TabGroupCollapse", "TabGroupCreateByUser", "TabGrouped", "TabUngrouped",
    ]) {
      window.removeEventListener(type, original);
    }
    try { Services.obs.removeObserver(original, "contextual-identity-updated"); } catch (_) { /* not registered */ }

    // _setupEventListeners() adds closures (tabpanels `select`, DOMWindowClose,
    // pagetitlechanged, ...) that cannot be removed; shadow the methods the
    // ones that matter reach for, so a tab switch is not run twice.
    original.updateCurrentBrowser = () => {};
    original.handleEvent = () => {};
    if (original._switcher) {
      original._switcher.destroy();
      original._switcher = null;
    }
  }
  // browser.js declares `var gBrowser` (writable, non-configurable), so
  // defineProperty is refused and plain assignment is the way to replace it.
  window.gBrowser = compat;
}
