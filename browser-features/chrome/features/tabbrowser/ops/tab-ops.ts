// SPDX-License-Identifier: MPL-2.0

/**
 * Tab Operations - Pure Logic
 */

import type { AppState, TabData, TabId } from "../types/TabState.ts";

// ... (Existing calculateInsertionIndex, findTabToBlurTo, moveTabRelative, updateAudioState, etc.) ...

/**
 * Tab Duplication Logic (Line 7050)
 */
export function duplicateTab(state: AppState, tabId: TabId): AppState {
  const source = state.tabs[tabId];
  if (!source) return state;

  const newId = crypto.randomUUID();
  const newTab = createTab(newId, source.uri, {
      title: source.title,
      label: source.label,
      userContextId: source.userContextId,
      groupId: source.groupId,
      isPinned: source.isPinned,
      // Metadata
      labelIsContentTitle: source.labelIsContentTitle,
      labelDirection: source.labelDirection,
  });

  return addTab(state, newTab, source.index + 1);
}

// ... (Rest of existing ops) ...

export function createTab(
  id: TabId,
  uri: string,
  options: Partial<TabData> = {},
): TabData {
  const defaults: Omit<TabData, "id" | "uri"> = {
    index: -1,
    title: "New Tab",
    label: "New Tab",
    iconUrl: undefined,
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
    groupId: undefined,
    permanentKey: null,
    lastAccessed: Date.now(),
    createdTime: Date.now(),
    lastSeenActive: Date.now(),
    labelIsContentTitle: false,
    labelDirection: "ltr",
    predecessorTabIds: [],
    sharingState: { camera: false, microphone: false, screen: false },
  };
  return { ...defaults, ...options, id, uri };
}

export function beginCloseTab(state: AppState, tabId: TabId): AppState {
  const tab = state.tabs[tabId];
  if (!tab || tab.isClosing) return state;
  return { ...state, tabs: { ...state.tabs, [tabId]: { ...tab, isClosing: true, isBusy: false, isMuted: true } } };
}

export function endCloseTab(state: AppState, tabId: TabId): AppState {
  return removeTab(state, tabId);
}

export function discardTab(state: AppState, tabId: TabId): AppState {
  const tab = state.tabs[tabId];
  if (!tab) return state;
  return { ...state, tabs: { ...state.tabs, [tabId]: { ...tab, isDiscarded: true, isBusy: false, isMuted: false } } };
}

export function addTab(state: AppState, tab: TabData, index?: number): AppState {
  const newTabs = { ...state.tabs, [tab.id]: tab };
  let newOrder = [...state.tabOrder];
  if (index !== undefined && index >= 0 && index <= newOrder.length) {
    newOrder.splice(index, 0, tab.id);
  } else {
    newOrder.push(tab.id);
  }
  return { ...state, tabs: updateTabIndices(newTabs, newOrder), tabOrder: newOrder };
}

export function removeTab(state: AppState, tabId: TabId): AppState {
  if (!state.tabs[tabId]) return state;
  const { [tabId]: removed, ...remainingTabs } = state.tabs;
  const newOrder = state.tabOrder.filter(id => id !== tabId);
  let newSelectedId = state.selectedTabId;
  if (state.selectedTabId === tabId) {
    newSelectedId = findTabToBlurTo(state, tabId, [tabId]);
  }
  const updatedTabs = updateTabIndices(remainingTabs, newOrder);
  if (newSelectedId && updatedTabs[newSelectedId]) {
      updatedTabs[newSelectedId] = { ...updatedTabs[newSelectedId], isSelected: true };
  }
  return { ...state, tabs: updatedTabs, tabOrder: newOrder, selectedTabId: newSelectedId };
}

export function loadTabs(state: AppState, uris: string[], options: any = {}): AppState {
  let nextState = state;
  let insertionIndex = options.newIndex ?? state.tabOrder.length;
  for (const uri of uris) {
    const id = crypto.randomUUID();
    const tab = createTab(id, uri, { userContextId: options.userContextId });
    nextState = addTab(nextState, tab, insertionIndex++);
  }
  return nextState;
}

