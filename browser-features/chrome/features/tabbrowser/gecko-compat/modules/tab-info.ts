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

export const methods = {
  /**
   * Returns the content-process PIDs associated with the tab's browser,
   * including any remote subframe process PIDs sorted in ascending order.
   *
   * @returns An empty array when the tab has no linked browser or PIDs are unavailable.
   */
  // upstream: getTabPids@ac26a85b24 FIREFOX_143_0_1_RELEASE
  getTabPids(tab: MozTabbrowserTab): number[] {
    if (!tab.linkedBrowser) {
      return [];
    }
    // Get PIDs of content process and remote subframe processes
    const [contentPid, ...framePids] = E10SUtils.getBrowserPids(
      tab.linkedBrowser,
      gFissionBrowser
    );
    const pids = contentPid ? [contentPid] : [];
    return pids.concat(framePids.sort());
  },

  /**
   * Returns the tooltip string displayed when hovering over `tab`.
   *
   * Combines the tab label, optional debug info (PID, activeness), container
   * or tab-group context, and audio-playing status, joined by newlines.
   *
   * @param includeLabel - When `false`, omits the tab title from the result.
   */
  // upstream: getTabTooltip@6a9ce9a3fb FIREFOX_143_0_1_RELEASE
  getTabTooltip(tab: MozTabbrowserTab, includeLabel = true): string {
    const labelArray: string[] = [];

    if (includeLabel) {
      labelArray.push(tab._fullLabel || tab.getAttribute("label")!);
    }

    if (this.showPidAndActiveness) {
      const pids = this.getTabPids(tab);
      const debugStringArray: string[] = [];

      if (pids.length) {
        const pidLabel = pids.length > 1 ? "pids" : "pid";
        debugStringArray.push(`(${pidLabel} ${pids.join(", ")})`);
      }

      if (tab.linkedBrowser.docShellIsActive) {
        debugStringArray.push("[A]");
      }

      if (this.SponsorProtection.isProtectedBrowser(tab.linkedBrowser)) {
        debugStringArray.push("[S]");
      }

      if (debugStringArray.length) {
        labelArray.push(debugStringArray.join(" "));
      }
    }

    // Add container and tab group info
    const containerName = tab.userContextId
      ? ContextualIdentityService.getUserContextLabel(tab.userContextId)
      : "";

    const tabGroupName = this._isFirstOrLastInTabGroup(tab)
      ? tab.group!.name ||
        this.tabLocalization.formatValueSync("tab-group-name-default")
      : "";

    if (containerName || tabGroupName) {
      let tabContextString;
      if (containerName && tabGroupName) {
        tabContextString = this.tabLocalization.formatValueSync(
          "tabbrowser-tab-tooltip-tab-group-container",
          { tabGroupName, containerName }
        );
      } else if (tabGroupName) {
        tabContextString = this.tabLocalization.formatValueSync(
          "tabbrowser-tab-tooltip-tab-group",
          { tabGroupName }
        );
      } else {
        tabContextString = this.tabLocalization.formatValueSync(
          "tabbrowser-tab-tooltip-container",
          { containerName }
        );
      }
      labelArray.push(tabContextString);
    }

    if (tab.soundPlaying) {
      const audioPlayingString = this.tabLocalization.formatValueSync(
        "tabbrowser-tab-audio-playing-description"
      );
      labelArray.push(audioPlayingString);
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
  // upstream: createTooltip@99e0bdad07 FIREFOX_143_0_1_RELEASE
  createTooltip(event: Event) {
    event.stopPropagation();
    const trigger = (event.target as XULPopupElement).triggerNode as Element | null;
    let tab: any = trigger?.closest("tab");
    if (!tab) {
      if ((trigger?.getRootNode() as ShadowRoot | undefined)?.host?.closest("tab")) {
        // Check if triggerNode is within shadowRoot
        tab = (trigger?.getRootNode() as ShadowRoot).host.closest("tab");
      } else {
        event.preventDefault();
        return;
      }
    }

    const tooltip = event.target as XULPopupElement;
    tooltip.removeAttribute("data-l10n-id");

    const tabCount = this.selectedTabs.includes(tab)
      ? this.selectedTabs.length
      : 1;

    if (tab._overPlayingIcon || tab._overAudioButton) {
      let l10nId;
      const l10nArgs: any = { tabCount };
      if (tab.selected) {
        l10nId = tab.linkedBrowser.audioMuted
          ? "tabbrowser-unmute-tab-audio-tooltip"
          : "tabbrowser-mute-tab-audio-tooltip";
        const keyElem = this.window.document.getElementById("key_toggleMute");
        l10nArgs.shortcut = ShortcutUtils.prettifyShortcut(keyElem);
      } else if (tab.hasAttribute("activemedia-blocked")) {
        l10nId = "tabbrowser-unblock-tab-audio-tooltip";
      } else {
        l10nId = tab.linkedBrowser.audioMuted
          ? "tabbrowser-unmute-tab-audio-background-tooltip"
          : "tabbrowser-mute-tab-audio-background-tooltip";
      }
      tooltip.label = "";
      this.window.document.l10n!.setAttributes(tooltip, l10nId, l10nArgs);
    } else {
      // Prevent tooltip if card preview is enabled
      if (this._showTabCardPreview) {
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
  // upstream: warnAboutClosingTabs@7bf1f813eb FIREFOX_143_0_1_RELEASE
  warnAboutClosingTabs(tabsToClose: number, aCloseTabs: number): boolean {
    // Handle duplicate tabs warning
    const shownDupeDialogPref =
      "browser.tabs.haveShownCloseAllDuplicateTabsWarning";
    const ps = Services.prompt;
    
    if (
      aCloseTabs === this.closingTabsEnum.ALL_DUPLICATES &&
      !Services.prefs.getBoolPref(shownDupeDialogPref, false)
    ) {
      Services.prefs.setBoolPref(shownDupeDialogPref, true);
      this.window.focus();

      const [title, text, button] = this.tabLocalization.formatValuesSync([
        { id: "tabbrowser-confirm-close-all-duplicate-tabs-title" },
        { id: "tabbrowser-confirm-close-all-duplicate-tabs-text" },
        { id: "tabbrowser-confirm-close-all-duplicate-tabs-button-closetabs" },
      ]);

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
    const shouldPrompt = Services.prefs.getBoolPref(pref);
    if (!shouldPrompt) {
      return true;
    }

    const maxTabsUndo = Services.prefs.getIntPref(
      "browser.sessionstore.max_tabs_undo"
    );
    if (
      aCloseTabs !== this.closingTabsEnum.ALL &&
      tabsToClose <= maxTabsUndo
    ) {
      return true;
    }

    // Replace any open dialog
    (this.window as any).gDialogBox.replaceDialogIfOpen();

    const warnOnClose = { value: true };
    this.window.focus();

    const [title, button, checkbox] = this.tabLocalization.formatValuesSync([
      {
        id: "tabbrowser-confirm-close-tabs-title",
        args: { tabCount: tabsToClose },
      },
      { id: "tabbrowser-confirm-close-tabs-button" },
      { id: "tabbrowser-ask-close-tabs-checkbox" },
    ]);

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
      Services.prefs.setBoolPref(pref, false);
    }

    return reallyClose;
  },

  /**
   * Returns `true` if `element` is a tabbrowser tab element.
   */
  // upstream: isTab@352ce2d712 FIREFOX_143_0_1_RELEASE
  isTab(element: any): boolean {
    return element?.tagName === "tab";
  },

  /**
   * Returns `true` if `element` is a tab group container element.
   */
  // upstream: isTabGroup@b6fe1a555d FIREFOX_143_0_1_RELEASE
  isTabGroup(element: any): boolean {
    return element?.tagName === "tab-group";
  },

  /**
   * Returns `true` if `element` is a tab group label element.
   */
  // upstream: isTabGroupLabel@cbf0bdad41 FIREFOX_143_0_1_RELEASE
  isTabGroupLabel(element: any): boolean {
    return !!element?.classList?.contains("tab-group-label");
  },

  /**
   * Triggers async l10n translation of the tab context menu (`#tabContextMenu`).
   */
  // upstream: translateTabContextMenu@179edd9812 FIREFOX_143_0_1_RELEASE
  translateTabContextMenu() {
    // Translate context menu items for tabs
    try {
      (this.window.document as any).l10n?.translateFragment?.(
        this.window.document.getElementById("tabContextMenu")
      );
    } catch (_) { /* */ }
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
