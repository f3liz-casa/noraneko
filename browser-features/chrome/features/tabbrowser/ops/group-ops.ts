// SPDX-License-Identifier: MPL-2.0

/**
 * Group Operations - Pure Logic
 */

import type { AppState, GroupId, TabGroupData, TabId, SplitViewId, SplitViewData } from "../types/TabState.ts";

/**
 * Generates an ID matching the pattern in tabbrowser.js (Line 3300)
 */
export function generateLegacyId(): string {
  return `${Date.now()}-${Math.round(Math.random() * 100)}`;
}

// ============================================================================
// Core Group Operations
// ============================================================================

export function createGroup(
  state: AppState,
  id: GroupId,
  title: string,
  color: string = "blue"
): AppState {
  const newGroup: TabGroupData = { id, title, color, isCollapsed: false, tabs: [] };
  return { ...state, groups: { ...state.groups, [id]: newGroup } };
}

export function addTabToGroup(state: AppState, tabId: TabId, groupId: GroupId): AppState {
  const tab = state.tabs[tabId];
  const group = state.groups[groupId];
  if (!tab || !group || tab.groupId === groupId) return state;

  let intermediateState = state;
  if (tab.groupId) intermediateState = removeTabFromGroup(state, tabId);

  const nextGroup = { ...group, tabs: [...group.tabs, tabId] };
  const nextTab = { ...intermediateState.tabs[tabId], groupId: groupId };

  return {
    ...intermediateState,
    tabs: { ...intermediateState.tabs, [tabId]: nextTab },
    groups: { ...intermediateState.groups, [groupId]: nextGroup },
  };
}

export function removeTabFromGroup(state: AppState, tabId: TabId): AppState {
  const tab = state.tabs[tabId];
  if (!tab || !tab.groupId) return state;
  const groupId = tab.groupId;
  const group = state.groups[groupId];
  if (!group) return { ...state, tabs: { ...state.tabs, [tabId]: { ...tab, groupId: undefined } } };
  const nextGroup = { ...group, tabs: group.tabs.filter(id => id !== tabId) };
  return { ...state, tabs: { ...state.tabs, [tabId]: { ...tab, groupId: undefined } }, groups: { ...state.groups, [groupId]: nextGroup } };
}

// ============================================================================
// Split View Operations (Lines 3100-3250)
// ============================================================================

export function createSplitView(state: AppState, id: SplitViewId, tabIds: TabId[]): AppState {
  const newSplitView: SplitViewData = { id, tabs: tabIds };
  
  // Update all tabs to point to this split view
  const nextTabs = { ...state.tabs };
  for (const tid of tabIds) {
      if (nextTabs[tid]) nextTabs[tid] = { ...nextTabs[tid], splitViewId: id };
  }

  return {
    ...state,
    tabs: nextTabs,
    splitViews: { ...state.splitViews, [id]: newSplitView },
  };
}

export function removeSplitView(state: AppState, id: SplitViewId): AppState {
  const splitView = state.splitViews[id];
  if (!splitView) return state;

  const nextTabs = { ...state.tabs };
  for (const tid of splitView.tabs) {
      if (nextTabs[tid]) nextTabs[tid] = { ...nextTabs[tid], splitViewId: undefined };
  }

  const { [id]: _, ...nextSplitViews } = state.splitViews;
  return {
    ...state,
    tabs: nextTabs,
    splitViews: nextSplitViews,
    activeSplitViewId: state.activeSplitViewId === id ? null : state.activeSplitViewId,
  };
}
