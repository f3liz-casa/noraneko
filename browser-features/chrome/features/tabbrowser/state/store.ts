// SPDX-License-Identifier: MPL-2.0

import { signal, computed } from "@preact/signals";
import type { AppState, TabData, TabId, TabGroupData, BrowserEngineState } from "../types/TabState.ts";

const initialState: AppState = {
  tabs: {},
  groups: {},
  engineStates: {},
  tabOrder: [],
  selectedTabId: null,
  activeSplitViewId: null,
  config: {
    // Extracted from tabbrowser.js defaults
    shouldExposeContentTitle: true,
    shouldExposeContentTitlePbm: true,
    showTabCardPreview: true,
    allowTransparentBrowser: false,
    tabGroupsEnabled: false,
    tabNotesEnabled: false,
    showPidAndActiveness: false,
    unloadTabInContextMenu: false,
    notificationEnableDelay: 500,
    tabMinWidth: 100,
    tabClipWidth: 140,
  },
};

export const appState = signal<AppState>(initialState);

export const selectedTab = computed<TabData | null>(() => {
  const state = appState.value;
  if (!state.selectedTabId) return null;
  return state.tabs[state.selectedTabId] || null;
});

export const orderedTabs = computed<TabData[]>(() => {
  const state = appState.value;
  return state.tabOrder.map(id => state.tabs[id]).filter(Boolean);
});

export const selectedEngineState = computed<BrowserEngineState | null>(() => {
  const state = appState.value;
  if (!state.selectedTabId) return null;
  return state.engineStates[state.selectedTabId] || null;
});

export const allGroups = computed<TabGroupData[]>(() => {
  return Object.values(appState.value.groups);
});

export function updateState(updater: (state: AppState) => AppState): void {
  appState.value = updater(appState.value);
}

export function setSelectedTab(tabId: TabId): void {
  updateState(state => ({
    ...state,
    selectedTabId: tabId,
    tabs: {
      ...state.tabs,
      [tabId]: { ...state.tabs[tabId], isSelected: true },
      ...(state.selectedTabId && state.selectedTabId !== tabId && state.tabs[state.selectedTabId]
        ? { [state.selectedTabId]: { ...state.tabs[state.selectedTabId], isSelected: false } }
        : {}),
    },
  }));
}

export function updateConfig(partialConfig: Partial<AppState["config"]>): void {
  updateState(state => ({
    ...state,
    config: { ...state.config, ...partialConfig },
  }));
}
