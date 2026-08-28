// SPDX-License-Identifier: MPL-2.0

/**
 * Per-window entry point, registered in chrome.manifest as
 *
 *   category browser-window-domcontentloaded
 *     resource://noraneko/modules/NoranekoWindow.sys.mjs NoranekoWindow.onDOMContentLoaded
 *
 * Firefox's browser-init.js calls this right after `gBrowser` is created and
 * before the rest of window startup (see browser/docs/BrowserStartup.md).
 * We load the chrome bundle into the window and hand off to its start().
 */

const CORE_URL = "chrome://noraneko/content/core.js";

export const NoranekoWindow = {
  onDOMContentLoaded(window: Window & { noraneko?: { start(): Promise<void> } }): void {
    Services.scriptloader.loadSubScript(CORE_URL, window);
    const start = window.noraneko?.start;
    if (typeof start !== "function") {
      console.error(`[noraneko] ${CORE_URL} did not expose window.noraneko.start`);
      return;
    }
    start().catch((e: unknown) => console.error("[noraneko] start failed:", e));
  },
};
