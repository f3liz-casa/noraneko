// SPDX-License-Identifier: MPL-2.0
//
// A read-only mirror of the tab strip.
//
// The DOM is the truth: tabbrowser.js, tabs.js, SessionStore and every
// other piece of Firefox read and write the <tab> elements directly. This
// module never writes; it listens to the events the strip already fires
// (TabOpen, TabClose, TabSelect, TabMove, ...) and rebuilds a plain data
// snapshot for anything that would rather read data than elements — the
// Preact UI, or a future data-oriented feature.
//
// To act, call gBrowser (addTab, removeTab, selectedTab = ...); the mirror
// hears about it like everyone else.

import { signal, computed } from "@preact/signals";
import type { AppState, TabData, TabGroupData, TabId, GroupId } from "../types/TabState.ts";

const EMPTY: AppState = {
  tabs: {},
  groups: {},
  splitViews: {},
  tabOrder: [],
  selectedTabId: null,
  activeSplitViewId: null,
};

export const appState = signal<AppState>(EMPTY);

export const selectedTab = computed<TabData | null>(() => {
  const state = appState.value;
  return state.selectedTabId ? state.tabs[state.selectedTabId] ?? null : null;
});

export const orderedTabs = computed<TabData[]>(() => {
  const state = appState.value;
  return state.tabOrder.map((id) => state.tabs[id]).filter(Boolean);
});

export const allGroups = computed<TabGroupData[]>(() => Object.values(appState.value.groups));

// A tab element keeps its id for as long as it lives; the id is ours, the
// element is Firefox's.
const idOf = new WeakMap<object, TabId>();
const elementOf = new Map<TabId, WeakRef<any>>();

function idFor(tab: any): TabId {
  let id = idOf.get(tab);
  if (!id) {
    id = crypto.randomUUID();
    idOf.set(tab, id);
    elementOf.set(id, new WeakRef(tab));
  }
  return id;
}

/** The <tab> element behind a mirrored id, if it is still around. */
export function tabById(id: TabId): any {
  return elementOf.get(id)?.deref() ?? null;
}

// The strip's events that can change what the snapshot would say.
const EVENTS = [
  "TabOpen", "TabClose", "TabSelect", "TabMove", "TabPinned", "TabUnpinned",
  "TabHide", "TabShow", "TabAttrModified", "TabMultiSelect", "TabGrouped",
  "TabUngrouped", "TabGroupCollapse", "TabGroupExpand", "TabGroupCreate",
  "TabGroupRemoved", "TabGroupMoved", "TabSplitViewActivate",
  "TabSplitViewDeactivate", "TabBrowserInserted", "TabBrowserDiscarded",
  "SSTabRestored",
];

function snapshotTab(tab: any, index: number, groupId?: GroupId): TabData {
  const browser = tab.linkedBrowser;
  const webRTC = tab._sharingState?.webRTC ?? {};
  return {
    id: idFor(tab),
    index,
    uri: browser?.currentURI?.spec ?? "about:blank",
    title: browser?.contentTitle ?? "",
    label: tab.label ?? "",
    iconUrl: tab.getAttribute("image") || undefined,
    isPinned: !!tab.pinned,
    isHidden: !!tab.hidden,
    isSelected: !!tab.selected,
    isMultiSelected: !!tab.multiselected,
    isBusy: tab.hasAttribute("busy"),
    isMuted: tab.hasAttribute("muted"),
    isCrashed: tab.hasAttribute("crashed"),
    isDiscarded: !tab.linkedPanel,
    isClosing: !!tab.closing,
    soundPlaying: tab.hasAttribute("soundplaying"),
    soundPlayingScheduledRemoval: tab.hasAttribute("soundplaying-scheduledremoval"),
    activeMediaBlocked: tab.hasAttribute("activemedia-blocked"),
    userContextId: Number(tab.getAttribute("usercontextid")) || 0,
    groupId,
    splitViewId: tab.splitview?.splitViewId,
    ownerTabId: tab.owner ? idFor(tab.owner) : undefined,
    openerTabId: tab.openerTab ? idFor(tab.openerTab) : undefined,
    successorTabId: tab.successor ? idFor(tab.successor) : undefined,
    lastAccessed: tab.lastAccessed ?? 0,
    lastSeenActive: tab.lastSeenActive ?? 0,
    labelIsContentTitle: !!tab._labelIsContentTitle,
    sharingState: { camera: !!webRTC.camera, microphone: !!webRTC.microphone, screen: !!webRTC.screen },
  };
}

function snapshot(gBrowser: any): AppState {
  const tabs: Record<TabId, TabData> = {};
  const tabOrder: TabId[] = [];
  const groups: Record<GroupId, TabGroupData> = {};
  const splitViews: AppState["splitViews"] = {};

  for (const group of gBrowser.tabGroups as any[]) {
    groups[group.id] = {
      id: group.id,
      title: group.label ?? "",
      color: group.color ?? "",
      isCollapsed: !!group.collapsed,
      tabs: group.tabs.map((t: any) => idFor(t)),
    };
  }
  gBrowser.tabs.forEach((tab: any, index: number) => {
    const data = snapshotTab(tab, index, tab.group?.id);
    tabs[data.id] = data;
    tabOrder.push(data.id);
    const sv = tab.splitview;
    if (sv?.splitViewId && !splitViews[sv.splitViewId]) {
      splitViews[sv.splitViewId] = { id: sv.splitViewId, tabs: sv.tabs.map((t: any) => idFor(t)) };
    }
  });

  return {
    tabs,
    groups,
    splitViews,
    tabOrder,
    selectedTabId: gBrowser.selectedTab ? idFor(gBrowser.selectedTab) : null,
    activeSplitViewId: gBrowser.activeSplitView?.splitViewId ?? null,
  };
}

let detach: (() => void) | null = null;

/**
 * Start mirroring `gBrowser`. Every strip event schedules one rebuild per
 * task, so a burst of changes costs one snapshot.
 */
export function attachMirror(gBrowser: any): void {
  detach?.();
  const container = gBrowser.tabContainer;
  let scheduled = false;
  const refresh = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      appState.value = snapshot(gBrowser);
    });
  };
  for (const type of EVENTS) container.addEventListener(type, refresh);
  detach = () => {
    for (const type of EVENTS) container.removeEventListener(type, refresh);
    detach = null;
  };
  appState.value = snapshot(gBrowser);
}

export function detachMirror(): void {
  detach?.();
}
