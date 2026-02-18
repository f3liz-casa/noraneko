// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L4163~L4632, L7706~L7960
// Section: Events · Utility Methods · Observer

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
    _tabpanelsSelectHandler: any;
    _switcher: any;
    tabLocalization: any;
    // Methods
    _handleKeyDownEvent(event: Event): void;
    _handleKeyPressEvent(event: Event): void;
    observe(subject: any, topic: string): void;
    warnAboutClosingTabs(tabsToClose: number, aCloseTabs: number): boolean;
    removeAllTabsBut(tab: MozTabbrowserTab, options?: any): void;
    removeTabsToTheStartFrom(tab: MozTabbrowserTab, options?: any): void;
    removeTabsToTheEndFrom(tab: MozTabbrowserTab, options?: any): void;
    getAllDuplicateTabsToClose(tab: MozTabbrowserTab): any[];
    getDuplicateTabsToClose(tab: MozTabbrowserTab): any[];
    removeDuplicateTabs(tab: MozTabbrowserTab): void;
    removeAllDuplicateTabs(options?: any): void;
    _removeDuplicateTabs(tabs: MozTabbrowserTab[]): void;
    _getTabsToTheStartFrom(tab: MozTabbrowserTab): any[];
    _getTabsToTheEndFrom(tab: MozTabbrowserTab): any[];
    createTabsForSessionRestore(tabs: MozTabbrowserTab[]): any;
    isTab(element: any): boolean;
    isTabGroup(element: any): boolean;
    isTabGroupLabel(element: any): boolean;
    isSplitViewWrapper(element: any): boolean;
    toggleCaretBrowsing(): void;
    closeContextTabs(options?: any): void;
    translateTabContextMenu(contextMenu: any): void;
    onMouseEnter(event: Event): void;
    onMouseLeave(event: Event): void;
    updateContextMenu(contextMenu: any): void;
  }
}

