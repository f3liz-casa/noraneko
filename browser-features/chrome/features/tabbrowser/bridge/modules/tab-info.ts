// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L4163~L4632
// Section: Tab Info — "what information can be queried about tabs?"

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    getTabPids(tab: MozTabbrowserTab): number[];
    getTabTooltip(tab: MozTabbrowserTab, includeLabel?: boolean): string;
    createTooltip(event: Event): void;
    warnAboutClosingTabs(tabsToClose: number, aCloseTabs: number): boolean;
    isTab(element: any): boolean;
    isTabGroup(element: any): boolean;
    isTabGroupLabel(element: any): boolean;
    translateTabContextMenu(): void;
  }
}

export const methods: Partial<TabbrowserCompat> & ThisType<TabbrowserCompat> = {
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
};