export function setIcon(state: AppState, tabId: TabId, iconUrl: string): AppState {
  if (!state.tabs[tabId]) return state;
  return { ...state, tabs: { ...state.tabs, [tabId]: { ...state.tabs[tabId], iconUrl } } };
}

export function updateActivity(state: AppState, tabId: TabId): AppState {
  if (!state.tabs[tabId]) return state;
  return { ...state, tabs: { ...state.tabs, [tabId]: { ...state.tabs[tabId], lastAccessed: Date.now(), lastSeenActive: Date.now() } } };
}

export function pinTab(state: AppState, tabId: TabId): AppState {
  const tab = state.tabs[tabId];
  if (!tab || tab.isPinned) return state;
  const nextTab = { ...tab, isPinned: true };
  const currentOrder = state.tabOrder.filter(id => id !== tabId);
  let lastPinnedIndex = -1;
  currentOrder.forEach((id, idx) => { if (state.tabs[id].isPinned) lastPinnedIndex = idx; });
  currentOrder.splice(lastPinnedIndex + 1, 0, tabId);
  return { ...state, tabs: updateTabIndices({ ...state.tabs, [tabId]: nextTab }, currentOrder), tabOrder: currentOrder };
}

export function unpinTab(state: AppState, tabId: TabId): AppState {
  const tab = state.tabs[tabId];
  if (!tab || !tab.isPinned) return state;
  const nextTab = { ...tab, isPinned: false };
  const currentOrder = state.tabOrder.filter(id => id !== tabId);
  let lastPinnedIndex = -1;
  currentOrder.forEach((id, idx) => { if (state.tabs[id].isPinned) lastPinnedIndex = idx; });
  currentOrder.splice(lastPinnedIndex + 1, 0, tabId);
  return { ...state, tabs: updateTabIndices({ ...state.tabs, [tabId]: nextTab }, currentOrder), tabOrder: currentOrder };
}

export function updateTabLabel(state: AppState, tabId: TabId, params: { label: string; isContentTitle: boolean; direction: "ltr" | "rtl" }): AppState {
  const tab = state.tabs[tabId];
  if (!tab) return state;
  let finalLabel = params.label;
  if (!params.isContentTitle) finalLabel = finalLabel.replace(SHORTEN_URL_REGEX, "");
  return { ...state, tabs: { ...state.tabs, [tabId]: { ...tab, label: finalLabel, labelIsContentTitle: params.isContentTitle, labelDirection: params.direction } } };
}

export function updateSharingState(state: AppState, tabId: TabId, sharing: Partial<TabData["sharingState"]>): AppState {
  const tab = state.tabs[tabId];
  if (!tab) return state;
  return { ...state, tabs: { ...state.tabs, [tabId]: { ...tab, sharingState: { ...tab.sharingState, ...sharing } } } };
}

function updateTabIndices(tabs: Record<TabId, TabData>, order: TabId[]): Record<TabId, TabData> {
  const nextTabs = { ...tabs };
  order.forEach((id, index) => { if (nextTabs[id] && nextTabs[id].index !== index) nextTabs[id] = { ...nextTabs[id], index }; });
  return nextTabs;
}

export function moveTab(state: AppState, tabId: TabId, newIndex: number): AppState {
  if (!state.tabs[tabId]) return state;
  const currentOrder = [...state.tabOrder];
  const oldIndex = currentOrder.indexOf(tabId);
  if (oldIndex === -1 || oldIndex === newIndex) return state;
  currentOrder.splice(oldIndex, 1);
  currentOrder.splice(newIndex, 0, tabId);
  return { ...state, tabs: updateTabIndices(state.tabs, currentOrder), tabOrder: currentOrder };
}

