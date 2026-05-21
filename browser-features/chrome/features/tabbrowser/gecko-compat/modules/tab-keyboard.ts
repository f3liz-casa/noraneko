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
  }
}

export const methods: Partial<TabbrowserCompat> & ThisType<TabbrowserCompat> = {
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
};
