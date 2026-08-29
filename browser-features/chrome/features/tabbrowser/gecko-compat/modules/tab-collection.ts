// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L974~L2896
// Section: Browser Properties · Navigation · Tab Accessors · Selected Tab · Split View · Browser Lookup · Tab Container

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { dispatch } from "../compat-helpers.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
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
    loadURI(uri: nsIURI, params?: any): void;
    fixupAndLoadURIString(uriString: string, params?: any): void;
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
    readonly selectedBrowser: XULBrowserElement;
    readonly selectedBrowsers: XULBrowserElement[];
    readonly activeSplitView: any;
    readonly splitViewBrowsers: XULBrowserElement[];
    addTabSplitView(tab: MozTabbrowserTab, otherTab: any): void;
    unsplitTabs(splitView?: any): void;
    browsers: any;
    getBrowserForTab(tab: MozTabbrowserTab): XULBrowserElement | undefined;
    getTabForBrowser(browser: any): MozTabbrowserTab | undefined;
    getBrowserAtIndex(index: number): XULBrowserElement | null;
    readonly tabContainer: any;
    addEventListener(...args: any[]): void;
    removeEventListener(...args: any[]): void;
    dispatchEvent(...args: any[]): boolean;
  }
}

export const methods = {

  // ==========================================================================
  // Forwarded browser properties
  // tabbrowser.js L361~L428
  // ==========================================================================

  /** The `docShell` of the selected browser. */
  // upstream: get docShell@9dbc5ff5bc FIREFOX_143_0_1_RELEASE
  get docShell() { return this.selectedBrowser.docShell; },
  /** The `nsIWebNavigation` interface of the selected browser. */
  // upstream: get webNavigation@14005fafac FIREFOX_143_0_1_RELEASE
  get webNavigation() { return this.selectedBrowser.webNavigation; },
  /** The `nsIWebProgress` interface of the selected browser. */
  // upstream: get webProgress@da1670dae8 FIREFOX_143_0_1_RELEASE
  get webProgress() { return this.selectedBrowser.webProgress; },
  /** The page title of the document currently loaded in the selected browser. */
  // upstream: get contentTitle@3015665376 FIREFOX_143_0_1_RELEASE
  get contentTitle() { return this.selectedBrowser.contentTitle; },
  /** The content `window` of the selected browser. */
  // upstream: get contentWindow@60302c58fb FIREFOX_143_0_1_RELEASE
  get contentWindow() { return this.selectedBrowser.contentWindow; },
  /** The content `document` of the selected browser. */
  // upstream: get contentDocument@e5b39a2c93 FIREFOX_143_0_1_RELEASE
  get contentDocument() { return this.selectedBrowser.contentDocument; },
  /** The security principal of the content loaded in the selected browser. */
  // upstream: get contentPrincipal@201c5cd652 FIREFOX_143_0_1_RELEASE
  get contentPrincipal() { return this.selectedBrowser.contentPrincipal; },
  /** The security UI object for the selected browser. */
  // upstream: get securityUI@219f8e6726 FIREFOX_143_0_1_RELEASE
  get securityUI() { return this.selectedBrowser.securityUI; },
  /** The session history of the selected browser. */
  // upstream: get sessionHistory@393aa3cecb FIREFOX_143_0_1_RELEASE
  get sessionHistory() { return this.selectedBrowser.sessionHistory; },
  /** The `Finder` instance for the selected browser. */
  // upstream: get finder@4e290ed15a FIREFOX_143_0_1_RELEASE
  get finder() { return this.selectedBrowser.finder; },
  /** The URI currently loaded in the selected browser. */
  // upstream: get currentURI@43cc7a9167 FIREFOX_143_0_1_RELEASE
  get currentURI() { return this.selectedBrowser.currentURI; },
  /** Whether the selected browser has a synthetic (non-HTML/XML) document. */
  // upstream: get isSyntheticDocument@7fab09b591 FIREFOX_143_0_1_RELEASE
  get isSyntheticDocument() { return this.selectedBrowser.isSyntheticDocument; },

  /** The full-page zoom factor of the selected browser. */
  // upstream: get fullZoom@11fb616f8d FIREFOX_143_0_1_RELEASE
  get fullZoom() { return this.selectedBrowser.fullZoom; },
  /** Set the full-page zoom factor of the selected browser. */
  // upstream: set fullZoom@0257c531b1 FIREFOX_143_0_1_RELEASE
  set fullZoom(val: number) { this.selectedBrowser.fullZoom = val; },

  /** The text-only zoom factor of the selected browser. */
  // upstream: get textZoom@caa300e96d FIREFOX_143_0_1_RELEASE
  get textZoom() { return this.selectedBrowser.textZoom; },
  /** Set the text-only zoom factor of the selected browser. */
  // upstream: set textZoom@aa15967e25 FIREFOX_143_0_1_RELEASE
  set textZoom(val: number) { this.selectedBrowser.textZoom = val; },

  /** The URL string the user typed into the address bar for the selected browser. */
  // upstream: get userTypedValue@370c799454 FIREFOX_143_0_1_RELEASE
  get userTypedValue() { return this.selectedBrowser.userTypedValue; },
  /** Set the URL string the user typed into the address bar for the selected browser. */
  // upstream: set userTypedValue@c1cc1829bd FIREFOX_143_0_1_RELEASE
  set userTypedValue(val: string) { this.selectedBrowser.userTypedValue = val; },

  // ==========================================================================
  // Navigation
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
  loadURI(uri: nsIURI, params?: any) { return this.selectedBrowser.loadURI(uri, params); },

  /** Load a URI string into the selected browser; throws for unknown schemes. */
  // upstream: fixupAndLoadURIString@934392cf64 FIREFOX_143_0_1_RELEASE
  fixupAndLoadURIString(uriString: string, params?: any) { return this.selectedBrowser.fixupAndLoadURIString(uriString, params); },

  /**
   * Navigate the selected browser back one step in session history.
   *
   * @param requireUserInteraction - When `true`, skips entries not created through user interaction.
   * @returns `false` if there is no history to go back to.
   */
  // upstream: goBack@c1a0456985 FIREFOX_143_0_1_RELEASE
  goBack(requireUserInteraction = false): boolean {
    return this.selectedBrowser.goBack(requireUserInteraction);
  },

  /**
   * Navigate the selected browser forward one step in session history.
   *
   * @param requireUserInteraction - When `true`, skips entries not created through user interaction.
   * @returns `false` if there is no forward history.
   */
  // upstream: goForward@09bcaa28d5 FIREFOX_143_0_1_RELEASE
  goForward(requireUserInteraction = false): boolean {
    return this.selectedBrowser.goForward(requireUserInteraction);
  },

  /** Whether the selected browser can navigate back in session history. */
  // upstream: get canGoBack@03c2482adf FIREFOX_143_0_1_RELEASE
  get canGoBack(): boolean { return this.selectedBrowser.canGoBack; },
  /** Whether the selected browser can navigate forward in session history. */
  // upstream: get canGoForward@4f434264ca FIREFOX_143_0_1_RELEASE
  get canGoForward(): boolean { return this.selectedBrowser.canGoForward; },
  /** Whether the selected browser can navigate back, regardless of user-interaction requirements. */
  // upstream: get canGoBackIgnoringUserInteraction@1b0230e4b1 FIREFOX_143_0_1_RELEASE
  get canGoBackIgnoringUserInteraction(): boolean { return this.selectedBrowser.canGoBackIgnoringUserInteraction; },

  /** Reload the current page in the selected browser. */
  // upstream: reload@0c5f2b081d FIREFOX_143_0_1_RELEASE
  reload(): void { this.selectedBrowser.reload(); },
  /**
   * Reload the current page in the selected browser with specific load flags.
   *
   * @param flags - A bitmask of `nsIWebNavigation.LOAD_FLAGS_*` constants.
   */
  // upstream: reloadWithFlags@c3ceacc96e FIREFOX_143_0_1_RELEASE
  reloadWithFlags(flags: number): void { this.selectedBrowser.reloadWithFlags(flags); },
  /** Abort the current page load in the selected browser. */
  // upstream: stop@e08321bf1b FIREFOX_143_0_1_RELEASE
  stop(): void { this.selectedBrowser.stop(); },
  /**
   * Navigate to a specific entry in the selected browser's session history.
   *
   * @param index - Zero-based index into the session history list.
   */
  // upstream: gotoIndex@12dbc14070 FIREFOX_143_0_1_RELEASE
  gotoIndex(index: number): void { this.selectedBrowser.gotoIndex(index); },

  // ==========================================================================
  // Tab Collection Accessors — the tab strip (tabs.js) keeps these lists
  // tabbrowser.js L381~L437
  // ==========================================================================

  /**
   * Returns all tabs in the current window, including hidden tabs and tabs
   * in collapsed groups, but excluding closing tabs and the Firefox View tab.
   */
  // upstream: get tabs@9d22602253 FIREFOX_143_0_1_RELEASE
  get tabs(): MozTabbrowserTab[] {
    return this.tabContainer.allTabs;
  },

  // upstream: get tabGroups@d7e7f7039f FIREFOX_143_0_1_RELEASE
  get tabGroups(): any[] {
    return this.tabContainer.allGroups;
  },

  // upstream: get tabsInCollapsedTabGroups@91e29f388f FIREFOX_143_0_1_RELEASE
  get tabsInCollapsedTabGroups(): MozTabbrowserTab[] {
    return this.tabGroups
      .filter((tabGroup: any) => tabGroup.collapsed)
      .flatMap((tabGroup: any) => tabGroup.tabs)
      .filter((tab: any) => !tab.hidden && !tab.closing);
  },

  /** Tabs that are not closing (hidden ones included). */
  // upstream: get openTabs@6c79aba265 FIREFOX_143_0_1_RELEASE
  get openTabs(): MozTabbrowserTab[] {
    return this.tabContainer.openTabs;
  },

  /** Tabs that are neither hidden nor closing. */
  // upstream: get nonHiddenTabs@4d915ac9a6 FIREFOX_143_0_1_RELEASE
  get nonHiddenTabs(): MozTabbrowserTab[] {
    return this.tabContainer.nonHiddenTabs;
  },

  /** Tabs shown in the strip: not hidden, not closing, not in a collapsed group. */
  // upstream: get visibleTabs@c61295a7b6 FIREFOX_143_0_1_RELEASE
  get visibleTabs(): MozTabbrowserTab[] {
    return this.tabContainer.visibleTabs;
  },

  /** Pinned tabs come first, so this is where the first unpinned one sits. */
  // upstream: get pinnedTabCount@9cd8267f50 FIREFOX_143_0_1_RELEASE
  get pinnedTabCount(): number {
    let i;
    for (i = 0; i < this.tabs.length; i++) {
      if (!this.tabs[i].pinned) {
        break;
      }
    }
    return i;
  },

  // ==========================================================================
  // Selected Tab
  // tabbrowser.js L451~L457, L552~L640
  // ==========================================================================

  // upstream: get selectedTab@f8dbcea455 FIREFOX_143_0_1_RELEASE
  get selectedTab(): any {
    return this._selectedTab;
  },

  /**
   * Activate a tab. tabbrowser.js setSelectedTab: hand the tab to the tabbox,
   * which marks the tab strip, switches the panel deck, and fires `select`
   * on tabpanels. That lands in updateCurrentBrowser — the one place the
   * store learns which tab is current and `TabSelect` goes out.
   */
  // upstream: set selectedTab@aeac3f54b9 FIREFOX_143_0_1_RELEASE
  set selectedTab(val: any) {
    if (
      (this.window as any).gSharedTabWarning.willShowSharedTabWarning(val) ||
      this.window.document.documentElement.hasAttribute("window-modal-open") ||
      ((this.window as any).gNavToolbox.collapsed && !this._allowTabChange)
    ) {
      return;
    }
    // Update the tab
    this.tabbox.selectedTab = val;
  },

  // upstream: get selectedBrowser@0338e1fbc8 FIREFOX_143_0_1_RELEASE
  get selectedBrowser(): XULBrowserElement {
    return this._selectedBrowser;
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
  // Split View — a <tab-split-view-wrapper> in the strip holds the tabs
  // (Firefox 154's shape; 143 has no such element, and nothing calls this yet)
  // ==========================================================================

  /** The active split view wrapper, or null. */
  get activeSplitView() { return this._activeSplitView; },

  /** The browsers of every pane in the active split view, or []. */
  get splitViewBrowsers(): XULBrowserElement[] {
    return this._activeSplitView ? this._activeSplitView.tabs.map((t: any) => t.linkedBrowser) : [];
  },

  /**
   * Show `tab` and `otherTab` side by side: both move into a new wrapper
   * where `tab` was, and the wrapper becomes the active split view.
   */
  addTabSplitView(tab: MozTabbrowserTab, otherTab: MozTabbrowserTab) {
    const wrapper = this._createTabSplitView({ id: `${Date.now()}-${Math.round(Math.random() * 100)}` });
    this.tabContainer.insertBefore(wrapper, tab);
    this.moveTabToSplitView(tab, wrapper);
    this.moveTabToSplitView(otherTab, wrapper);
    this._activeSplitView = wrapper;
    this.showSplitViewPanels(wrapper.tabs);
    dispatch(this.window.document, "TabSplitViewActivate");
  },

  /** Take a split view apart: its tabs go back to the strip, the wrapper goes. */
  unsplitTabs(splitView?: any) {
    splitView ??= this._activeSplitView;
    if (!splitView) return;
    const tabs = [...splitView.tabs];
    this.hideSplitViewPanels(tabs);
    for (const t of tabs) {
      this._handleTabMove(t, () => splitView.before(t));
    }
    splitView.remove();
    if (this._activeSplitView === splitView) this._activeSplitView = null;
    dispatch(this.window.document, "TabSplitViewDeactivate");
  },

  // ==========================================================================
  // Browser ↔ Tab Lookup   (`browsers` is a class field: its proxy closes over `this`)
  // tabbrowser.js L912~L914, L5783~L5785, L5803~L5817
  // ==========================================================================

  // upstream: getBrowserForTab@8429d83149 FIREFOX_143_0_1_RELEASE
  getBrowserForTab(tab: MozTabbrowserTab): XULBrowserElement | undefined {
    return (tab as any).linkedBrowser;
  },

  /** The tab that owns `browser`, or null. */
  // upstream: getTabForBrowser@44d5f9f1a6 FIREFOX_143_0_1_RELEASE
  getTabForBrowser(browser: XULBrowserElement): any {
    if (!browser) return null;
    return this._tabForBrowser.get(browser) ?? null;
  },

  /**
   * Return the browser element at position `index` in tab order.
   *
   * @param index - Zero-based index into the ordered tab list.
   * @returns The browser element, or `null` if the index is out of range.
   */
  // upstream: getBrowserAtIndex@92b0290b44 FIREFOX_143_0_1_RELEASE
  getBrowserAtIndex(index: number): XULBrowserElement | null {
    return this.browsers[index] ?? null;
  },

  // ==========================================================================
  // Tab Container
  // ==========================================================================

  /** The `#tabbrowser-tabs` element (tabs.js); tabbox.js gives it advanceSelectedTab. */
  get tabContainer(): any {
    return (this.window as any).document.getElementById("tabbrowser-tabs");
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
