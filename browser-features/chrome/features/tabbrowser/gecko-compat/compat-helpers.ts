// SPDX-License-Identifier: MPL-2.0
/**
 * Shared helpers used by every TabbrowserCompat module.
 * Keeping them here avoids circular imports between the main class file
 * and the per-section module files.
 */

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
