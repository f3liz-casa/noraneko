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
    // Internal helpers moved here
    _setTabLabel(tab: MozTabbrowserTab, value: string, options?: any): void;
    _populateTitleCache(): void;
    _determineContentTitle(browser: XULBrowserElement): string;
    _determineTaskbarTabTitle(browser: XULBrowserElement): string;
    _isInCollapsedGroup(tab: MozTabbrowserTab): boolean;
    _checkIfShouldTriggerTabSelectMessage(tab: MozTabbrowserTab): void;
    _setupEventListeners(): void;
  }
}

export const methods: Partial<TabbrowserCompat> & ThisType<TabbrowserCompat> = {
  // ==========================================================================
  // Internal dedup helpers (subset)
  // noraneko extension — shared utilities
  // ==========================================================================

  _isInCollapsedGroup(tabId: TabId): boolean {
    const s = appState.value;
    const gid = s.tabs[tabId]?.groupId;
    return gid ? s.groups[gid]?.isCollapsed ?? false : false;
  },

  _setTabLabel(tab: MozTabbrowserTab, label: string, options: any = {}): boolean {
    if (!label || label.includes("about:reader?")) return false;

    const { beforeTabOpen, isContentTitle, isURL } = options;

    // Truncate long base64 data URIs
    if (isURL && label.length > 500 && this._dataURLRegEx.test(label)) {
      label = label.substring(0, 500) + "\u2026";
    }

    (tab as any)._fullLabel = label;

    if (!isContentTitle) {
      // Remove protocol and "www."
      if (!(this as any)._regex_shortenURLForTabLabel) {
        (this as any)._regex_shortenURLForTabLabel = /^[^:]+:\/\/(?:www\.)?/;
      }
      label = label.replace((this as any)._regex_shortenURLForTabLabel, "");
    }

    (tab as any)._labelIsContentTitle = isContentTitle;

    if ((tab as any).getAttribute?.("label") === label) return false;

    // RTL detection
    let isRTL = false;
    try {
      const dwu = (this.window as any).windowUtils;
      isRTL = dwu?.getDirectionFromText?.(label) === Ci.nsIDOMWindowUtils?.DIRECTION_RTL;
    } catch (_) { /* */ }

    (tab as any).setAttribute?.("label", label);
    (tab as any).setAttribute?.("labeldirection", isRTL ? "rtl" : "ltr");
    (tab as any).toggleAttribute?.("labelendaligned", isRTL !== (document.dir === "rtl"));

    if (!beforeTabOpen) {
      this._tabAttrModified(tab, ["label"]);
    }

    if ((tab as any).selected) {
      this.updateTitlebar();
    }

    // Update DOP state
    const id = resolveTabId(tab);
    if (id) {
      send({
        type: "UPDATE_TAB_LABEL",
        tabId: id,
        label,
        isContentTitle: !!isContentTitle,
        direction: isRTL ? "rtl" : "ltr",
      });
    }

    return true;
  },

  _populateTitleCache() {
    this._cachedTitleInfo = {};
    for (const id of ["mainWindowTitle", "privateWindowTitle", "privateWindowSuffixForContent"]) {
      this._cachedTitleInfo[id] = document.getElementById(id)?.textContent || "";
    }
  },

  _determineContentTitle(browser: XULBrowserElement): string {
    if (!this._shouldExposeContentTitle) return "";
    try {
      if (
        PrivateBrowsingUtils?.isWindowPrivate?.(this.window) &&
        !this._shouldExposeContentTitlePbm
      ) return "";
    } catch (_) { /* */ }

    let title = "";
    const docElement = document.documentElement;

    // If location bar is hidden, add scheme+host to prevent spoofing
    try {
      if (docElement?.getAttribute?.("chromehidden")?.includes("location")) {
        const uri = Services.io.createExposableURI(browser?.currentURI);
        let prefix = uri.prePath;
        if (uri.scheme === "about") {
          prefix = uri.spec;
        } else if (uri.scheme === "moz-extension") {
          try {
            const ext = WebExtensionPolicy?.getByHostname?.(uri.host);
            if (ext?.name) {
              const extensionLabel = document.getElementById("urlbar-label-extension");
              prefix = `${(extensionLabel as any)?.value ?? "Extension"} (${ext.name})`;
            }
          } catch (_) { /* */ }
        }
        title = prefix + " - ";
      }
    } catch (_) { /* */ }

    if (docElement?.hasAttribute?.("titlepreface")) {
      title += docElement.getAttribute("titlepreface");
    }

    const tab = this.getTabForBrowser(browser);
    if (tab && (tab as any)._labelIsContentTitle) {
      title += ((tab as any).getAttribute?.("label") ?? "").replace(/\0/g, "");
    }

    return title;
  },

  _determineTaskbarTabTitle(profileIdentifier: string): string | null {
    if (!this._shouldExposeContentTitle) return null;

    if (this._taskbarTabTitle && this._taskbarTabTitleLastProfile === profileIdentifier) {
      return this._taskbarTabTitle;
    }

    let ttId: string | null = null;
    try {
      ttId = this.TaskbarTabsUtils?.getTaskbarTabIdFromWindow?.(this.window) ?? null;
    } catch (_) { /* */ }
    if (!ttId) return null;

    if (!this._taskbarTab) {
      try {
        this.TaskbarTabs?.getTaskbarTab?.(ttId)
          ?.then?.((tt: any) => {
            this._taskbarTab = tt;
            this.updateTitlebar();
          })
          ?.catch?.(() => { /* */ });
      } catch (_) { /* */ }
      return null;
    }

    let containerLabel = "";
    try {
      if (this._taskbarTab.userContextId) {
        containerLabel = ContextualIdentityService?.getUserContextLabel?.(this._taskbarTab.userContextId) ?? "";
      }
    } catch (_) { /* */ }

    let stringName = "taskbar-tab-title-default";
    if (containerLabel && profileIdentifier) {
      stringName = "taskbar-tab-title-container-profile";
    } else if (containerLabel) {
      stringName = "taskbar-tab-title-container";
    } else if (profileIdentifier) {
      stringName = "taskbar-tab-title-profile";
    }

    try {
      this._taskbarTabTitle = this.tabLocalization?.formatValueSync?.(stringName, {
        name: this._taskbarTab.name,
        container: containerLabel,
        profile: profileIdentifier,
      }) ?? null;
    } catch (_) { this._taskbarTabTitle = null; }
    this._taskbarTabTitleLastProfile = profileIdentifier;
    return this._taskbarTabTitle;
  },

  _checkIfShouldTriggerTabSelectMessage() {
    // ASRouter tab switch trigger — track switch frequency between URL pairs (3 switches in 60s)
    try {
      const browser = this.selectedBrowser as any;
      if (!browser?.currentURI) return;
      const currentURL = browser.currentURI.spec;
      const now = Date.now();

      // Track the previous URL to detect pairs
      if (!this._previousURL) {
        this._previousURL = currentURL;
        return;
      }

      // Only track if switching between different URLs
      if (this._previousURL === currentURL) return;

      // Create key for the URL pair (sorted for bidirectional tracking)
      const [url1, url2] = [this._previousURL, currentURL].sort();
      const key = `${url1}<->${url2}`;

      this._cleanupTabSwitchTelemetry(now);

      const entry = this._tabSwitchTelemetry.get(key);
      if (entry) {
        entry.count++;
        entry.timestamp = now;
        if (entry.count >= 3) {
          // Trigger ASRouter message
          (this.window as any).ASRouter?.sendTriggerMessage?.({
            browser,
            id: "tabSwitch",
          });
          // Reset counter after triggering
          this._tabSwitchTelemetry.delete(key);
        }
      } else {
        this._tabSwitchTelemetry.set(key, { count: 1, timestamp: now });
      }

      // Update previous URL for next switch
      this._previousURL = currentURL;
    } catch (_) { /* */ }
  },

  _setupEventListeners() {
    const doc = this.window.document;
    doc.addEventListener("keydown", this, { mozSystemGroup: true } as any);
    doc.addEventListener("keypress", this, { mozSystemGroup: true } as any);
    this.window.addEventListener("framefocusrequested", this);
    this.window.addEventListener("visibilitychange", this);
    this.addEventListener("DOMAudioPlaybackStarted", this);
    this.addEventListener("DOMAudioPlaybackStopped", this);
    this.addEventListener("DOMAudioPlaybackBlockStarted", this);
    this.addEventListener("DOMAudioPlaybackBlockStopped", this);
    this.addEventListener("GloballyAutoplayBlocked", this);
    this.addEventListener("pagetitlechanged", this);
    this.window.addEventListener("activate", this);
    this.window.addEventListener("deactivate", this);

    // Tab group events
    const tabContainer = doc.getElementById("tabbrowser-tabs");
    if (tabContainer) {
      tabContainer.addEventListener("TabGroupCollapse", this);
      tabContainer.addEventListener("TabGroupCreateByUser", this);
      tabContainer.addEventListener("TabGrouped", this);
      tabContainer.addEventListener("TabUngrouped", this);
      tabContainer.addEventListener("TabSplitViewActivate", this);
      tabContainer.addEventListener("TabSplitViewDeactivate", this);
    }

    // Tabpanels select → updateCurrentBrowser
    const panels = doc.getElementById("tabbrowser-tabpanels");
    if (panels) {
      this._tabpanelsSelectHandler = () => this.updateCurrentBrowser();
      panels.addEventListener("select", this._tabpanelsSelectHandler);
    }
  },

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
