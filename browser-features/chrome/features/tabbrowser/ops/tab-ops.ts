// SPDX-License-Identifier: MPL-2.0

/**
 * Tab Operations - Pure Logic (Refactored with Immer)
 */

import { produce, type Draft } from "immer";
import type { AppState, TabData, TabId } from "../types/TabState.ts";

const SHORTEN_URL_REGEX = /^[^:]+:\/\/(?:www\.)?/;

export const createTab = (id: TabId, uri: string, options: Partial<TabData> = {}): TabData => ({
  id, uri,
  index: -1,
  title: "New Tab",
  label: "New Tab",
  isPinned: false,
  isHidden: false,
  isSelected: false,
  isMultiSelected: false,
  isBusy: false,
  isMuted: false,
  isCrashed: false,
  isLazy: false,
  isDiscarded: false,
  isClosing: false,
  soundPlaying: false,
  soundPlayingScheduledRemoval: false,
  activeMediaBlocked: false,
  userContextId: 0,
  permanentKey: null,
  lastAccessed: Date.now(),
  createdTime: Date.now(),
  lastSeenActive: Date.now(),
  labelIsContentTitle: false,
  labelDirection: "ltr",
  predecessorTabIds: [],
  sharingState: { camera: false, microphone: false, screen: false },
  ...options,
});

const updateTabIndices = (draft: Draft<AppState>) => {
  draft.tabOrder.forEach((id, idx) => {
    if (draft.tabs[id]) draft.tabs[id].index = idx;
  });
};

export const addTab = produce((draft: Draft<AppState>, tab: TabData, index?: number) => {
  draft.tabs[tab.id] = tab;
  if (index !== undefined && index >= 0 && index <= draft.tabOrder.length) {
    draft.tabOrder.splice(index, 0, tab.id);
  } else {
    draft.tabOrder.push(tab.id);
  }
  updateTabIndices(draft);
});

export const removeTab = produce((draft: Draft<AppState>, tabId: TabId) => {
  if (!draft.tabs[tabId]) return;
  // Decide where the selection goes while the closing tab is still here;
  // findTabToBlurTo starts from that tab's own record.
  const blurTo = draft.selectedTabId === tabId ? findTabToBlurTo(draft as any, tabId, [tabId]) : null;
  draft.tabOrder = draft.tabOrder.filter(id => id !== tabId);
  delete draft.tabs[tabId];

  if (draft.selectedTabId === tabId) {
    draft.selectedTabId = blurTo;
    if (blurTo && draft.tabs[blurTo]) draft.tabs[blurTo].isSelected = true;
  }
  updateTabIndices(draft);
});

export const beginCloseTab = produce((draft: Draft<AppState>, tabId: TabId) => {
  const tab = draft.tabs[tabId];
  if (tab && !tab.isClosing) {
    Object.assign(tab, { isClosing: true, isBusy: false, isMuted: true });
  }
});

export const endCloseTab = removeTab;

export const discardTab = produce((draft: Draft<AppState>, tabId: TabId) => {
  const tab = draft.tabs[tabId];
  if (tab) Object.assign(tab, { isDiscarded: true, isBusy: false, isMuted: false });
});

export const setIcon = produce((draft: Draft<AppState>, tabId: TabId, iconUrl: string) => {
  if (draft.tabs[tabId]) draft.tabs[tabId].iconUrl = iconUrl;
});

export const updateActivity = produce((draft: Draft<AppState>, tabId: TabId) => {
  const tab = draft.tabs[tabId];
  if (tab) Object.assign(tab, { lastAccessed: Date.now(), lastSeenActive: Date.now() });
});

export const pinTab = produce((draft: Draft<AppState>, tabId: TabId) => {
  const tab = draft.tabs[tabId];
  if (!tab || tab.isPinned) return;
  tab.isPinned = true;
  draft.tabOrder = draft.tabOrder.filter(id => id !== tabId);
  const lastPinnedIdx = draft.tabOrder.findLastIndex(id => draft.tabs[id].isPinned);
  draft.tabOrder.splice(lastPinnedIdx + 1, 0, tabId);
  updateTabIndices(draft);
});

export const unpinTab = produce((draft: Draft<AppState>, tabId: TabId) => {
  const tab = draft.tabs[tabId];
  if (!tab || !tab.isPinned) return;
  tab.isPinned = false;
  draft.tabOrder = draft.tabOrder.filter(id => id !== tabId);
  const lastPinnedIdx = draft.tabOrder.findLastIndex(id => draft.tabs[id].isPinned);
  draft.tabOrder.splice(lastPinnedIdx + 1, 0, tabId);
  updateTabIndices(draft);
});

export const updateTabLabel = produce((draft: Draft<AppState>, tabId: TabId, params: { label: string; isContentTitle: boolean; direction: "ltr" | "rtl" }) => {
  const tab = draft.tabs[tabId];
  if (!tab) return;
  Object.assign(tab, {
    label: params.isContentTitle ? params.label : params.label.replace(SHORTEN_URL_REGEX, ""),
    labelIsContentTitle: params.isContentTitle,
    labelDirection: params.direction,
  });
});

export const updateSharingState = produce((draft: Draft<AppState>, tabId: TabId, sharing: Partial<TabData["sharingState"]>) => {
  const tab = draft.tabs[tabId];
  if (tab) Object.assign(tab.sharingState, sharing);
});

const _moveTabMutation = (draft: Draft<AppState>, tabId: TabId, newIndex: number) => {
  const oldIndex = draft.tabOrder.indexOf(tabId);
  if (oldIndex === -1 || oldIndex === newIndex) return;
  draft.tabOrder.splice(oldIndex, 1);
  draft.tabOrder.splice(newIndex, 0, tabId);
  updateTabIndices(draft);
};

