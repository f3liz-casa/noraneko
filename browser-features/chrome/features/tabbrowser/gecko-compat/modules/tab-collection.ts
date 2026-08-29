// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L974~L2896
// Section: Browser Properties · Navigation · Tab Accessors · Selected Tab · Split View · Browser Lookup · Tab Container

import { produce } from "immer";
import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { appState, selectedTab as selectedTabSignal, orderedTabs } from "../../state/store.ts";
import * as GroupOps from "../../ops/group-ops.ts";
import { DOMRegistry } from "../DOMRegistry.ts";
import { pipe, A, O } from "@mobily/ts-belt";
import type { TabData, TabId, SplitViewId } from "../../types/TabState.ts";
import { resolveTabId, dispatch, advanceSelectedTab } from "../compat-helpers.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    _isInCollapsedGroup(tabId: TabId): boolean;
    _fallbackContainer(): any;
    readonly docShell: any;
    readonly webNavigation: any;
    readonly webProgress: any;
    readonly contentTitle: string;
    readonly contentWindow: any;
    readonly contentDocument: any;
    readonly contentPrincipal: any;
    readonly securityUI: any;
    readonly sessionHistory: any;
    readonly finder: any;
    readonly currentURI: any;
    readonly isSyntheticDocument: boolean;
    fullZoom: number;
    textZoom: number;
    userTypedValue: string;
    loadURI(uri: string, options?: any): void;
    fixupAndLoadURIString(uri: string, options?: any): void;
    goBack(requireUserInteraction?: boolean): boolean;
    goForward(requireUserInteraction?: boolean): boolean;
    readonly canGoBack: boolean;
    readonly canGoForward: boolean;
    readonly canGoBackIgnoringUserInteraction: boolean;
    reload(): void;
    reloadWithFlags(flags: number): void;
    stop(): void;
    gotoIndex(index: number): void;
    readonly tabs: MozTabbrowserTab[];
    readonly visibleTabs: MozTabbrowserTab[];
    readonly openTabs: MozTabbrowserTab[];
    readonly nonHiddenTabs: MozTabbrowserTab[];
    readonly pinnedTabCount: number;
    readonly tabGroups: any[];
    readonly tabsInCollapsedTabGroups: MozTabbrowserTab[];
    selectedTab: any;
    readonly selectedBrowser: XULBrowserElement | null;
    readonly selectedBrowsers: XULBrowserElement[];
    _queryTabs(pred: (t: TabData) => boolean): MozTabbrowserTab[];
    readonly activeSplitView: any;
    readonly splitViewBrowsers: XULBrowserElement[];
    addTabSplitView(tab: MozTabbrowserTab, otherTab: any): void;
    unsplitTabs(svId?: SplitViewId): void;
    browsers: any;
    getBrowserForTab(tab: MozTabbrowserTab): XULBrowserElement | undefined;
    getTabForBrowser(browser: any): MozTabbrowserTab | undefined;
    getBrowserAtIndex(index: number): XULBrowserElement | null;
    readonly tabContainer: any;
    _selNav(): any;
    addEventListener(...args: any[]): void;
    removeEventListener(...args: any[]): void;
    dispatchEvent(...args: any[]): boolean;
  }
}

