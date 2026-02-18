// SPDX-License-Identifier: MPL-2.0
/**
 * Shared helpers used by every TabbrowserCompat module.
 * Keeping them here avoids circular imports between the main class file
 * and the per-section module files.
 */

import { orderedTabs, selectedTab as selectedTabSignal, setSelectedTab } from "../state/store.ts";
import type { TabId } from "../types/TabState.ts";

// ---------------------------------------------------------------------------
// resolveTabId — accepts a DOM tab element, a tab state object, a raw ID
//   string, or null/undefined and returns the canonical TabId or null.
// ---------------------------------------------------------------------------
export function resolveTabId(tab: any): TabId | null {
  if (!tab) return null;
  if (typeof tab === "string") return tab;
  return tab._tabId ?? tab.id ?? null;
}

// ---------------------------------------------------------------------------
// dispatch — fire a CustomEvent (bubbling) on a DOM target.  Swallows any
//   exceptions so callers never have to guard against missing elements.
// ---------------------------------------------------------------------------
export function dispatch(target: EventTarget | null, name: string, detail?: any): void {
  if (!target) return;
  try {
    target.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
  } catch (_) { /* swallow */ }
}

// ---------------------------------------------------------------------------
// advanceSelectedTab — move tab selection forward/backward by `delta`,
//   optionally wrapping around the ends.  Used by tabContainer and
//   keyboard-navigation fallbacks.
// ---------------------------------------------------------------------------
export function advanceSelectedTab(delta: number, wrap = false): void {
  const tabs = orderedTabs.value;
  const sel = selectedTabSignal.value;
  if (!sel || !tabs.length) return;
  const idx = tabs.findIndex(t => t.id === sel.id);
  if (idx === -1) return;
  let next = idx + delta;
  if (wrap) next = ((next % tabs.length) + tabs.length) % tabs.length;
  else if (next < 0 || next >= tabs.length) return;
  setSelectedTab(tabs[next].id);
}