export function calculateInsertionIndex(state: AppState, options: { tabIndex?: number; openerTabId?: TabId; isPinned?: boolean; insertAfterCurrent?: boolean; insertRelatedAfterCurrent?: boolean; }): number {
  if (options.tabIndex !== undefined) return options.tabIndex;
  const selectedId = state.selectedTabId;
  const openerId = options.openerTabId;
  if (options.isPinned) { let count = 0; for (const id of state.tabOrder) if (state.tabs[id].isPinned) count++; return count; }
  if (options.insertRelatedAfterCurrent && openerId) { const openerIndex = state.tabOrder.indexOf(openerId); if (openerIndex !== -1) return openerIndex + 1; }
  if (options.insertAfterCurrent && selectedId) { const selectedIndex = state.tabOrder.indexOf(selectedId); if (selectedIndex !== -1) return selectedIndex + 1; }
  return state.tabOrder.length;
}

export function moveTabRelative(state: AppState, tabId: TabId, targetId: TabId, position: "before" | "after"): AppState {
  const tab = state.tabs[tabId];
  const target = state.tabs[targetId];
  if (!tab || !target) return state;
  const currentOrder = [...state.tabOrder];
  const oldIndex = currentOrder.indexOf(tabId);
  let targetIndex = currentOrder.indexOf(targetId);
  if (oldIndex === -1 || targetIndex === -1) return state;
  currentOrder.splice(oldIndex, 1);
  targetIndex = currentOrder.indexOf(targetId);
  const finalIndex = position === "before" ? targetIndex : targetIndex + 1;
  return moveTab(state, tabId, finalIndex);
}

export function setTabVisibility(state: AppState, tabId: TabId, isVisible: boolean): AppState {
  const tab = state.tabs[tabId];
  if (!tab) return state;
  if (!isVisible && (tab.isSelected || tab.sharingState.camera || tab.sharingState.microphone || tab.sharingState.screen)) return state;
  return { ...state, tabs: { ...state.tabs, [tabId]: { ...tab, isHidden: !isVisible } } };
}

export function moveTabTo(state: AppState, tabId: TabId, newIndex: number): AppState {
  const tab = state.tabs[tabId];
  if (!tab) return state;
  let pinnedCount = 0;
  for (const id of state.tabOrder) if (state.tabs[id].isPinned) pinnedCount++;
  let finalIndex = newIndex;
  if (tab.isPinned) finalIndex = Math.min(newIndex, pinnedCount - 1);
  else finalIndex = Math.max(newIndex, pinnedCount);
  return moveTab(state, tabId, finalIndex);
}

export function getDuplicateTabs(state: AppState, targetTabId: TabId): TabId[] {
  const target = state.tabs[targetTabId];
  if (!target) return [];
  return state.tabOrder.filter(id => {
    const tab = state.tabs[id];
    if (id === targetTabId || tab.isPinned) return false;
    return tab.uri === target.uri && tab.userContextId === target.userContextId;
  });
}

export function getTabsToStart(state: AppState, tabId: TabId): TabId[] {
  const index = state.tabOrder.indexOf(tabId);
  if (index === -1) return [];
  return state.tabOrder.slice(0, index).filter(id => !state.tabs[id].isPinned && !state.tabs[id].isHidden);
}

export function getTabsToEnd(state: AppState, tabId: TabId): TabId[] {
  const index = state.tabOrder.indexOf(tabId);
  if (index === -1) return [];
  return state.tabOrder.slice(index + 1).filter(id => !state.tabs[id].isPinned && !state.tabs[id].isHidden);
}

export function getTabsByURI(state: AppState, uris: string[]): TabId[] {
    const uriSet = new Set(uris);
    return state.tabOrder.filter(id => uriSet.has(state.tabs[id].uri));
}

