// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L431~L815
// Section: Lifecycle · Tab Switcher · Progress Listeners

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { appState, selectedTab as selectedTabSignal, orderedTabs, send } from "../../state/store.ts";
import * as TabOps from "../../ops/tab-ops.ts";
import * as GroupOps from "../../ops/group-ops.ts";
import { DOMRegistry } from "../DOMRegistry.ts";
import { BrowserSystem } from "../BrowserSystem.ts";
import { uniq } from "es-toolkit";
import type { TabData, TabId, GroupId } from "../../types/TabState.ts";
import { resolveTabId, dispatch } from "../compat-helpers.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    // Class fields used by this module
    _dataURLRegEx: RegExp;
    _nonPrintingRegEx: RegExp;
    _initialized: boolean;
    _tabpanelsSelectHandler: any;
    tabLocalization: any;
    // Lifecycle
    init(): void;
    destroy(): void;
    // Tab Switcher
    _getSwitcher(): any;
    warmupTab(tab: MozTabbrowserTab): void;
    // Progress Listeners
    addProgressListener(listener: any): void;
    removeProgressListener(listener: any): void;
    addTabsProgressListener(listener: any): void;
    removeTabsProgressListener(listener: any): void;
    _callProgressListeners(browser: XULBrowserElement, method: string, args: any[]): void;
  }
}