export const methods: Partial<TabbrowserCompat> & ThisType<TabbrowserCompat> = {
  // ==========================================================================
  // Events
  // tabbrowser.js L7706~L7877
  // ==========================================================================

  _tabAttrModified(tab: MozTabbrowserTab, changed: string[]) {
    dispatch(tab, "TabAttrModified", { changed });
  },

  _setupEventListeners() {
    const doc = this.window.document;
    doc.addEventListener("keydown", this, { capture: true } as any);
    doc.addEventListener("keypress", this, { capture: true } as any);
    this.window.addEventListener("framefocusrequested", this);
    this.window.addEventListener("visibilitychange", this);
    this.window.addEventListener("DOMAudioPlaybackStarted", this);
    this.window.addEventListener("DOMAudioPlaybackStopped", this);
    this.window.addEventListener("DOMAudioPlaybackBlockStarted", this);
    this.window.addEventListener("DOMAudioPlaybackBlockStopped", this);
    this.window.addEventListener("GloballyAutoplayBlocked", this);
    this.window.addEventListener("pagetitlechanged", this);
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

  /**
   * Central DOM event dispatcher for browser-tab interaction events.
   *
   * Handles: `keydown`, `keypress`, `framefocusrequested`,
   * `activate`, `deactivate`, `sizemodechange`, `occlusionstatechange`,
   * `TabAttrModified`, `TabPinned`, `TabUnpinned`, and various media/audio events.
   */
  handleEvent(event: Event) {
    switch (event.type) {
      case "keydown":
        this._handleKeyDownEvent(event);
        break;
      case "keypress":
        this._handleKeyPressEvent(event);
        break;
      case "framefocusrequested": {
        const tab = this.getTabForBrowser(event.target);
        if (!tab || tab === this.selectedTab) break;
        this.selectedTab = tab;
        this.window.focus();
        event.preventDefault();
        break;
      }
      case "visibilitychange": {
        const inactive = document.hidden;
        if (!this._switcher) {
          for (const browser of this.selectedBrowsers) {
            try {
              (browser as any).preserveLayers?.(inactive);
              (browser as any).docShellIsActive = !inactive;
            } catch (_) { /* */ }
          }
        }
        break;
      }
      case "activate":
      case "deactivate":
        try { (this.selectedTab as any)?.updateLastSeenActive?.(); } catch (_) { /* */ }
        break;
      case "pagetitlechanged": {
        const tab = this.getTabForBrowser(event.target);
        if (tab) this.setTabTitle(tab);
        break;
      }
      case "DOMAudioPlaybackStarted":
      case "DOMAudioPlaybackStopped": {
        const t = this.getTabFromAudioEvent(event) ?? this.getTabForBrowser(event.target);
        if (t) {
          const id = resolveTabId(t);
          const playing = event.type === "DOMAudioPlaybackStarted";
          if (id) {
            appState.value = TabOps.updateAudioState(appState.value, id, { soundPlaying: playing });

            if (playing) {
              // Clear any pending removal timer
              if ((t as any)._soundPlayingAttrRemovalTimer) {
                clearTimeout((t as any)._soundPlayingAttrRemovalTimer);
                (t as any)._soundPlayingAttrRemovalTimer = 0;
              }
              const modifiedAttrs: string[] = [];
              if ((t as any).hasAttribute?.("soundplaying-scheduledremoval")) {
                (t as any).removeAttribute?.("soundplaying-scheduledremoval");
                modifiedAttrs.push("soundplaying-scheduledremoval");
              }
              if (!(t as any).hasAttribute?.("soundplaying")) {
                (t as any).toggleAttribute?.("soundplaying", true);
                modifiedAttrs.push("soundplaying");
              }
              if (modifiedAttrs.length) {
                // Force style flush for opacity transition
                try { (this.window as any).getComputedStyle?.(t)?.opacity; } catch (_) { /* */ }
                this._tabAttrModified(t, modifiedAttrs);
              }
            } else {
              // Delayed removal of soundplaying attribute
              if ((t as any).hasAttribute?.("soundplaying")) {
                let removalDelay = 3000;
                try { removalDelay = Services.prefs.getIntPref("browser.tabs.delayHidingAudioPlayingIconMS"); } catch (_) { /* */ }
                (t as any).style?.setProperty?.("--soundplaying-removal-delay", `${removalDelay - 300}ms`);
                (t as any).toggleAttribute?.("soundplaying-scheduledremoval", true);
                this._tabAttrModified(t, ["soundplaying-scheduledremoval"]);
                (t as any)._soundPlayingAttrRemovalTimer = setTimeout(() => {
                  (t as any).removeAttribute?.("soundplaying-scheduledremoval");
                  (t as any).removeAttribute?.("soundplaying");
                  this._tabAttrModified(t, ["soundplaying", "soundplaying-scheduledremoval"]);
                }, removalDelay);
              }
            }
          }
        }
        break;
      }
      case "DOMAudioPlaybackBlockStarted":
      case "DOMAudioPlaybackBlockStopped": {
        const t = this.getTabFromAudioEvent(event) ?? this.getTabForBrowser(event.target);
        if (t) {
          const id = resolveTabId(t);
          const blocked = event.type === "DOMAudioPlaybackBlockStarted";
          if (id) {
            appState.value = TabOps.updateAudioState(appState.value, id, { activeMediaBlocked: blocked });
            (t as any).toggleAttribute?.("activemedia-blocked", blocked);
            this._tabAttrModified(t, ["activemedia-blocked"]);
          }
        }
        break;
      }
      case "GloballyAutoplayBlocked": {
        // Forward to notification UI if available
        try {
          const browser = (event as any).originalTarget ?? event.target;
          const tab = this.getTabForBrowser(browser);
          if (tab) {
            (tab as any).toggleAttribute?.("activemedia-blocked", true);
            this._tabAttrModified(tab, ["activemedia-blocked"]);
          }
        } catch (_) { /* */ }
        break;
      }
      case "TabGroupCollapse":
        try {
          ((event as any).target?.tabs ?? []).forEach((tab: any) => {
            this.removeFromMultiSelectedTabs(tab);
          });
        } catch (_) { /* */ }
        break;
      case "TabGroupCreateByUser":
        try { this.tabGroupMenu?.openCreateModal?.((event as any).target); } catch (_) { /* */ }
        break;
      case "TabGrouped": {
        const tab = (event as CustomEvent).detail;
        this._reregisterOpenTab(tab, (event as any).target?.id ?? null);
        break;
      }
      case "TabUngrouped": {
        const tab = (event as CustomEvent).detail;
        const originalGroup = (event as any).target;
        this._unregisterAndReregisterOpenTab(tab, originalGroup?.id ?? null);
        break;
      }
      case "TabSplitViewActivate":
        // Handled via state store
        break;
      case "TabSplitViewDeactivate":
        // Handled via state store
        break;
    }
  },

  /**
   * Toggles caret browsing mode, showing a confirmation prompt the first time
   * if the warning preference has not been permanently dismissed.
   */
  toggleCaretBrowsing() {
    const kPrefName = "accessibility.browsewithcaret_shortcut.enabled";
    const kWarningPref = "accessibility.warn_on_browsewithcaret";
    const kCaretPref = "accessibility.browsewithcaret";
    try {
      if (!Services.prefs.getBoolPref(kPrefName)) return;
      const warn = Services.prefs.getBoolPref(kWarningPref);
      if (warn) {
        // Show prompt dialog when warning is enabled
        const strings = Services.strings.createBundle("chrome://global/locale/keys.properties");
        const message = strings.GetStringFromName("browsewithcaret.message");
        const prompt = Services.prompt;
        const checkState = { value: false };
        const flags = prompt.BUTTON_POS_0 * prompt.BUTTON_TITLE_YES +
                      prompt.BUTTON_POS_1 * prompt.BUTTON_TITLE_NO;
        const result = prompt.confirmEx(
          this.window, strings.GetStringFromName("browsewithcaret.title"),
          message, flags, null, null, null,
          strings.GetStringFromName("browsewithcaret.checkMsg"), checkState,
        );
        if (result === 1) return;  // User clicked No
        if (checkState.value) {
          Services.prefs.setBoolPref(kWarningPref, false);
        }
      }
      const currentValue = Services.prefs.getBoolPref(kCaretPref);
      Services.prefs.setBoolPref(kCaretPref, !currentValue);
    } catch (_) { /* */ }
  },

  _maybeRequestReplyFromRemoteContent(event: KeyboardEvent): boolean {
    // If the selected browser is remote, ask it to handle the caret browsing toggle
    const browser = this.selectedBrowser as any;
    if (!browser?.isRemoteBrowser) return false;
    try {
      browser.sendMessageToActor?.("ToggleCaretBrowsing", {}, "BrowserKeyHandler");
      event.preventDefault();
      return true;
    } catch (_) { return false; }
  },

  /**
   * Moves the currently selected tab one position forward in the tab order.
   */
  moveTabForward() {
    const tab = this.selectedTab;
    if (!tab) return;
    const id = resolveTabId(tab);
    if (!id) return;
    const idx = appState.value.tabOrder.indexOf(id);
    if (idx < appState.value.tabOrder.length - 1) {
      appState.value = TabOps.moveTab(appState.value, id, idx + 1);
      dispatch(tab, "TabMove");
    }
  },

  /**
   * Moves the currently selected tab one position backward in the tab order.
   */
  moveTabBackward() {
    const tab = this.selectedTab;
    if (!tab) return;
    const id = resolveTabId(tab);
    if (!id) return;
    const idx = appState.value.tabOrder.indexOf(id);
    if (idx > 0) {
      appState.value = TabOps.moveTab(appState.value, id, idx - 1);
      dispatch(tab, "TabMove");
    }
  },

  _reregisterOpenTab(tab: MozTabbrowserTab, groupId: string | null) {
    const uri = (tab as any).linkedBrowser?.registeredOpenURI ?? (tab as any)._originalRegisteredOpenURI;
    if (!uri) return;
    try {
      this.UrlbarProviderOpenTabs?.unregisterOpenTab?.(
        uri.spec, (tab as any).userContextId, null,
        PrivateBrowsingUtils?.isWindowPrivate?.(this.window),
      );
      this.UrlbarProviderOpenTabs?.registerOpenTab?.(
        uri.spec, (tab as any).userContextId, groupId,
        PrivateBrowsingUtils?.isWindowPrivate?.(this.window),
      );
    } catch (_) { /* */ }
  },

  _unregisterAndReregisterOpenTab(tab: MozTabbrowserTab, originalGroupId: string | null) {
    const uri = (tab as any).linkedBrowser?.registeredOpenURI ?? (tab as any)._originalRegisteredOpenURI;
    if (!uri) return;
    try {
      this.UrlbarProviderOpenTabs?.unregisterOpenTab?.(
        uri.spec, (tab as any).userContextId, originalGroupId,
        PrivateBrowsingUtils?.isWindowPrivate?.(this.window),
      );
      this.UrlbarProviderOpenTabs?.registerOpenTab?.(
        uri.spec, (tab as any).userContextId, null,
        PrivateBrowsingUtils?.isWindowPrivate?.(this.window),
      );
    } catch (_) { /* */ }
  },

  // ==========================================================================
  // Utility Methods
  // tabbrowser.js L6178~L6460
  // ==========================================================================

  /**
   * Returns the content-process PIDs associated with the tab's browser,
   * including any remote subframe process PIDs sorted in ascending order.
   *
   * @returns An empty array when the tab has no linked browser or PIDs are unavailable.
   */
  getTabPids(tab: MozTabbrowserTab): number[] {
    if (!tab?.linkedBrowser) {
      return [];
    }
    // Get PIDs of content process and remote subframe processes
    try {
      const [contentPid, ...framePids] = E10SUtils.getBrowserPids?.(
        tab.linkedBrowser,
        gFissionBrowser
      ) ?? [];
      const pids = contentPid ? [contentPid] : [];
      return pids.concat(framePids.sort());
    } catch (_) {
      return [];
    }
  },

  /**
   * Returns the tooltip string displayed when hovering over `tab`.
   *
   * Combines the tab label, optional debug info (PID, activeness), container
   * or tab-group context, and audio-playing status, joined by newlines.
   *
   * @param includeLabel - When `false`, omits the tab title from the result.
   */
  getTabTooltip(tab: MozTabbrowserTab, includeLabel = true): string {
    const labelArray: string[] = [];
    
    if (includeLabel) {
      labelArray.push((tab as any)._fullLabel || tab.getAttribute?.("label") || "");
    }

    if ((this as any).showPidAndActiveness) {
      const pids = this.getTabPids(tab);
      const debugStringArray: string[] = [];
      
      if (pids.length) {
        const pidLabel = pids.length > 1 ? "pids" : "pid";
        debugStringArray.push(`(${pidLabel} ${pids.join(", ")})`);
      }

      if ((tab as any).linkedBrowser?.docShellIsActive) {
        debugStringArray.push("[A]");
      }

      if (this.SponsorProtection?.isProtectedBrowser?.((tab as any).linkedBrowser)) {
        debugStringArray.push("[S]");
      }

      if (debugStringArray.length) {
        labelArray.push(debugStringArray.join(" "));
      }
    }

    // Add container and tab group info
    const containerName = (tab as any).userContextId
      ? ContextualIdentityService?.getUserContextLabel?.((tab as any).userContextId)
      : "";
    
    const tabGroupName = (this as any)._isFirstOrLastInTabGroup?.(tab)
      ? (tab as any).group?.name ||
        this.tabLocalization?.formatValueSync?.("tab-group-name-default")
      : "";

    if (containerName || tabGroupName) {
      let tabContextString;
      if (containerName && tabGroupName) {
        tabContextString = this.tabLocalization?.formatValueSync?.(
          "tabbrowser-tab-tooltip-tab-group-container",
          { tabGroupName, containerName }
        );
      } else if (tabGroupName) {
        tabContextString = this.tabLocalization?.formatValueSync?.(
          "tabbrowser-tab-tooltip-tab-group",
          { tabGroupName }
        );
      } else {
        tabContextString = this.tabLocalization?.formatValueSync?.(
          "tabbrowser-tab-tooltip-container",
          { containerName }
        );
      }
      if (tabContextString) {
        labelArray.push(tabContextString);
      }
    }

    if ((tab as any).soundPlaying) {
      const audioPlayingString = this.tabLocalization?.formatValueSync?.(
        "tabbrowser-tab-audio-playing-description"
      );
      if (audioPlayingString) {
        labelArray.push(audioPlayingString);
      }
    }

    return labelArray.join("\n");
  },

  /**
   * Populates the `<tooltip>` element with the appropriate label for the
   * hovered tab.
   *
   * Shows a mute/unmute action label when hovering the audio icon, or the
   * full tab tooltip text otherwise. Cancels the tooltip when tab card
   * previews are enabled.
   */
  createTooltip(event: Event) {
    event.stopPropagation();
    let tab = event.target?.triggerNode?.closest?.("tab");
    if (!tab) {
      if (event.target?.triggerNode?.getRootNode?.()?.host?.closest?.("tab")) {
        // Check if triggerNode is within shadowRoot
        tab = event.target.triggerNode.getRootNode().host.closest("tab");
      } else {
        event.preventDefault();
        return;
      }
    }

    const tooltip = event.target;
    tooltip.removeAttribute?.("data-l10n-id");

    const tabCount = this.selectedTabs.includes(tab)
      ? this.selectedTabs.length
      : 1;
    
    if ((tab as any)._overPlayingIcon || (tab as any)._overAudioButton) {
      let l10nId;
      const l10nArgs: any = { tabCount };
      if (tab.selected) {
        l10nId = (tab as any).linkedBrowser?.audioMuted
          ? "tabbrowser-unmute-tab-audio-tooltip"
          : "tabbrowser-mute-tab-audio-tooltip";
        const keyElem = this.window.document.getElementById("key_toggleMute");
        if (keyElem) {
          l10nArgs.shortcut = ShortcutUtils?.prettifyShortcut?.(keyElem);
        }
      } else if (tab.hasAttribute?.("activemedia-blocked")) {
        l10nId = "tabbrowser-unblock-tab-audio-tooltip";
      } else {
        l10nId = (tab as any).linkedBrowser?.audioMuted
          ? "tabbrowser-unmute-tab-audio-background-tooltip"
          : "tabbrowser-mute-tab-audio-background-tooltip";
      }
      tooltip.label = "";
      (this.window.document as any).l10n?.setAttributes?.(tooltip, l10nId, l10nArgs);
    } else {
      // Prevent tooltip if card preview is enabled
      if ((this as any)._showTabCardPreview) {
        event.preventDefault();
        return;
      }
      tooltip.label = this.getTabTooltip(tab, true);
    }
  },

  /**
   * Show a confirmation dialog before a bulk tab close operation.
   *
   * @param tabsToClose - Number of tabs about to be closed
   * @param aCloseTabs  - `closingTabsEnum` value describing the operation type
   * @returns `true` when the user confirmed; `false` when they cancelled
   */
  warnAboutClosingTabs(tabsToClose: number, aCloseTabs: number): boolean {
    // Handle duplicate tabs warning
    const shownDupeDialogPref =
      "browser.tabs.haveShownCloseAllDuplicateTabsWarning";
    const ps = Services.prompt;
    
    if (
      aCloseTabs === this.closingTabsEnum.ALL_DUPLICATES &&
      !Services.prefs?.getBoolPref?.(shownDupeDialogPref, false)
    ) {
      Services.prefs?.setBoolPref?.(shownDupeDialogPref, true);
      this.window.focus();
      
      const [title, text, button] = this.tabLocalization?.formatValuesSync?.([
        { id: "tabbrowser-confirm-close-all-duplicate-tabs-title" },
        { id: "tabbrowser-confirm-close-all-duplicate-tabs-text" },
        { id: "tabbrowser-confirm-close-all-duplicate-tabs-button-closetabs" },
      ]) ?? ["", "", ""];

      const flags =
        ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING +
        ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL +
        ps.BUTTON_POS_0_DEFAULT;

      const buttonPressed = ps.confirmEx(
        this.window,
        title,
        text,
        flags,
        button,
        null,
        null,
        null,
        {}
      );
      return buttonPressed === 0;
    }

    if (tabsToClose <= 1) {
      return true;
    }

    const pref =
      aCloseTabs === this.closingTabsEnum.ALL
        ? "browser.tabs.warnOnClose"
        : "browser.tabs.warnOnCloseOtherTabs";
    const shouldPrompt = Services.prefs?.getBoolPref?.(pref);
    if (!shouldPrompt) {
      return true;
    }

    const maxTabsUndo = Services.prefs?.getIntPref?.(
      "browser.sessionstore.max_tabs_undo"
    ) ?? 10;
    if (
      aCloseTabs !== this.closingTabsEnum.ALL &&
      tabsToClose <= maxTabsUndo
    ) {
      return true;
    }

    // Replace any open dialog
    try {
      (this.window as any).gDialogBox?.replaceDialogIfOpen?.();
    } catch (_) { /* */ }

    const warnOnClose = { value: true };
    this.window.focus();
    
    const [title, button, checkbox] = this.tabLocalization?.formatValuesSync?.([
      {
        id: "tabbrowser-confirm-close-tabs-title",
        args: { tabCount: tabsToClose },
      },
      { id: "tabbrowser-confirm-close-tabs-button" },
      { id: "tabbrowser-ask-close-tabs-checkbox" },
    ]) ?? ["", "", ""];

    const flags =
      ps.BUTTON_TITLE_IS_STRING * ps.BUTTON_POS_0 +
      ps.BUTTON_TITLE_CANCEL * ps.BUTTON_POS_1;
    const checkboxLabel =
      aCloseTabs === this.closingTabsEnum.ALL ? checkbox : null;
    const buttonPressed = ps.confirmEx(
      this.window,
      title,
      null,
      flags,
      button,
      null,
      null,
      checkboxLabel,
      warnOnClose
    );

    const reallyClose = buttonPressed === 0;

    if (reallyClose && !warnOnClose.value && aCloseTabs === this.closingTabsEnum.ALL) {
      Services.prefs?.setBoolPref?.(pref, false);
    }

    return reallyClose;
  },

  /**
   * Opens a new tab on middle-click of a new-tab button, unless the button
   * is disabled.
   */
  handleNewTabMiddleClick(node: any, event: Event) {
    if (node?.getAttribute?.("disabled") === "true") {
      return;
    }

    if (event.button === 1) {
      (this.window as any).BrowserCommands?.openTab?.({ event });
      event.stopPropagation();
      event.preventDefault();
    }
  },

  /**
   * Returns all unpinned tabs that share the same URL as `tab`, excluding
   * `tab` itself.
   */
  getDuplicateTabsToClose(tab: MozTabbrowserTab): any[] {
    const uri = (tab as any).linkedBrowser?.currentURI;
    if (!uri) return [];
    
    return this.tabs.filter((t: any) => {
      if (t === tab || t.pinned) return false;
      try {
        return t.linkedBrowser?.currentURI?.equals?.(uri);
      } catch (_) {
        return false;
      }
    });
  },

  /**
   * Returns all unpinned duplicate tabs across the window, keeping only the
   * first-encountered tab for each URL.
   */
  getAllDuplicateTabsToClose(): any[] {
    const seenURIs = new Set();
    const duplicates: any[] = [];

    for (const tab of this.tabs) {
      if ((tab as any).pinned) continue;
      try {
        const uri = (tab as any).linkedBrowser?.currentURI;
        if (!uri) continue;
        const uriSpec = uri.spec;
        if (seenURIs.has(uriSpec)) {
          duplicates.push(tab);
        } else {
          seenURIs.add(uriSpec);
        }
      } catch (_) { /* */ }
    }

    return duplicates;
  },

  /**
   * Closes all unpinned duplicate tabs that share the same URL as `tab`.
   */
  removeDuplicateTabs(tab: MozTabbrowserTab, options?: any) {
    const duplicates = this.getDuplicateTabsToClose(tab);
    if (duplicates.length) {
      this.removeTabs(duplicates, options);
    }
  },

  /**
   * Closes all duplicate tabs across the window, keeping one tab per URL.
   */
  removeAllDuplicateTabs() {
    const duplicates = this.getAllDuplicateTabsToClose();
    if (duplicates.length) {
      this.removeTabs(duplicates);
    }
  },

  _removeDuplicateTabs(anchorElement: any, tabs: MozTabbrowserTab[], aCloseTabs: number, options?: any) {
    if (!this.warnAboutClosingTabs(tabs.length, aCloseTabs)) {
      return;
    }
    this.removeTabs(tabs, options);
  },

  /**
   * Resets the map that tracks opener relationships between tabs, clearing
   * all "last related tab" associations.
   */
  clearRelatedTabs() {
    this._lastRelatedTabMap = new WeakMap();
  },

  /**
   * Returns `true` if `element` is a tabbrowser tab element.
   */
  isTab(element: any): boolean {
    return element?.localName === "tab" || element?.tagName === "tab" || 
           element?.classList?.contains?.("tabbrowser-tab");
  },

  /**
   * Returns `true` if `element` is a tab group container element.
   */
  isTabGroup(element: any): boolean {
    return element?.localName === "tab-group" || element?.classList?.contains?.("tab-group");
  },

  /**
   * Returns `true` if `element` is a tab group label element.
   */
  isTabGroupLabel(element: any): boolean {
    return element?.localName === "tab-group-label" || 
           element?.classList?.contains?.("tab-group-label");
  },

  /**
   * Triggers async l10n translation of the tab context menu (`#tabContextMenu`).
   */
  translateTabContextMenu() {
    // Translate context menu items for tabs
    try {
      (this.window.document as any).l10n?.translateFragment?.(
        this.window.document.getElementById("tabContextMenu")
      );
    } catch (_) { /* */ }
  },

  /**
   * Fires a `TabRefreshBlocked` event on the tab associated with `browser`
   * when a page refresh has been blocked.
   */
  refreshBlocked(actor: any, browser: XULBrowserElement, data: any) {
    // Handle blocked refreshes
    try {
      const tab = this.getTabForBrowser(browser);
      if (tab) {
        dispatch(tab, "TabRefreshBlocked", data);
      }
    } catch (_) { /* */ }
  },

  _hasBeforeUnload(tab: MozTabbrowserTab): boolean {
    try {
      const browser = (tab as any).linkedBrowser;
      if (!browser) return false;
      return browser.permitUnload?.()?.permitUnload === false;
    } catch (_) {
      return false;
    }
  },

  _getTriggeringPrincipalFromHistory(browser: XULBrowserElement): any {
    try {
      const sh = browser?.sessionHistory;
      if (!sh) return null;
      const entry = sh.legacySHistory?.getEntryAtIndex?.(sh.index);
      return entry?.triggeringPrincipal ?? null;
    } catch (_) {
      return null;
    }
  },

  /**
   * Switches `browser` to the remote type required to load `url`, returning
   * `true` when the remoteness was changed.
   *
   * @returns `false` when the browser already has the correct remote type or on error.
   */
  updateBrowserRemotenessByURL(browser: XULBrowserElement, url: string, options: any = {}): boolean {
    try {
      const currentRemoteType = browser.remoteType;
      const userContextId = browser.getAttribute?.("usercontextid") || 0;
      const oa = E10SUtils.predictOriginAttributes?.({ window: this.window, userContextId });
      const remoteType = E10SUtils.getRemoteTypeForURI?.(
        url,
        gMultiProcessBrowser,
        gFissionBrowser,
        options.remoteType ?? E10SUtils.DEFAULT_REMOTE_TYPE,
        null,
        oa
      );

      if (currentRemoteType === remoteType) {
        return false;
      }

      return this.updateBrowserRemoteness(browser, { remoteType, ...options });
    } catch (_) {
      return false;
    }
  },
};
