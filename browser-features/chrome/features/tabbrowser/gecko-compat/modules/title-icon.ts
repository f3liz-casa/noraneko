// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L1102~L1886
// Section: Title · Icon · Label · Browser Sharing

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { appState, selectedTab as selectedTabSignal } from "../../state/store.ts";
import * as TabOps from "../../ops/tab-ops.ts";
import { DOMRegistry } from "../DOMRegistry.ts";
import type { TabId } from "../../types/TabState.ts";
import { resolveTabId, dispatch } from "../compat-helpers.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    // Class fields used by this module
    _dataURLRegEx: RegExp;
    _nonPrintingRegEx: RegExp;
    _tabSwitchTelemetry: Map<string, { count: number; timestamp: number }>;
    _previousURL: string | null;
    _cachedTitleInfo: Record<string, string> | null;
    _shouldExposeContentTitle: boolean;
    _shouldExposeContentTitlePbm: boolean;
    tabLocalization: any;
    // Methods provided by this module
    setTabTitle(tab: MozTabbrowserTab): boolean;
    setIcon(tab: MozTabbrowserTab, iconUrl?: string, origUrl?: string, clearFirst?: boolean): void;
    getIcon(tab: MozTabbrowserTab): string;
    setDefaultIcon(tab: MozTabbrowserTab, uri: any): void;
    getTabSharingState(tab: MozTabbrowserTab): any;
    updateBrowserSharing(browser: XULBrowserElement, state: any): void;
    resetBrowserSharing(browser: XULBrowserElement): void;
    getWindowTitleForBrowser(browser: XULBrowserElement): string;
    setPageInfo(tab: MozTabbrowserTab, url: string, description: string, previewImage: string): void;
    setInitialTabTitle(tab: MozTabbrowserTab, title: string, options?: any): void;
    setTabLabelForAuthPrompts(tab: MozTabbrowserTab, label: string): boolean;
    previewTab(tab: MozTabbrowserTab, callback: () => void): void;
    getBrowserForOuterWindowID(id: number): any;
    getTabFromAudioEvent(event: Event): any;
    _checkIfShouldTriggerTabSelectMessage(): void;
    _setTabLabel(tab: MozTabbrowserTab, label: string, options?: any): boolean;
    _determineTaskbarTabTitle(profileIdentifier: string): string | null;
    _populateTitleCache(): void;
    _determineContentTitle(browser: XULBrowserElement): string;
  }
}