export const moveTab = produce(_moveTabMutation);

export const moveTabTo = produce((draft: Draft<AppState>, tabId: TabId, newIndex: number) => {
  const tab = draft.tabs[tabId];
  if (!tab) return;
  const pinnedCount = draft.tabOrder.filter(id => draft.tabs[id].isPinned).length;
  const finalIdx = tab.isPinned ? Math.min(newIndex, pinnedCount - 1) : Math.max(newIndex, pinnedCount);
  _moveTabMutation(draft, tabId, finalIdx);
});

export const moveTabRelative = produce((draft: Draft<AppState>, tabId: TabId, targetId: TabId, position: "before" | "after") => {
  const oldIdx = draft.tabOrder.indexOf(tabId);
  let targetIdx = draft.tabOrder.indexOf(targetId);
  if (oldIdx === -1 || targetIdx === -1) return;
  draft.tabOrder.splice(oldIdx, 1);
  targetIdx = draft.tabOrder.indexOf(targetId);
  _moveTabMutation(draft, tabId, position === "before" ? targetIdx : targetIdx + 1);
});

export const setTabVisibility = produce((draft: Draft<AppState>, tabId: TabId, isVisible: boolean) => {
  const tab = draft.tabs[tabId];
  if (tab && (isVisible || (!tab.isSelected && !Object.values(tab.sharingState).some(Boolean)))) {
    tab.isHidden = !isVisible;
  }
});

export function findTabToBlurTo(state: AppState, tabId: TabId, excludeIds: TabId[] = []): TabId | null {
  const tab = state.tabs[tabId];
  if (!tab || !tab.isSelected) return null;
  const excludeSet = new Set(excludeIds);
  if (tab.successorTabId && !excludeSet.has(tab.successorTabId)) return tab.successorTabId;
  if (tab.ownerTabId && !excludeSet.has(tab.ownerTabId)) {
    const owner = state.tabs[tab.ownerTabId];
    if (owner && !owner.isHidden) return tab.ownerTabId;
  }
  const visibleTabs = state.tabOrder.filter(id => !state.tabs[id].isHidden && !excludeSet.has(id));
  const currentIndex = state.tabOrder.indexOf(tabId);
  for (let i = currentIndex + 1; i < state.tabOrder.length; i++) {
    const id = state.tabOrder[i];
    if (!state.tabs[id].isHidden && !excludeSet.has(id)) return id;
  }
  for (let i = currentIndex - 1; i >= 0; i--) {
    const id = state.tabOrder[i];
    if (!state.tabs[id].isHidden && !excludeSet.has(id)) return id;
  }
  return visibleTabs[0] || null;
}

export const updateAudioState = produce((draft: Draft<AppState>, tabId: TabId, update: Partial<TabData>) => {
  if (draft.tabs[tabId]) Object.assign(draft.tabs[tabId], update);
});

export const setTabBusy = produce((draft: Draft<AppState>, tabId: TabId, isBusy: boolean) => {
  if (draft.tabs[tabId]) draft.tabs[tabId].isBusy = isBusy;
});

export const updateTabLocation = produce((draft: Draft<AppState>, tabId: TabId, uri: string, options: { isSameDocument?: boolean } = {}) => {
  const tab = draft.tabs[tabId];
  if (tab) {
    tab.uri = uri;
    if (!options.isSameDocument) {
      Object.assign(tab, { soundPlaying: false, soundPlayingScheduledRemoval: false });
    }
  }
});

export const setMultiSelection = produce((draft: Draft<AppState>, tabIds: TabId[], isSelected: boolean) => {
  tabIds.forEach(id => { if (draft.tabs[id]) draft.tabs[id].isMultiSelected = isSelected; });
});

export const clearMultiSelection = produce((draft: Draft<AppState>) => {
  draft.tabOrder.forEach(id => { draft.tabs[id].isMultiSelected = false; });
});

export const duplicateTab = (state: AppState, tabId: TabId): AppState => {
  const source = state.tabs[tabId];
  if (!source) return state;
  const newTab = createTab(crypto.randomUUID(), source.uri, {
    title: source.title, label: source.label, userContextId: source.userContextId,
    groupId: source.groupId, isPinned: source.isPinned,
    labelIsContentTitle: source.labelIsContentTitle, labelDirection: source.labelDirection,
  });
  return addTab(state, newTab, source.index + 1);
};

export const calculateInsertionIndex = (state: AppState, options: { tabIndex?: number; openerTabId?: TabId; isPinned?: boolean; insertAfterCurrent?: boolean; insertRelatedAfterCurrent?: boolean; }): number => {
  if (options.tabIndex !== undefined) return options.tabIndex;
  if (options.isPinned) return state.tabOrder.filter(id => state.tabs[id].isPinned).length;
  if (options.insertRelatedAfterCurrent && options.openerTabId) {
    const idx = state.tabOrder.indexOf(options.openerTabId);
    if (idx !== -1) return idx + 1;
  }
  if (options.insertAfterCurrent && state.selectedTabId) {
    const idx = state.tabOrder.indexOf(state.selectedTabId);
    if (idx !== -1) return idx + 1;
  }
  return state.tabOrder.length;
};

export function getTabsByURI(state: AppState, uris: string[]): TabId[] {
  const uriSet = new Set(uris);
  return state.tabOrder.filter(id => uriSet.has(state.tabs[id].uri));
}
