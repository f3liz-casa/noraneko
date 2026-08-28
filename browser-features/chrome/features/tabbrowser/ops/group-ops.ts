// SPDX-License-Identifier: MPL-2.0

/**
 * Group Operations - Pure Logic (Refactored with Immer)
 */

import { produce, type Draft } from "immer";
import type { AppState, GroupId, TabGroupData, TabId, SplitViewId, SplitViewData } from "../types/TabState.ts";

export const generateLegacyId = (): string => `${Date.now()}-${Math.round(Math.random() * 100)}`;

export const createGroup = produce((draft: Draft<AppState>, id: GroupId, title: string, color: string = "blue") => {
  draft.groups[id] = { id, title, color, isCollapsed: false, tabs: [] };
});

export const removeTabFromGroup = produce((draft: Draft<AppState>, tabId: TabId) => {
  const tab = draft.tabs[tabId];
  if (!tab || !tab.groupId) return;
  const group = draft.groups[tab.groupId];
  if (group) group.tabs = group.tabs.filter(id => id !== tabId);
  (tab as any).groupId = undefined;
});

export const addTabToGroup = produce((draft: Draft<AppState>, tabId: TabId, groupId: GroupId) => {
  const tab = draft.tabs[tabId];
  const group = draft.groups[groupId];
  if (!tab || !group || tab.groupId === groupId) return;
  if (tab.groupId) {
    const oldGroup = draft.groups[tab.groupId];
    if (oldGroup) oldGroup.tabs = oldGroup.tabs.filter(id => id !== tabId);
  }
  group.tabs.push(tabId);
  (tab as any).groupId = groupId;
});

export const addTabsToGroup = produce((draft: Draft<AppState>, groupId: GroupId, tabIds: TabId[]) => {
  tabIds.forEach(tid => {
    const tab = draft.tabs[tid];
    const group = draft.groups[groupId];
    if (tab && group && tab.groupId !== groupId) {
      if (tab.groupId) {
        const oldGroup = draft.groups[tab.groupId];
        if (oldGroup) oldGroup.tabs = oldGroup.tabs.filter(id => id !== tid);
      }
      group.tabs.push(tid);
      (tab as any).groupId = groupId;
    }
  });
});

export const createSplitView = produce((draft: Draft<AppState>, id: SplitViewId, tabIds: TabId[]) => {
  draft.splitViews[id] = { id, tabs: tabIds };
  tabIds.forEach(tid => { if (draft.tabs[tid]) (draft.tabs[tid] as any).splitViewId = id; });
});

export const addTabToSplitView = produce((draft: Draft<AppState>, splitViewId: SplitViewId, tabId: TabId) => {
  const tab = draft.tabs[tabId];
  const sv = draft.splitViews[splitViewId];
  if (tab && sv && tab.splitViewId !== splitViewId) {
    sv.tabs.push(tabId);
    (tab as any).splitViewId = splitViewId;
  }
});

export const removeSplitView = produce((draft: Draft<AppState>, id: SplitViewId) => {
  const sv = draft.splitViews[id];
  if (!sv) return;
  sv.tabs.forEach(tid => { if (draft.tabs[tid]) (draft.tabs[tid] as any).splitViewId = undefined; });
  delete draft.splitViews[id];
  if (draft.activeSplitViewId === id) draft.activeSplitViewId = null;
});