export function findTabToBlurTo(state: AppState, tabId: TabId, excludeIds: TabId[] = []): TabId | null {
  const tab = state.tabs[tabId];
  if (!tab || !tab.isSelected) return null;
  const excludeSet = new Set(excludeIds);
  if (tab.successorTabId && !excludeSet.has(tab.successorTabId)) return tab.successorTabId;
  if (tab.ownerTabId && !excludeSet.has(tab.ownerTabId)) { const owner = state.tabs[tab.ownerTabId]; if (owner && !owner.isHidden) return tab.ownerTabId; }
  const visibleTabs = state.tabOrder.filter(id => !state.tabs[id].isHidden && !excludeSet.has(id));
  const currentIndex = state.tabOrder.indexOf(tabId);
  for (let i = currentIndex + 1; i < state.tabOrder.length; i++) { const id = state.tabOrder[i]; if (!state.tabs[id].isHidden && !excludeSet.has(id)) return id; }
  for (let i = currentIndex - 1; i >= 0; i--) { const id = state.tabOrder[i]; if (!state.tabs[id].isHidden && !excludeSet.has(id)) return id; }
  return visibleTabs[0] || null;
}

export function calculateLoadFlags(params: { allowThirdPartyFixup?: boolean; fromExternal?: boolean; isSystemPrincipal?: boolean; allowInheritPrincipal?: boolean; isCaptivePortalTab?: boolean; forceAllowDataURI?: boolean; }): number {
  let flags = 0;
  if (params.allowThirdPartyFixup) flags |= 0x20 | 0x40;
  if (params.fromExternal) flags |= 0x10;
  else if (!params.isSystemPrincipal) flags |= 0x400;
  if (!params.allowInheritPrincipal) flags |= 0x100;
  if (params.isCaptivePortalTab) flags |= 0x4000;
  if (params.forceAllowDataURI) flags |= 0x20000;
  return flags;
}

export function updateAudioState(state: AppState, tabId: TabId, update: Partial<TabData>): AppState {
  const tab = state.tabs[tabId];
  if (!tab) return state;
  return { ...state, tabs: { ...state.tabs, [tabId]: { ...tab, ...update } } };
}

export function setTabSuccessor(state: AppState, tabId: TabId, successorId: TabId | null): AppState {
  const tab = state.tabs[tabId];
  if (!tab) return state;
  const nextTabs = { ...state.tabs };
  if (tab.successorTabId && nextTabs[tab.successorTabId]) { const oldSucc = nextTabs[tab.successorTabId]; nextTabs[tab.successorTabId] = { ...oldSucc, predecessorTabIds: oldSucc.predecessorTabIds.filter(id => id !== tabId) }; }
  nextTabs[tabId] = { ...tab, successorTabId: successorId || undefined };
  if (successorId && nextTabs[successorId]) { const newSucc = nextTabs[successorId]; nextTabs[successorId] = { ...newSucc, predecessorTabIds: [...newSucc.predecessorTabIds, tabId] }; }
  return { ...state, tabs: nextTabs };
}

export function setTabBusy(state: AppState, tabId: TabId, isBusy: boolean): AppState {
  const tab = state.tabs[tabId];
  if (!tab) return state;
  return { ...state, tabs: { ...state.tabs, [tabId]: { ...tab, isBusy } } };
}

export function updateTabLocation(state: AppState, tabId: TabId, uri: string, options: { isSameDocument?: boolean; } = {}): AppState {
  const tab = state.tabs[tabId];
  if (!tab) return state;
  const nextTab = { ...tab, uri, ...(options.isSameDocument ? {} : { soundPlaying: false, soundPlayingScheduledRemoval: false }) };
  return { ...state, tabs: { ...state.tabs, [tabId]: nextTab } };
}

export function setMultiSelection(state: AppState, tabIds: TabId[], isSelected: boolean): AppState {
  const nextTabs = { ...state.tabs };
  for (const id of tabIds) { if (nextTabs[id]) nextTabs[id] = { ...nextTabs[id], isMultiSelected: isSelected }; }
  return { ...state, tabs: nextTabs };
}

export function clearMultiSelection(state: AppState): AppState {
  const nextTabs = { ...state.tabs };
  for (const id of state.tabOrder) { if (nextTabs[id].isMultiSelected) nextTabs[id] = { ...nextTabs[id], isMultiSelected: false }; }
  return { ...state, tabs: nextTabs };
}

const SHORTEN_URL_REGEX = /^[^:]+:\/\/(?:www\.)?/;
