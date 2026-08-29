// SPDX-License-Identifier: MPL-2.0
/**
 * Shared helpers used by every TabbrowserCompat module.
 * Keeping them here avoids circular imports between the main class file
 * and the per-section module files.
 */

import { appState, send } from "../state/store.ts";
import type { TabId } from "../types/TabState.ts";
import { DOMRegistry } from "./DOMRegistry.ts";

// ... (existing resolveTabId, dispatch)

export function createTabStub(id: TabId): any {
  const getTabEl = () => DOMRegistry.getTab(id);
  const state = () => appState.value.tabs[id];

  return {
    _tabId: id,
    get linkedBrowser() { return DOMRegistry.getBrowser(id); },
    get permanentKey() { return state()?.permanentKey ?? DOMRegistry.getBrowser(id)?.permanentKey ?? {}; },
    set permanentKey(v: any) { 
      const b = DOMRegistry.getBrowser(id);
      if (b) b.permanentKey = v;
      send({ type: "SET_PERMANENT_KEY", tabId: id, permanentKey: v });
    },
    // Attribute proxies
    getAttribute: (n: string) => getTabEl()?.getAttribute?.(n) ?? null,
    setAttribute: (n: string, v: any) => getTabEl()?.setAttribute?.(n, v),
    removeAttribute: (n: string) => getTabEl()?.removeAttribute?.(n),
    hasAttribute: (n: string) => getTabEl()?.hasAttribute?.(n) ?? false,
    toggleAttribute: (n: string, force?: boolean) => getTabEl()?.toggleAttribute?.(n, force),
    dispatchEvent: (e: Event) => getTabEl()?.dispatchEvent?.(e) ?? false,
    // Standard state tracking
    get closing() { return state()?.isClosing ?? false; },
    get pinned() { return state()?.isPinned ?? false; },
    get hidden() { return state()?.isHidden ?? false; },
    get selected() { return state()?.isSelected ?? false; },
    get multiselected() { return state()?.isMultiSelected ?? false; },
    get label() { return state()?.label ?? ""; },
    get _tPos() { return appState.value.tabOrder.indexOf(id); },
    // Loading & progress
    get busy() { return state()?.isBusy ?? false; },
    get progress() { const b = DOMRegistry.getBrowser(id) as any; return (b?.webProgress?.progress) ?? 0; },
    // Audio / media state
    get soundPlaying() { return state()?.soundPlaying ?? false; },
    get audioMuted() { return state()?.isMuted ?? false; },
    get muteReason() { return (DOMRegistry.getBrowser(id) as any)?.muteReason ?? null; },
    get _sharingState() { return state()?.sharingState ?? { camera: false, microphone: false, screen: false }; },
    // Findbar support
    get _findBar() { return (getTabEl() as any)?._findBar ?? null; },
    set _findBar(v: any) { const el = getTabEl() as any; if (el) el._findBar = v; },
    get _pendingFindBar() { return (getTabEl() as any)?._pendingFindBar ?? null; },
    set _pendingFindBar(v: any) { const el = getTabEl() as any; if (el) el._pendingFindBar = v; },
    // Related tab lineage
    get openerTab() { const tid = state()?.openerTabId ?? state()?.ownerTabId; return tid ? DOMRegistry.getTab(tid) ?? null : null; },
    get successor() { const tid = state()?.successorTabId; return tid ? DOMRegistry.getTab(tid) ?? null : null; },
    
    get linkedPanel() { return (DOMRegistry.getBrowser(id)?.parentNode?.parentNode as Element | null | undefined)?.id || null; },
    get userContextId() { return state()?.userContextId ?? 0; },
    get _fullyOpen() { return (getTabEl() as any)?._fullyOpen ?? true; },
    set _fullyOpen(v: boolean) { const el = getTabEl() as any; if (el) el._fullyOpen = v; },
    get owner() { return (getTabEl() as any)?.owner ?? null; },
    set owner(v: any) { const el = getTabEl() as any; if (el) el.owner = v; },
    get _labelIsContentTitle() { return (getTabEl() as any)?._labelIsContentTitle ?? false; },
    set _labelIsContentTitle(v: boolean) { const el = getTabEl() as any; if (el) el._labelIsContentTitle = v; },
    get _fullLabel() { return (getTabEl() as any)?._fullLabel ?? ""; },
    set _fullLabel(v: string) { const el = getTabEl() as any; if (el) el._fullLabel = v; },
    get group() { const gid = state()?.groupId; return gid ? appState.value.groups[gid] ?? null : null; },
    get attention() { return getTabEl()?.hasAttribute?.("attention") ?? false; },
    set attention(v: boolean) { const el = getTabEl(); if (v) el?.setAttribute?.("attention", "true"); else el?.removeAttribute?.("attention"); },
    get isEmpty() { const t = state(); return !t?.label && (!t?.uri || t.uri === "about:blank"); },
  };
}

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
