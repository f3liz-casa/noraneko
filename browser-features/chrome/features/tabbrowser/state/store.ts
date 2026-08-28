// SPDX-License-Identifier: MPL-2.0

import { signal, computed } from "@preact/signals";
import { createActor } from "xstate";
import type { AppState, TabData, TabGroupData, BrowserEngineState } from "../types/TabState.ts";

import { tabMachine } from "./tabMachine.ts";

const initialState: AppState = {
  tabs: {},
  groups: {},
  splitViews: {},
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

export const tabActor = createActor(tabMachine, {
  input: initialState,
});

export const appState = signal<AppState>(initialState);

tabActor.subscribe((state: any) => {
  appState.value = state.context;
});

tabActor.start();

export const selectedTab = computed<TabData | null>(() => {
  const state = appState.value;
  if (!state.selectedTabId) return null;
  return state.tabs[state.selectedTabId] || null;
});

export const orderedTabs = computed<TabData[]>(() => {
  const state = appState.value;
  return state.tabOrder.map((id: string) => state.tabs[id]).filter(Boolean);
});

export const selectedEngineState = computed<BrowserEngineState | null>(() => {
  const state = appState.value;
  if (!state.selectedTabId) return null;
  return state.engineStates[state.selectedTabId] || null;
});

export const allGroups = computed<TabGroupData[]>(() => {
  return Object.values(appState.value.groups);
});

export function send(event: any): void {
  tabActor.send(event);
}
