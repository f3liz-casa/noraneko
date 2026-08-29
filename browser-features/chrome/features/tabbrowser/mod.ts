// SPDX-License-Identifier: MPL-2.0

/**
 * Tabbrowser Feature Module
 *
 * Re-implementation of the core browser tabs system using Data-Oriented Programming.
 *
 * Structure:
 * - gecko-compat/: gBrowser, ported from tabbrowser.js; the DOM is the truth
 * - state/:        a read-only mirror of the strip, rebuilt from its events
 * - types/:        what the mirror reports
 * - ui/:           Preact components that read the mirror
 */

// Export Types
export * from "./types/TabState.ts";

// Export the read-only mirror of the strip
export { appState, selectedTab, orderedTabs, allGroups, tabById } from "./state/store.ts";

// Export UI Components
export { Tab } from "./ui/Tab.tsx";
export { TabStrip } from "./ui/TabStrip.tsx";

// Export gecko-compat layer
export { initCompat } from "./gecko-compat/TabbrowserCompat.ts";
import { initCompat as _initCompat } from "./gecko-compat/TabbrowserCompat.ts";
import { appState, attachMirror, tabById } from "./state/store.ts";
import { TabStrip } from "./ui/TabStrip.tsx";
import { render } from "preact";
import { h } from "#libs/preact-xul/index.ts";

// ============================================================================
// Module lifecycle hook — called by loader/lifecycle.ts before SessionStore.
// At this point gBrowser already exists (created in onDOMContentLoaded).
// initCompat overrides window.gBrowser with TabbrowserCompat via
// Object.defineProperty, replacing the API layer while keeping the existing
// DOM structure in place.
// ============================================================================
export function initBeforeSessionStoreInit() {
  // Skip if the before-tabbrowser category hook already installed our compat.
  if ((window as any).__noranekoTabbrowserInstalled) return;
  console.debug(
    `[noraneko/tabbrowser] install: readyState=${document.readyState} tabs=${!!document.getElementById("tabbrowser-tabs")} gBrowser=${(window as any).gBrowser?.constructor?.name}`,
  );
  _initCompat(window as any);
  (window as any).__noranekoTabbrowserInstalled = true;
  attachMirror((window as any).gBrowser);
  // A hand on the mirror for tests and for anything living outside the bundle.
  (window as any).noraneko.tabbrowser = {
    appState,
    tabById,
    renderTabStrip: (into: Element) => render(h(TabStrip, null), into),
  };

  // Diagnostic: report who owns gBrowser once Firefox finishes window startup.
  const topic = "browser-delayed-startup-finished";
  const observer = (subject: unknown) => {
    if (subject !== window) return;
    Services.obs.removeObserver(observer, topic);
    const g = (window as any).gBrowser;
    console.debug(
      `[noraneko/tabbrowser] after startup: gBrowser=${g?.constructor?.name} tabs=${g?.tabs?.length} isCompat=${!!g?._bindDomElements}`,
    );
  };
  Services.obs.addObserver(observer, topic);
}
