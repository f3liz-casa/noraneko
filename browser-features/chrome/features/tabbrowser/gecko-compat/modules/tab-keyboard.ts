// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L7806~L7877
// Section: Keyboard Navigation — "how does keyboard navigation in the tab strip work?"

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { appState } from "../../state/store.ts";
import * as TabOps from "../../ops/tab-ops.ts";
import { resolveTabId, dispatch } from "../compat-helpers.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    toggleCaretBrowsing(): void;
    moveTabForward(): void;
    moveTabBackward(): void;
    selectTabAtIndex(index: number, event?: Event): void;
  }
}

export const methods = {
  /**
   * Toggles caret browsing mode, showing a confirmation prompt the first time
   * if the warning preference has not been permanently dismissed.
   */
  // upstream: toggleCaretBrowsing@568244e5d2 FIREFOX_143_0_1_RELEASE
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

  // upstream: _maybeRequestReplyFromRemoteContent@dcbc1a53a8 FIREFOX_143_0_1_RELEASE
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
   * Select the visible tab at `index`; negative counts from the end, and out
   * of range clamps (Ctrl+1..9 and friends).
   */
  // upstream: selectTabAtIndex@20748e0faf FIREFOX_143_0_1_RELEASE
  selectTabAtIndex(index: number, event?: Event) {
    const tabs = this.visibleTabs;

    // count backwards for index < 0
    if (index < 0) {
      index += tabs.length;
      // clamp at index 0 if still negative.
      if (index < 0) {
        index = 0;
      }
    } else if (index >= tabs.length) {
      // clamp at right-most tab if out of range.
      index = tabs.length - 1;
    }

    this.selectedTab = tabs[index];

    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
  },

  /**
   * Moves the currently selected tab one position forward in the tab order.
   */
  // upstream: moveTabForward@d083ccd217 FIREFOX_143_0_1_RELEASE
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
  // upstream: moveTabBackward@8b778cc537 FIREFOX_143_0_1_RELEASE
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
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