export const methods: Partial<TabbrowserCompat> & ThisType<TabbrowserCompat> = {

  // ==========================================================================
  // Lifecycle
  // tabbrowser.js L94~L359
  // ==========================================================================

  /**
   * Initialize the tabbrowser.
   *
   * Wires the initial tab's progress listener, registers XPCOM observers, and
   * attaches all browser and tab-group event listeners. No-op if already initialized.
   */
  init() {
    if (this._initialized) return;

    this.tabLocalization = new (this.window as any).Localization(
      ["browser/tabbrowser.ftl", "browser/defaultBrowserNotification.ftl"],
      true,
    );

    // Wire up progress listener for the initial tab
    const initialTab = this.selectedTab;
    const initialBrowser = this.selectedBrowser as any;
    if (initialTab && initialBrowser) {
      this._tabForBrowser.set(initialBrowser, initialTab);
      (initialTab as any).permanentKey = initialBrowser.permanentKey;
      (initialTab as any)._tPos = 0;
      (initialTab as any)._fullyOpen = true;
      (initialTab as any).linkedBrowser = initialBrowser;

      initialBrowser.docShellIsActive = this.shouldActivateDocShell(initialBrowser);

      try { this._wireProgressListener(initialTab, initialBrowser); }
      catch (e) { console.warn("Failed to wire initial tab progress listener", e); }

      this.appendStatusPanel(initialBrowser);
    }

    // Register observers
    try {
      Services.obs.addObserver(this, "contextual-identity-updated");
      Services.obs.addObserver(this, "intl:app-locales-changed");
    } catch (_) { /* */ }

    this._setupEventListeners();
    this._initialized = true;
  },

  /**
   * Tear down the tabbrowser and release all resources.
   *
   * Removes event listeners, unregisters open URIs, destroys per-tab progress
   * listeners, and shuts down the async tab switcher. Safe to call multiple times.
   */
  destroy() {
    try { this.tabContainer?.destroy?.(); } catch (_) { /* */ }

    // Remove observers
    try {
      Services.obs.removeObserver(this, "contextual-identity-updated");
      Services.obs.removeObserver(this, "intl:app-locales-changed");
    } catch (_) { /* */ }

    // Unregister open URIs and remove progress listeners for all tabs
    for (const tab of this.tabs) {
      try {
        const browser = (tab as any).linkedBrowser;
        if (browser?.registeredOpenURI) {
          const uci = browser.getAttribute?.("usercontextid") || 0;
          this.UrlbarProviderOpenTabs?.unregisterOpenTab?.(
            browser.registeredOpenURI.spec, uci,
            (tab as any).group?.id,
            PrivateBrowsingUtils?.isWindowPrivate?.(this.window),
          );
          delete browser.registeredOpenURI;
        }
        const filter = this._tabFilters.get(tab);
        if (filter) {
          browser?.webProgress?.removeProgressListener?.(filter);
          const listener = this._tabListeners.get(tab);
          if (listener) {
            filter.removeProgressListener(listener);
            listener.destroy?.();
          }
          this._tabFilters.delete(tab);
          this._tabListeners.delete(tab);
        }
      } catch (_) { /* */ }
    }

    // Remove event listeners
    const doc = this.window.document;
    try {
      doc.removeEventListener("keydown", this, { mozSystemGroup: true } as any);
      doc.removeEventListener("keypress", this, { mozSystemGroup: true } as any);
    } catch (_) { /* */ }
    try {
      this.window.removeEventListener("framefocusrequested", this);
      this.window.removeEventListener("visibilitychange", this);
      this.removeEventListener("DOMAudioPlaybackStarted", this);
      this.removeEventListener("DOMAudioPlaybackStopped", this);
      this.removeEventListener("DOMAudioPlaybackBlockStarted", this);
      this.removeEventListener("DOMAudioPlaybackBlockStopped", this);
      this.removeEventListener("GloballyAutoplayBlocked", this);
      this.removeEventListener("pagetitlechanged", this);
      this.window.removeEventListener("activate", this);
      this.window.removeEventListener("deactivate", this);
    } catch (_) { /* */ }
    try {
      // Remove tab group and split view event listeners
      this.tabContainer?.removeEventListener?.("TabGroupCollapse", this);
      this.tabContainer?.removeEventListener?.("TabGroupCreateByUser", this);
      this.tabContainer?.removeEventListener?.("TabGrouped", this);
      this.tabContainer?.removeEventListener?.("TabUngrouped", this);
      this.tabContainer?.removeEventListener?.("TabSplitViewActivate", this);
      this.tabContainer?.removeEventListener?.("TabSplitViewDeactivate", this);
      const tabpanels = doc.getElementById("tabbrowser-tabpanels");
      if (tabpanels && this._tabpanelsSelectHandler) {
        tabpanels.removeEventListener("select", this._tabpanelsSelectHandler);
        this._tabpanelsSelectHandler = null;
      }
    } catch (_) { /* */ }

    // Destroy switcher
    if (this._switcher) {
      try { this._switcher.destroy(); } catch (_) { /* */ }
      this._switcher = null;
    }

    this._initialized = false;
  },

  // ==========================================================================
  // Tab Switcher
  // tabbrowser.js L7356~L7362
  // ==========================================================================

  _getSwitcher() {
    if (!this._switcher) {
      this._switcher = new this.AsyncTabSwitcher(this);
    }
    return this._switcher;
  },

  /**
   * Pre-render a background tab so switching to it is instant.
   *
   * Delegates to `AsyncTabSwitcher` when multi-process browsing is active.
   * No-op in single-process mode.
   *
   * @param tab - The background tab to warm up.
   */
  warmupTab(tab: MozTabbrowserTab) {
    if (typeof gMultiProcessBrowser !== "undefined" && gMultiProcessBrowser) {
      this._getSwitcher().warmupTab(tab);
    }
  },

  // ==========================================================================
  // Progress Listeners
  // tabbrowser.js L6144~L6173, L1054~L1101
  // ==========================================================================

  /**
   * Register a global web progress listener for the selected browser.
   *
   * The listener fires only for navigation events on the selected browser.
   * Duplicate registrations are silently ignored.
   *
   * @param listener - Listener conforming to `nsIWebProgressListener`.
   */
  addProgressListener(listener: nsIWebProgressListener): void {
    this.mProgressListeners = uniq([...this.mProgressListeners, listener]);
  },

  /**
   * Unregister a global web progress listener.
   *
   * @param listener - The listener to remove.
   */
  removeProgressListener(listener: nsIWebProgressListener): void {
    const i = this.mProgressListeners.indexOf(listener);
    if (i > -1) this.mProgressListeners.splice(i, 1);
  },

  /**
   * Register a per-tab progress listener that fires for every browser.
   *
   * Unlike `addProgressListener`, this listener receives events from all tabs,
   * not just the selected one. Duplicate registrations are silently ignored.
   *
   * @param listener - Listener conforming to `nsIWebProgressListener`.
   */
  addTabsProgressListener(listener: nsIWebProgressListener): void {
    this.mTabsProgressListeners = uniq([...this.mTabsProgressListeners, listener]);
  },

  /**
   * Unregister a per-tab progress listener.
   *
   * @param listener - The listener to remove.
   */
  removeTabsProgressListener(listener: nsIWebProgressListener): void {
    const i = this.mTabsProgressListeners.indexOf(listener);
    if (i > -1) this.mTabsProgressListeners.splice(i, 1);
  },

  _callProgressListeners(
    browser: XULBrowserElement,
    method: string,
    args: any[],
    callGlobal = true,
    callTabs = true,
  ): boolean {
    let rv = true;
    browser = browser || this.selectedBrowser;

    const invoke = (listeners: any[], a: any[]) => {
      for (const p of listeners) {
        if (method in p) {
          try { if (p[method].apply(p, a) === false) rv = false; }
          catch (e) { console.error(e); }
        }
      }
    };

    if (callGlobal && browser === this.selectedBrowser)
      invoke(this.mProgressListeners, args);
    if (callTabs)
      invoke(this.mTabsProgressListeners, [browser, ...args]);

    return rv;
  },
};
