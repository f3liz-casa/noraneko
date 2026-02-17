// SPDX-License-Identifier: MPL-2.0

import { appState, selectedTab as selectedTabSignal, orderedTabs, setSelectedTab, updateState } from "../state/store.ts";
import * as TabOps from "../ops/tab-ops.ts";
import * as GroupOps from "../ops/group-ops.ts";
import { DOMRegistry } from "./DOMRegistry.ts";
import { BrowserSystem } from "./BrowserSystem.ts";
import { NavigationSystem } from "./NavigationSystem.ts";
import type { TabId } from "../types/TabState.ts";

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

  constructor(private window: Window) {
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
  }

  init() {
    if (this._initialized) return;
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
      
      updateState(state => TabOps.discardTab(state, id));
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
        if (startTab) updateState(s => TabOps.updateAudioState(s, startTab._tabId, { soundPlaying: true }));
        break;
      case "DOMAudioPlaybackStopped":
        const stopTab = this.getTabForBrowser(event.target);
        if (stopTab) updateState(s => TabOps.updateAudioState(s, stopTab._tabId, { soundPlaying: false }));
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
      setSelectedTab((val as any)._tabId);
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
    updateState(state => TabOps.addTab(state, newTabData, tabIndex));
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
    updateState(s => TabOps.beginCloseTab(s, id));
    tab.dispatchEvent(new CustomEvent("TabClose", { bubbles: true, detail: options }));
    return true;
  }

  _endRemoveTab(tab: any) {
    const id = tab._tabId;
    const browser = DOMRegistry.getBrowser(id);
    if (browser) { browser.parentNode?.parentNode?.parentNode?.remove(); DOMRegistry.unregisterBrowser(id); }
    updateState(s => TabOps.endCloseTab(s, id));
  }

  // Forwarded properties
  get docShell() { return (this.selectedBrowser as any)?.docShell; }
  get webNavigation() { return (this.selectedBrowser as any)?.webNavigation; }
  get webProgress() { return (this.selectedBrowser as any)?.webProgress; }
  get contentTitle() { return (this.selectedBrowser as any)?.contentTitle; }
  
  loadURI(uri: string, options: any = {}) { NavigationSystem.loadURI((this.selectedTab as any)._tabId, uri, options); }
  
  getBrowserForTab(tab: any) { return DOMRegistry.getBrowser(tab?._tabId); }
  getTabForBrowser(browser: any) { return DOMRegistry.getTab(browser?._tabId); }

  _tabAttrModified(tab: any, changed: string[]) { if (tab) tab.dispatchEvent(new CustomEvent("TabAttrModified", { bubbles: true, detail: { changed } })); }
  _callProgressListeners(browser: any, method: string, args: any[]) {
    browser = browser || this.selectedBrowser;
    const tabsArgs = [browser, ...args];
    for (const l of (browser === this.selectedBrowser ? this.mProgressListeners : [])) if (method in l) l[method](...args);
    for (const l of this.mTabsProgressListeners) if (method in l) l[method](...tabsArgs);
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
  const compat = new TabbrowserCompat(window);
  compat.init();
  Object.defineProperty(window, "gBrowser", { get: () => compat, configurable: true });
}