export const methods = {
  /** `nsIWebNavigation` of the selected browser; null before the first tab exists. */
  _selNav(): any { return (this.selectedBrowser as any)?.webNavigation ?? null; },

  // ==========================================================================
  // Forwarded browser properties
  // tabbrowser.js L361~L428
  // ==========================================================================

  /** The `docShell` of the selected browser. */
  // upstream: get docShell@9dbc5ff5bc FIREFOX_143_0_1_RELEASE
  get docShell() { return (this.selectedBrowser as any)?.docShell; },
  /** The `nsIWebNavigation` interface of the selected browser. */
  // upstream: get webNavigation@14005fafac FIREFOX_143_0_1_RELEASE
  get webNavigation() { return (this.selectedBrowser as any)?.webNavigation; },
  /** The `nsIWebProgress` interface of the selected browser. */
  // upstream: get webProgress@da1670dae8 FIREFOX_143_0_1_RELEASE
  get webProgress() { return (this.selectedBrowser as any)?.webProgress; },
  /** The page title of the document currently loaded in the selected browser. */
  // upstream: get contentTitle@3015665376 FIREFOX_143_0_1_RELEASE
  get contentTitle() { return (this.selectedBrowser as any)?.contentTitle ?? ""; },
  /** The content `window` of the selected browser. */
  // upstream: get contentWindow@60302c58fb FIREFOX_143_0_1_RELEASE
  get contentWindow() { return (this.selectedBrowser as any)?.contentWindow; },
  /** The content `document` of the selected browser. */
  // upstream: get contentDocument@e5b39a2c93 FIREFOX_143_0_1_RELEASE
  get contentDocument() { return (this.selectedBrowser as any)?.contentDocument; },
  /** The security principal of the content loaded in the selected browser. */
  // upstream: get contentPrincipal@201c5cd652 FIREFOX_143_0_1_RELEASE
  get contentPrincipal() { return (this.selectedBrowser as any)?.contentPrincipal; },
  /** The security UI object for the selected browser. */
  // upstream: get securityUI@219f8e6726 FIREFOX_143_0_1_RELEASE
  get securityUI() { return (this.selectedBrowser as any)?.securityUI; },
  /** The session history of the selected browser. */
  // upstream: get sessionHistory@393aa3cecb FIREFOX_143_0_1_RELEASE
  get sessionHistory() { return (this.selectedBrowser as any)?.sessionHistory; },
  /** The `Finder` instance for the selected browser. */
  // upstream: get finder@4e290ed15a FIREFOX_143_0_1_RELEASE
  get finder() { return (this.selectedBrowser as any)?.finder; },
  /** The URI currently loaded in the selected browser. */
  // upstream: get currentURI@43cc7a9167 FIREFOX_143_0_1_RELEASE
  get currentURI() { return (this.selectedBrowser as any)?.currentURI; },
  /** Whether the selected browser has a synthetic (non-HTML/XML) document. */
  // upstream: get isSyntheticDocument@7fab09b591 FIREFOX_143_0_1_RELEASE
  get isSyntheticDocument() { return (this.selectedBrowser as any)?.isSyntheticDocument ?? false; },

  /** The full-page zoom factor of the selected browser. */
  // upstream: get fullZoom@11fb616f8d FIREFOX_143_0_1_RELEASE
  get fullZoom() { return (this.selectedBrowser as any)?.fullZoom ?? 1; },
  /** Set the full-page zoom factor of the selected browser. */
  // upstream: set fullZoom@0257c531b1 FIREFOX_143_0_1_RELEASE
  set fullZoom(val: number) { const b = this.selectedBrowser as any; if (b) b.fullZoom = val; },

  /** The text-only zoom factor of the selected browser. */
  // upstream: get textZoom@caa300e96d FIREFOX_143_0_1_RELEASE
  get textZoom() { return (this.selectedBrowser as any)?.textZoom ?? 1; },
  /** Set the text-only zoom factor of the selected browser. */
  // upstream: set textZoom@aa15967e25 FIREFOX_143_0_1_RELEASE
  set textZoom(val: number) { const b = this.selectedBrowser as any; if (b) b.textZoom = val; },

  /** The URL string the user typed into the address bar for the selected browser. */
  // upstream: get userTypedValue@370c799454 FIREFOX_143_0_1_RELEASE
  get userTypedValue() { return (this.selectedBrowser as any)?.userTypedValue ?? ""; },
  /** Set the URL string the user typed into the address bar for the selected browser. */
  // upstream: set userTypedValue@c1cc1829bd FIREFOX_143_0_1_RELEASE
  set userTypedValue(val: string) { const b = this.selectedBrowser as any; if (b) b.userTypedValue = val; },

  // ==========================================================================
  // Navigation (inlined — no more NavigationSystem indirection)
  // tabbrowser.js L974~L999
  // ==========================================================================

  /**
   * Load a URI into the selected browser.
   *
   * Fixes up the URI string before handing it to `webNavigation.loadURI`.
   * Throws if `options.triggeringPrincipal` is not provided.
   *
   * @param uri     - The URI string to load.
   * @param options - Navigation options; must include `triggeringPrincipal`.
   */
  // upstream: loadURI@09edb025ec FIREFOX_143_0_1_RELEASE
  loadURI(uri: string, options: any = {}) {
    const browser = this.selectedBrowser as any;
    if (!browser) return;
    if (!options.triggeringPrincipal) throw new Error("Must load with a triggering Principal");
    let uriObj;
    if (uri && uri !== "about:blank") {
      try { uriObj = (Services as any).uriFixup.getFixupURIInfo(uri, 0).preferredURI; }
      catch (_) { uriObj = (Services as any).io.newURI(uri); }
    } else {
      uriObj = (Services as any).io.newURI("about:blank");
    }
    try {
      browser.isNavigating = true;
      browser.webNavigation?.loadURI(uriObj, options);
    } finally { browser.isNavigating = false; }
  },

  /** Load a URI string into the selected browser, delegating to {@link loadURI}. */
  // upstream: fixupAndLoadURIString@934392cf64 FIREFOX_143_0_1_RELEASE
  fixupAndLoadURIString(uri: string, options: any = {}) { this.loadURI(uri, options); },

  /**
   * Navigate the selected browser back one step in session history.
   *
   * @param requireUserInteraction - When `true`, skips entries not created through user interaction.
   * @returns `false` if there is no history to go back to.
   */
  // upstream: goBack@c1a0456985 FIREFOX_143_0_1_RELEASE
  goBack(requireUserInteraction = false): boolean {
    const nav = this._selNav();
    return nav ? nav.goBack(requireUserInteraction) : false;
  },

  /**
   * Navigate the selected browser forward one step in session history.
   *
   * @param requireUserInteraction - When `true`, skips entries not created through user interaction.
   * @returns `false` if there is no forward history.
   */
  // upstream: goForward@09bcaa28d5 FIREFOX_143_0_1_RELEASE
  goForward(requireUserInteraction = false): boolean {
    const nav = this._selNav();
    return nav ? nav.goForward(requireUserInteraction) : false;
  },

  /** Whether the selected browser can navigate back in session history. */
  // upstream: get canGoBack@03c2482adf FIREFOX_143_0_1_RELEASE
  get canGoBack(): boolean { return this._selNav()?.canGoBack ?? false; },
  /** Whether the selected browser can navigate forward in session history. */
  // upstream: get canGoForward@4f434264ca FIREFOX_143_0_1_RELEASE
  get canGoForward(): boolean { return this._selNav()?.canGoForward ?? false; },
  /** Whether the selected browser can navigate back, regardless of user-interaction requirements. */
  // upstream: get canGoBackIgnoringUserInteraction@1b0230e4b1 FIREFOX_143_0_1_RELEASE
  get canGoBackIgnoringUserInteraction(): boolean { return this.canGoBack; },

  /** Reload the current page in the selected browser. */
  // upstream: reload@0c5f2b081d FIREFOX_143_0_1_RELEASE
  reload(): void { this._selNav()?.reload(); },
  /**
   * Reload the current page in the selected browser with specific load flags.
   *
   * @param flags - A bitmask of `nsIWebNavigation.LOAD_FLAGS_*` constants.
   */
  // upstream: reloadWithFlags@c3ceacc96e FIREFOX_143_0_1_RELEASE
  reloadWithFlags(flags: number): void { this._selNav()?.reloadWithFlags(flags); },
  /** Abort the current page load in the selected browser. */
  // upstream: stop@e08321bf1b FIREFOX_143_0_1_RELEASE
  stop(): void { this._selNav()?.stop(); },
  /**
   * Navigate to a specific entry in the selected browser's session history.
   *
   * @param index - Zero-based index into the session history list.
   */
  // upstream: gotoIndex@12dbc14070 FIREFOX_143_0_1_RELEASE
  gotoIndex(index: number): void { this._selNav()?.gotoIndex(index); },

  // ==========================================================================
  // Tab Collection Accessors (deduplicated via _queryTabs)
  // tabbrowser.js L974~L1053
  // ==========================================================================

  /** Tab elements (in tab-order) whose state passes `pred`; tabs without a DOM node are skipped. */
  _queryTabs(pred: (t: TabData) => boolean): MozTabbrowserTab[] {
    return pipe(
      orderedTabs.value,
      A.filter(pred),
      A.filterMap(t => O.fromNullable(DOMRegistry.getTab(t.id))),
    ) as MozTabbrowserTab[];
  },

  /** All tab elements in the current window, in tab-order. */
  // upstream: get tabs@9d22602253 FIREFOX_143_0_1_RELEASE
  get tabs() {
    return this._queryTabs(() => true);
  },

  /**
   * All tab elements currently visible in the tab strip.
   *
   * Excludes hidden tabs, tabs inside collapsed groups, and the Firefox View tab.
   */
  // upstream: get visibleTabs@c61295a7b6 FIREFOX_143_0_1_RELEASE
  get visibleTabs() {
    return this._queryTabs(t => {
      if (t.isHidden || this._isInCollapsedGroup(t.id)) return false;
      // Exclude Firefox View tab
      try {
        const tabEl = DOMRegistry.getTab(t.id);
        if (tabEl === FirefoxViewHandler?.tab) return false;
      } catch (_) { /* */ }
      return true;
    });
  },

  /** All tab elements that are not currently in the process of closing. */
  // upstream: get openTabs@6c79aba265 FIREFOX_143_0_1_RELEASE
  get openTabs() {
    return this._queryTabs(t => !t.isClosing);
  },

  /** All tab elements that are neither hidden nor closing. */
  // upstream: get nonHiddenTabs@4d915ac9a6 FIREFOX_143_0_1_RELEASE
  get nonHiddenTabs() {
    return this._queryTabs(t => !t.isHidden && !t.isClosing);
  },

  /** The total number of pinned tabs in the current window. */
  // upstream: get pinnedTabCount@9cd8267f50 FIREFOX_143_0_1_RELEASE
  get pinnedTabCount(): number {
    let c = 0;
    for (const id of appState.value.tabOrder) if (appState.value.tabs[id]?.isPinned) c++;
    return c;
  },

  /** All tab group state objects for the current window. */
  // upstream: get tabGroups@d7e7f7039f FIREFOX_143_0_1_RELEASE
  get tabGroups() {
    return Object.values(appState.value.groups);
  },

  /** All tab elements that belong to a currently collapsed tab group. */
  // upstream: get tabsInCollapsedTabGroups@91e29f388f FIREFOX_143_0_1_RELEASE
  get tabsInCollapsedTabGroups() {
    const s = appState.value;
    return Object.values(s.groups)
      .filter(g => g.isCollapsed)
      .flatMap(g => g.tabs)
      .map(id => DOMRegistry.getTab(id))
      .filter((t): t is MozTabbrowserTab => !!t);
  },

  _isInCollapsedGroup(tabId: TabId): boolean {
    const s = appState.value;
    const gid = s.tabs[tabId]?.groupId;
    return gid ? s.groups[gid]?.isCollapsed ?? false : false;
  },

  // ==========================================================================
  // Selected Tab
  // tabbrowser.js L552~L640
  // ==========================================================================

  /** The currently active tab element, or `null` when no tab is selected. */
  // upstream: get selectedTab@f8dbcea455 FIREFOX_143_0_1_RELEASE
  get selectedTab() {
    const sel = selectedTabSignal.value;
    return sel ? DOMRegistry.getTab(sel.id) ?? null : null;
  },

  /**
   * Activate a tab. tabbrowser.js setSelectedTab: hand the tab to the tabbox,
   * which marks the tab strip, switches the panel deck, and fires `select`
   * on tabpanels. That lands in updateCurrentBrowser — the one place the
   * store learns which tab is current and `TabSelect` goes out.
   */
  // upstream: set selectedTab@aeac3f54b9 FIREFOX_143_0_1_RELEASE
  set selectedTab(val: any) {
    const id = resolveTabId(val);
    const el = (id ? DOMRegistry.getTab(id) : null) ?? val;
    if (!el || el === this.selectedTab) return;
    if (
      document.documentElement?.hasAttribute("window-modal-open") ||
      ((this.window as any).gNavToolbox?.collapsed && !(this as any)._allowTabChange)
    ) {
      return;
    }
    this.tabbox.selectedTab = el;
  },

  /** The `<browser>` element for the selected tab, or `null`. */
  // upstream: get selectedBrowser@0338e1fbc8 FIREFOX_143_0_1_RELEASE
  get selectedBrowser() {
    const sel = selectedTabSignal.value;
    return sel ? DOMRegistry.getBrowser(sel.id) ?? null : null;
  },

  /**
   * All visible browsers.
   * In split-view mode returns the browsers of every pane; otherwise returns
   * a single-element array containing `selectedBrowser`.
   */
  get selectedBrowsers() {
    const svBrowsers = this.splitViewBrowsers;
    return svBrowsers.length ? svBrowsers : this.selectedBrowser ? [this.selectedBrowser] : [];
  },

  // ==========================================================================
  // Split View
  // noraneko extension — no direct tabbrowser.js equivalent
  // ==========================================================================

  /** The ID of the currently active split view, or `null` when no split view is open. */
  get activeSplitView() { return appState.value.activeSplitViewId; },

  /** The browser elements for all panes in the active split view, or an empty array. */
  get splitViewBrowsers(): XULBrowserElement[] {
    const svId = appState.value.activeSplitViewId;
    if (!svId) return [];
    const sv = appState.value.splitViews[svId];
    if (!sv) return [];
    return pipe(sv.tabs, A.filterMap(id => O.fromNullable(DOMRegistry.getBrowser(id)))) as XULBrowserElement[];
  },

  /**
   * Create a side-by-side split view for two tabs.
   *
   * Fires `TabSplitViewActivate` on success. The new split view becomes
   * the `activeSplitView`.
   *
   * @param tab      - First tab (displayed on the left)
   * @param otherTab - Second tab (displayed on the right)
   */
  addTabSplitView(tab: MozTabbrowserTab, otherTab: MozTabbrowserTab) {
    const id1 = resolveTabId(tab);
    const id2 = resolveTabId(otherTab);
    if (!id1 || !id2) return;
    const svId = GroupOps.generateLegacyId();
    appState.value = GroupOps.createSplitView(appState.value, svId, [id1, id2]);
    appState.value = produce(appState.value, d => { d.activeSplitViewId = svId; });
    dispatch(document, "TabSplitViewActivate");
  },

  /**
   * Tear down a split view, returning its tabs to normal display.
   * Fires `TabSplitViewDeactivate`.
   *
   * @param svId - Split view to remove; defaults to the currently active one
   */
  unsplitTabs(svId?: SplitViewId) {
    const id = svId ?? appState.value.activeSplitViewId;
    if (!id) return;
    appState.value = GroupOps.removeSplitView(appState.value, id);
    dispatch(document, "TabSplitViewDeactivate");
  },

  // ==========================================================================
  // Browsers proxy
  // tabbrowser.js L361~L428
  // ==========================================================================

  /**
   * An array-like proxy of all browser elements, indexed by tab order.
   *
   * Supports indexed access (`browsers[0]`) and `.length`. Mutations are not supported.
   */
  // upstream: browsers@3c50d4d383 FIREFOX_143_0_1_RELEASE
  browsers: new Proxy([] as any, {
    has: (_t: any, name: any) => {
      if (typeof name === "string" && Number.isInteger(parseInt(name)))
        return parseInt(name) < appState.value.tabOrder.length;
      return false;
    },
    get: (_t: any, name: any) => {
      if (name === "length") return appState.value.tabOrder.length;
      if (typeof name === "string" && Number.isInteger(parseInt(name))) {
        const id = appState.value.tabOrder[parseInt(name)];
        return id ? DOMRegistry.getBrowser(id) : undefined;
      }
      return ([] as any)[name];
    },
  }),

  // ==========================================================================
  // Browser ↔ Tab Lookup
  // tabbrowser.js L6174~L6195
  // ==========================================================================

  /** Return the `<browser>` element owned by `tab`, or `undefined`. */
  // upstream: getBrowserForTab@8429d83149 FIREFOX_143_0_1_RELEASE
  getBrowserForTab(tab: MozTabbrowserTab) { const id = resolveTabId(tab); return id ? DOMRegistry.getBrowser(id) : undefined; },

  /**
   * Return the `<tab>` element that owns `browser`, or `null`.
   * The lookup uses `browser._tabId` — a property stamped onto each browser
   * element during tab creation.
   */
  // upstream: getTabForBrowser@44d5f9f1a6 FIREFOX_143_0_1_RELEASE
  getTabForBrowser(browser: XULBrowserElement): any {
    if (!browser) return null;
    // tabbrowser.js keeps a browser → tab map, and every path that makes or
    // adopts a browser fills `_tabForBrowser`. `_tabId` is stamped on tabs
    // only, so it was never a way back from a browser (AsyncTabSwitcher's
    // MozLayerTreeReady and pagetitlechanged both come in through here).
    const tab = this._tabForBrowser.get(browser);
    if (tab) return tab;
    const id = (browser as any)._tabId;
    return id ? DOMRegistry.getTab(id) ?? null : null;
  },

  /**
   * Return the browser element at position `index` in tab order.
   *
   * @param index - Zero-based index into the ordered tab list.
   * @returns The browser element, or `null` if the index is out of range.
   */
  // upstream: getBrowserAtIndex@92b0290b44 FIREFOX_143_0_1_RELEASE
  getBrowserAtIndex(index: number) {
    const id = appState.value.tabOrder[index];
    return id ? (DOMRegistry.getBrowser(id) ?? null) : null;
  },

  // ==========================================================================
  // Tab Container (advanceSelectedTab deduplicated)
  // tabbrowser.js L6461~L7362
  // ==========================================================================

  /**
   * The `#tabbrowser-tabs` element, augmented with `advanceSelectedTab`.
   *
   * Falls back to a minimal stub object when the element is not yet in the DOM.
   */
  get tabContainer() {
    const el = document.getElementById("tabbrowser-tabs") as any;
    if (el) {
      if (typeof el.advanceSelectedTab !== "function") {
        el.advanceSelectedTab = advanceSelectedTab;
      }
      return el;
    }
    return this._fallbackContainer();
  },

  _fallbackContainer() {
    return {
      addEventListener: (n: string, cb: any, o?: any) => document.addEventListener(n, cb, o),
      removeEventListener: (n: string, cb: any, o?: any) => document.removeEventListener(n, cb, o),
      advanceSelectedTab,
      allTabs: this.tabs,
      get selectedIndex() { return selectedTabSignal.value?.index ?? -1; },
    } as any;
  },

  // ==========================================================================
  // Forward event registration to tabpanels
  // tabbrowser.js L6144~L6158
  // ==========================================================================
  /** Register an event listener on the `#tabbrowser-tabpanels` element. */
  // upstream: addEventListener@29e59c39d6 FIREFOX_143_0_1_RELEASE
  addEventListener(...args: any[]) {
    const panels = document.getElementById("tabbrowser-tabpanels");
    if (panels) panels.addEventListener.apply(panels, args as any);
  },
  /** Remove an event listener from the `#tabbrowser-tabpanels` element. */
  // upstream: removeEventListener@525f50207c FIREFOX_143_0_1_RELEASE
  removeEventListener(...args: any[]) {
    const panels = document.getElementById("tabbrowser-tabpanels");
    if (panels) panels.removeEventListener.apply(panels, args as any);
  },
  /** Dispatch an event on the `#tabbrowser-tabpanels` element. */
  // upstream: dispatchEvent@0ee6345cce FIREFOX_143_0_1_RELEASE
  dispatchEvent(...args: any[]): boolean {
    const panels = document.getElementById("tabbrowser-tabpanels");
    return panels ? panels.dispatchEvent.apply(panels, args as any) : false;
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