export const methods: Partial<TabbrowserCompat> & ThisType<TabbrowserCompat> = {
  // ==========================================================================
  // Title / Icon / Label (setTabTitle, _setTabLabel, updateTabIcon, etc.)
  // tabbrowser.js L1784~L2153, L1887~L1960, L1961~L2046
  // ==========================================================================

  /**
   * Update the tab's visible label from `browser.contentTitle`.
   *
   * The title pipeline: contentTitle → URL fallback → hostname fallback.
   * Returns `true` if the label was actually changed.
   */
  setTabTitle(tab: MozTabbrowserTab): boolean {
    const id = resolveTabId(tab);
    if (!id) return false;
    const browser = DOMRegistry.getBrowser(id) as any;
    if (!browser) return false;

    let title = browser.contentTitle ?? "";

    if ((tab as any).hasAttribute?.("customizemode")) {
      try {
        title = this.tabLocalization?.formatValueSync?.("tabbrowser-customizemode-tab-title") ?? title;
      } catch (_) { /* */ }
    }

    // Don't replace initially set label with URL while loading
    if ((tab as any)._labelIsInitialTitle) {
      if (!title) return false;
      delete (tab as any)._labelIsInitialTitle;
    }

    let isURL = false;
    title = title.trim();

    // If title contains only non-printing characters, discard it
    if (this._nonPrintingRegEx.test(title)) {
      title = "";
    }

    const isContentTitle = !!title;
    if (!title) {
      // Try URI as title
      try {
        if (browser.currentURI?.displaySpec) {
          try {
            title = Services.io.createExposableURI(browser.currentURI).displaySpec;
          } catch (_) {
            title = browser.currentURI.displaySpec;
          }
        }
      } catch (_) { /* */ }

      if (title && !(typeof isBlankPageURL === "function" && isBlankPageURL(title))) {
        isURL = true;
        if (title.length <= 500 || !this._dataURLRegEx.test(title)) {
          try {
            const characterSet = browser.characterSet;
            title = Services.textToSubURI?.unEscapeNonAsciiURI?.(characterSet, title) ?? title;
          } catch (_) { /* */ }
        }
      } else {
        title = this.tabContainer?.emptyTabTitle ?? "";
      }
    }

    return this._setTabLabel(tab, title, { isContentTitle, isURL });
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
      appState.value = TabOps.updateTabLabel(appState.value, id, {
        label, isContentTitle: !!isContentTitle, direction: isRTL ? "rtl" : "ltr",
      });
    }

    return true;
  },

  /** Set the favicon URL for a tab. Pass `""` to clear it. */
  setIcon(tab: MozTabbrowserTab, iconUrl = "", _origUrl?: string, _clearFirst?: boolean) {
    this._applyTabOp(tab, (s, id) => TabOps.setIcon(s, id, iconUrl), undefined, ["image"]);
  },

  /** Return the currently stored favicon URL for a tab (empty string if none). */
  getIcon(tab: MozTabbrowserTab): string {
    const id = resolveTabId(tab);
    return id ? appState.value.tabs[id]?.iconUrl ?? "" : "";
  },

  /**
   * Returns the active media-sharing state for a tab.
   *
   * @returns Object with boolean `camera`, boolean `microphone`, and string
   *          `screen` (empty string when no screen is being shared).
   */
  getTabSharingState(tab: MozTabbrowserTab) {
    const id = resolveTabId(tab);
    const state = id ? appState.value.tabs[id]?.sharingState : null;
    const webRTC = state?.webRTC ?? {};
    return {
      camera: !!webRTC.camera,
      microphone: !!webRTC.microphone,
      screen: webRTC.screen ? (webRTC.screen as string).replace("Paused", "") : "",
    };
  },

  /**
   * Clears the WebRTC sharing state for the browser's tab.
   *
   * Removes the `sharing` attribute and refreshes the permission panel when
   * the browser is currently selected.
   */
  resetBrowserSharing(browser: XULBrowserElement) {
    const tab = this.getTabForBrowser(browser);
    if (!tab) return;
    // If WebRTC was used, leave object to enable tracking of grace periods
    (tab as any)._sharingState = (tab as any)._sharingState?.webRTC ? { webRTC: {} } : {};
    (tab as any).removeAttribute?.("sharing");
    this._tabAttrModified(tab, ["sharing"]);
    if (browser === this.selectedBrowser) {
      try { gPermissionPanel?.updateSharingIndicator?.(); } catch (_) { /* */ }
    }
  },

  /**
   * Merges new sharing state into the browser's tab and refreshes the sharing indicator.
   *
   * @param state - Partial sharing state to merge; e.g. `{ webRTC: { camera: true } }`.
   */
  updateBrowserSharing(browser: XULBrowserElement, state: any) {
    const tab = this.getTabForBrowser(browser);
    if (!tab) return;
    if ((tab as any)._sharingState == null) (tab as any)._sharingState = {};
    (tab as any)._sharingState = Object.assign((tab as any)._sharingState, state);

    if ("webRTC" in state) {
      if ((tab as any)._sharingState.webRTC?.sharing) {
        if ((tab as any)._sharingState.webRTC.paused) {
          (tab as any).removeAttribute?.("sharing");
        } else {
          (tab as any).setAttribute?.("sharing", state.webRTC.sharing);
        }
      } else {
        (tab as any).removeAttribute?.("sharing");
      }
      this._tabAttrModified(tab, ["sharing"]);
    }
    if (browser === this.selectedBrowser) {
      try { gPermissionPanel?.updateSharingIndicator?.(); } catch (_) { /* */ }
    }
  },

  /**
   * Sets the favicon to a built-in default for well-known URIs (e.g. `about:newtab`).
   *
   * Does nothing when `uri` is not in the built-in defaults map.
   */
  setDefaultIcon(tab: MozTabbrowserTab, uri: nsIURI | string) {
    try {
      if (uri?.spec && uri.spec in FAVICON_DEFAULTS) {
        this.setIcon(tab, FAVICON_DEFAULTS[uri.spec]);
      }
    } catch (_) { /* */ }
  },

  /**
   * Persists page metadata to Places history and caches the description on the tab.
   *
   * @param url          - Page URL to update in history (skipped when empty).
   * @param description  - Short text description of the page.
   * @param previewImage - URL of the page's preview/thumbnail image.
   */
  setPageInfo(_tab: MozTabbrowserTab, url: string, description: string, previewImage: string) {
    if (url) {
      try {
        PlacesUtils?.history?.update?.({ url, description, previewImageURL: previewImage })
          ?.catch?.((e: any) => console.error(e));
      } catch (_) { /* */ }
    }
    if (_tab) (_tab as any).description = description;
  },

  /**
   * Sets the tab's label before any content title is available.
   *
   * Blank-page URLs are replaced with the empty-tab placeholder text.
   * Subsequent `setTabTitle` calls will override this value once a real
   * content title arrives.
   */
  setInitialTabTitle(tab: MozTabbrowserTab, title: string, options: any = {}) {
    if (!options.isContentTitle && typeof isBlankPageURL === "function" && isBlankPageURL(title)) {
      title = this.tabContainer?.emptyTabTitle ?? "";
    }
    if (title) {
      if (!(tab as any).getAttribute?.("label")) {
        (tab as any)._labelIsInitialTitle = true;
      }
      this._setTabLabel(tab, title, options);
    }
  },

  /**
   * Overrides the tab label with a string suitable for authentication prompts.
   *
   * @returns `true` if the label was changed, `false` otherwise.
   */
  setTabLabelForAuthPrompts(tab: MozTabbrowserTab, label: string) {
    return this._setTabLabel(tab, label);
  },

  /**
   * Temporarily selects `tab`, runs `callback`, then restores the previously selected tab.
   *
   * Useful for capturing screenshots or reading layout without persisting a tab switch.
   */
  previewTab(tab: MozTabbrowserTab, callback: () => void) {
    const currentTab = this.selectedTab;
    try {
      this._previewMode = true;
      this.selectedTab = tab;
      callback();
    } finally {
      this.selectedTab = currentTab;
      this._previewMode = false;
    }
  },

  /**
   * Finds the browser element whose `outerWindowID` matches `id`.
   *
   * @returns The matching browser element, or `null` if not found.
   */
  getBrowserForOuterWindowID(id: number): any {
    for (let i = 0; i < appState.value.tabOrder.length; i++) {
      const b = this.browsers[i];
      if (b && (b as any).outerWindowID === id) return b;
    }
    return null;
  },

  /**
   * Resolves the tab that owns the browser that fired a trusted audio event.
   *
   * @returns The owning `MozTabbrowserTab`, or `null` for untrusted events.
   */
  getTabFromAudioEvent(event: Event): any {
    if (!(event as any).isTrusted) return null;
    const browser = (event as any).originalTarget;
    return this.getTabForBrowser(browser);
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

  /**
   * Computes the full window title string for the given browser.
   *
   * Combines content title, taskbar-tab name, profile identifier, and
   * private-browsing suffix as appropriate for the current platform and
   * window configuration.
   *
   * @returns A `" — "`-joined title string, or the brand name alone when no
   *          content title is available.
   */
  getWindowTitleForBrowser(browser: XULBrowserElement): string {
    if (!this._cachedTitleInfo) this._populateTitleCache();

    const contentTitle = this._determineContentTitle(browser);
    const docElement = document.documentElement;
    const isTemporaryPrivateWindow =
      docElement?.getAttribute?.("privatebrowsingmode") === "temporary";

    let profileIdentifier: string | false = false;
    try {
      profileIdentifier =
        SelectableProfileService?.isEnabled &&
        SelectableProfileService.currentProfile?.name?.replace(/\0/g, "");
    } catch (_) { /* */ }

    const taskbarTabTitle = this._determineTaskbarTabTitle(profileIdentifier || "");
    const parts = [contentTitle, taskbarTabTitle ?? (profileIdentifier || "")].filter(Boolean);

    // macOS private window suffix with content title
    if (
      AppConstants?.platform === "macosx" &&
      contentTitle &&
      isTemporaryPrivateWindow
    ) {
      parts.push(this._cachedTitleInfo!["privateWindowSuffixForContent"] || "");
    }

    // Brand name (non-taskbar-tab)
    if (
      !taskbarTabTitle &&
      (!contentTitle || AppConstants?.platform !== "macosx")
    ) {
      parts.push(
        this._cachedTitleInfo![
          isTemporaryPrivateWindow ? "privateWindowTitle" : "mainWindowTitle"
        ] || "",
      );
    }

    return parts.filter(Boolean).join(" \u2014 ");
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
};
