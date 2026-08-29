// SPDX-License-Identifier: MPL-2.0
/// <reference path="./gecko-types.d.ts" />

import { TabProgressListener, URILoadingWrapper, updateUserContextUIIndicator } from "./tabbrowser-scope.ts";

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
  // upstream: closingTabsEnum@760eb8ff93 FIREFOX_143_0_1_RELEASE
  closingTabsEnum = {
    ALL: 0, OTHER: 1, TO_START: 2, TO_END: 3, MULTI_SELECTED: 4, DUPLICATES: 6, ALL_DUPLICATES: 7,
  };
  // upstream: _lastRelatedTabMap@f0bb0257f0 FIREFOX_143_0_1_RELEASE
  _lastRelatedTabMap = new WeakMap<any, any>();
  // upstream: mProgressListeners@57984f5405 FIREFOX_143_0_1_RELEASE
  mProgressListeners: any[] = [];
  // upstream: mTabsProgressListeners@ca7c4c5c4a FIREFOX_143_0_1_RELEASE
  mTabsProgressListeners: any[] = [];
  // upstream: _tabListeners@51c50a31f2 FIREFOX_143_0_1_RELEASE
  _tabListeners = new Map<any, any>();
  // upstream: _tabFilters@586937d7f4 FIREFOX_143_0_1_RELEASE
  _tabFilters = new Map<any, any>();
  // upstream: _isBusy@68f7b149ce FIREFOX_143_0_1_RELEASE
  _isBusy = false;
  // upstream: _awaitingToggleCaretBrowsingPrompt@c4ece010b1 FIREFOX_143_0_1_RELEASE
  _awaitingToggleCaretBrowsingPrompt = false;
  // upstream: _previewMode@a0743a163e FIREFOX_143_0_1_RELEASE
  _previewMode = false;
  // upstream: _lastFindValue@d1dffa1800 FIREFOX_143_0_1_RELEASE
  _lastFindValue = "";
  // upstream: _contentWaitingCount@f63ae837da FIREFOX_143_0_1_RELEASE
  _contentWaitingCount = 0;
  // upstream: _tabLayerCache@39645a0ef6 FIREFOX_143_0_1_RELEASE
  _tabLayerCache: any[] = [];
  // upstream: tabAnimationsInProgress@6a0b467752 FIREFOX_143_0_1_RELEASE
  tabAnimationsInProgress = 0;
  // upstream: _tabForBrowser@1d71fc4fd0 FIREFOX_143_0_1_RELEASE
  _tabForBrowser = new Map<any, any>();
  // The <browser> members a lazy browser stands in for (see _createLazyBrowser).
  // upstream: _browserBindingProperties@9994be42a5 FIREFOX_143_0_1_RELEASE
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
  // upstream: _removingTabs@943a93a5b0 FIREFOX_143_0_1_RELEASE
  _removingTabs = new Set<any>();
  // upstream: _multiSelectedTabsSet@e23816d97d FIREFOX_143_0_1_RELEASE
  _multiSelectedTabsSet = new WeakSet<any>();
  // upstream: _lastMultiSelectedTabRef@c20988c9f9 FIREFOX_143_0_1_RELEASE
  _lastMultiSelectedTabRef: any = null;
  // upstream: _clearMultiSelectionLocked@7dee37d1d8 FIREFOX_143_0_1_RELEASE
  _clearMultiSelectionLocked = false;
  // upstream: _clearMultiSelectionLockedOnce@797d6fe716 FIREFOX_143_0_1_RELEASE
  _clearMultiSelectionLockedOnce = false;
  // upstream: _multiSelectChangeStarted@682e817bb4 FIREFOX_143_0_1_RELEASE
  _multiSelectChangeStarted = false;
  // upstream: _multiSelectChangeAdditions@3dff4f8f4e FIREFOX_143_0_1_RELEASE
  _multiSelectChangeAdditions = new Set<any>();
  // upstream: _multiSelectChangeRemovals@65d7cb33b7 FIREFOX_143_0_1_RELEASE
  _multiSelectChangeRemovals = new Set<any>();
  // upstream: _multiSelectChangeSelected@561ccd3dcf FIREFOX_143_0_1_RELEASE
  _multiSelectChangeSelected = false;
  // upstream: _windowIsClosing@9a2cc6de12 FIREFOX_143_0_1_RELEASE
  _windowIsClosing = false;
  // upstream: preloadedBrowser@271cf2c4d2 FIREFOX_143_0_1_RELEASE
  preloadedBrowser: any = null;
  // upstream: _printPreviewBrowsers@8a83c8e884 FIREFOX_143_0_1_RELEASE
  _printPreviewBrowsers = new Set<any>();
  // upstream: _switcher@f0d2ebed35 FIREFOX_143_0_1_RELEASE
  _switcher: any = null;
  _selectedTab: any = null;
  _selectedBrowser: any = null;
  /** The <tab-split-view-wrapper> whose tabs share the deck, or null (154's #activeSplitView). */
  _activeSplitView: any = null;
  /**
   * This defines a proxy which allows us to access browsers by
   * index without actually creating a full array of browsers.
   */
  // upstream: browsers@3c50d4d383 FIREFOX_143_0_1_RELEASE
  browsers: any = new Proxy([] as any, {
    has: (_target: any, name: any) => {
      if (typeof name == "string" && Number.isInteger(parseInt(name))) {
        return name in this.tabs;
      }
      return false;
    },
    get: (target: any, name: any) => {
      if (name == "length") {
        return this.tabs.length;
      }
      if (typeof name == "string" && Number.isInteger(parseInt(name))) {
        if (!(name in this.tabs)) {
          return undefined;
        }
        return (this.tabs as any)[name].linkedBrowser;
      }
      return target[name];
    },
  });
  // upstream: _soundPlayingAttrRemovalTimer@d71e08ee39 FIREFOX_143_0_1_RELEASE
  _soundPlayingAttrRemovalTimer = 0;
  // upstream: _hoverTabTimer@f3225a41b2 FIREFOX_143_0_1_RELEASE
  _hoverTabTimer: any = null;
  // upstream: _nextNotificationBoxId@465d14202c FIREFOX_143_0_1_RELEASE
  _nextNotificationBoxId = 0;
  _tabNotificationDeck: any = null;
  // upstream: _dataURLRegEx@4c2b990609 FIREFOX_143_0_1_RELEASE
  _dataURLRegEx = /^data:/;
  // upstream: _nonPrintingRegEx@413d04aa9b FIREFOX_143_0_1_RELEASE
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
  /** The tab a context menu was opened on (extended.ts updateContextMenu). */
  contextTab: any = null;
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
   * Firefox's own Tabbrowser has already run init() by the time
   * browser-window-domcontentloaded fires, so the initial <tab> and its
   * browser are in the strip. Take them as ours.
   */
  _adoptExistingTabs() {
    // Firefox's Tabbrowser already numbered the panels it made (panel-<win>-1
    // for the first tab). Two counters starting at 0 would hand the next tab
    // the same id, and a tabbox cannot tell two tabs apart by one panel.
    for (const panel of Array.from(this.tabpanels?.children ?? []) as Element[]) {
      const m = /^panel-\d+-(\d+)$/.exec(panel.id);
      if (m) this._uniquePanelIDCounter = Math.max(this._uniquePanelIDCounter, Number(m[1]));
    }
    for (const tab of this.tabs as any[]) {
      if (tab.linkedBrowser) this._tabForBrowser.set(tab.linkedBrowser, tab);
      if (tab.selected) {
        this._selectedTab = tab;
        this._selectedBrowser = tab.linkedBrowser;
      }
    }
    console.debug(`[noraneko/tabbrowser] adopted ${this.tabs.length} existing tab(s)`);
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
   * Put a tab's <browser> into the panel deck and hook it up: progress
   * listener, drop handler, load wrappers. Also what tabs.js reaches for
   * (getRelatedElement) when a selected tab has no linkedPanel yet, and what
   * a lazy browser's first real use goes through.
   */
  // upstream: _insertBrowser@289fa96bb0 FIREFOX_143_0_1_RELEASE
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

  /** Ours: older callers' names for the tabbrowser.js operations. */
  moveTabRelative(tab: any, target: any, position: "before" | "after" = "after") {
    if (position === "before") this.moveTabBefore(tab, target);
    else this.moveTabAfter(tab, target);
  }
  addRangeToSelection(start: any, end: any) {
    const tabs = this.tabs;
    const s = typeof start === "number" ? tabs[start] : start;
    const e = typeof end === "number" ? tabs[end] : end;
    if (s && e) this.addRangeToMultiSelectedTabs(s, e);
  }
  clearSelection() { this.clearMultiSelectedTabs(); }
  reloadAllTabs() { this.reloadTabs(this.tabs); }

  // Minimal compatibility helpers and no-op implementations for legacy callers
  showFullScreenViewContextMenuItems(...args: any[]) { /* no-op compat */ }
  // upstream: shouldActivateDocShell@3e49d252af FIREFOX_143_0_1_RELEASE
  shouldActivateDocShell(browser?: any) { const b = browser || this.selectedBrowser; return !!(b && (b as any).docShell); }
  // upstream: updateTitlebar@38aaae9f15 FIREFOX_143_0_1_RELEASE
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
type Duplicates = DuplicateMembers<typeof moduleMethods>;
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
