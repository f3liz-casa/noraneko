// SPDX-License-Identifier: MPL-2.0

import { assign, createMachine } from "xstate";
import type { AppState, TabData, TabId, GroupId, SplitViewId } from "../types/TabState.ts";
import * as tabOps from "../ops/tab-ops.ts";
import * as groupOps from "../ops/group-ops.ts";

export type TabEvent =
  | { type: "ADD_TAB"; tab: TabData; index?: number }
  | { type: "REMOVE_TAB"; tabId: TabId }
  | { type: "SELECT_TAB"; tabId: TabId }
  | { type: "MOVE_TAB"; tabId: TabId; newIndex: number }
  | { type: "MOVE_TAB_RELATIVE"; tabId: TabId; targetId: TabId; position: "before" | "after" }
  | { type: "PIN_TAB"; tabId: TabId }
  | { type: "UNPIN_TAB"; tabId: TabId }
  | { type: "DUPLICATE_TAB"; tabId: TabId }
  | { type: "UPDATE_TAB_LABEL"; tabId: TabId; label: string; isContentTitle: boolean; direction: "ltr" | "rtl" }
  | { type: "SET_ICON"; tabId: TabId; iconUrl: string }
  | { type: "UPDATE_ACTIVITY"; tabId: TabId }
  | { type: "SET_BUSY"; tabId: TabId; isBusy: boolean }
  | { type: "SET_PERMANENT_KEY"; tabId: TabId; permanentKey: any }
  | { type: "SET_MUTED"; tabId: TabId; isMuted: boolean }
  | { type: "SET_MULTI_SELECTION"; tabIds: TabId[]; isSelected: boolean }
  | { type: "CLEAR_MULTI_SELECTION" }
  | { type: "UPDATE_AUDIO_STATE"; tabId: TabId; soundPlaying: boolean }
  | { type: "UPDATE_LOCATION"; tabId: TabId; uri: string; options?: { isSameDocument?: boolean } }
  | { type: "SET_VISIBILITY"; tabId: TabId; isVisible: boolean }
  | { type: "BEGIN_CLOSE_TAB"; tabId: TabId }
  | { type: "END_CLOSE_TAB"; tabId: TabId }
  | { type: "DISCARD_TAB"; tabId: TabId }
  | { type: "SET_LOADING"; tabId: TabId }
  | { type: "SET_LOADED"; tabId: TabId }
  | { type: "CRASH_TAB"; tabId: TabId }
  | { type: "RESTORE_TAB"; tabId: TabId }
  | { type: "CREATE_GROUP"; id: GroupId; title: string; color?: string }
  | { type: "ADD_TAB_TO_GROUP"; tabId: TabId; groupId: GroupId }
  | { type: "ADD_TABS_TO_GROUP"; groupId: GroupId; tabIds: TabId[] }
  | { type: "REMOVE_TAB_FROM_GROUP"; tabId: TabId }
  | { type: "CREATE_SPLIT_VIEW"; id: SplitViewId; tabIds: TabId[] }
  | { type: "ADD_TAB_TO_SPLIT_VIEW"; splitViewId: SplitViewId; tabId: TabId }
  | { type: "REMOVE_SPLIT_VIEW"; id: SplitViewId }
  | { type: "UPDATE_CONFIG"; config: Partial<AppState["config"]> };

const callOp = <T extends TabEvent["type"]>(op: (state: AppState, ...args: any[]) => AppState) =>
  assign(({ context, event }: { context: AppState; event: Extract<TabEvent, { type: T }> }) => {
    const { type, ...args } = event as any;
    return op(context, ...Object.values(args));
  });

export const tabMachine = createMachine({
  types: {} as { context: AppState; events: TabEvent },
  id: "tabbrowser",
  initial: "idle",
  context: ({ input }: { input: AppState }) => input,
  states: {
    idle: {
      on: {
        ADD_TAB: { actions: callOp<"ADD_TAB">(tabOps.addTab) },
        REMOVE_TAB: { actions: callOp<"REMOVE_TAB">(tabOps.removeTab) },
        SELECT_TAB: {
          actions: assign(({ context, event }: { context: AppState; event: Extract<TabEvent, { type: "SELECT_TAB" }> }) => {
            const tab = context.tabs[event.tabId];
            if (!tab) return context;
            const nextTabs = { ...context.tabs, [event.tabId]: { ...tab, isSelected: true } };
            if (context.selectedTabId && context.tabs[context.selectedTabId]) {
              nextTabs[context.selectedTabId] = { ...context.tabs[context.selectedTabId], isSelected: false };
            }
            return { ...context, selectedTabId: event.tabId, tabs: nextTabs };
          }),
        },
        MOVE_TAB: { actions: callOp<"MOVE_TAB">(tabOps.moveTab) },
        MOVE_TAB_RELATIVE: { actions: callOp<"MOVE_TAB_RELATIVE">(tabOps.moveTabRelative) },
        PIN_TAB: { actions: callOp<"PIN_TAB">(tabOps.pinTab) },
        UNPIN_TAB: { actions: callOp<"UNPIN_TAB">(tabOps.unpinTab) },
        DUPLICATE_TAB: { actions: callOp<"DUPLICATE_TAB">(tabOps.duplicateTab) },
        UPDATE_TAB_LABEL: {
          actions: assign(({ context, event }: { context: AppState; event: Extract<TabEvent, { type: "UPDATE_TAB_LABEL" }> }) =>
            tabOps.updateTabLabel(context, event.tabId, { label: event.label, isContentTitle: event.isContentTitle, direction: event.direction })
          ),
        },
        SET_ICON: { actions: callOp<"SET_ICON">(tabOps.setIcon) },
        UPDATE_ACTIVITY: { actions: callOp<"UPDATE_ACTIVITY">(tabOps.updateActivity) },
        SET_BUSY: { actions: callOp<"SET_BUSY">(tabOps.setTabBusy) },
        SET_PERMANENT_KEY: {
          actions: assign(({ context, event }: { context: AppState; event: Extract<TabEvent, { type: "SET_PERMANENT_KEY" }> }) => ({
            ...context, tabs: { ...context.tabs, [event.tabId]: { ...context.tabs[event.tabId], permanentKey: event.permanentKey } },
          })),
        },
        SET_MUTED: {
          actions: assign(({ context, event }: { context: AppState; event: Extract<TabEvent, { type: "SET_MUTED" }> }) =>
            tabOps.updateAudioState(context, event.tabId, { isMuted: event.isMuted })
          ),
        },
        SET_MULTI_SELECTION: { actions: callOp<"SET_MULTI_SELECTION">(tabOps.setMultiSelection) },
        CLEAR_MULTI_SELECTION: { actions: callOp<"CLEAR_MULTI_SELECTION">(tabOps.clearMultiSelection) },
        UPDATE_AUDIO_STATE: {
          actions: assign(({ context, event }: { context: AppState; event: Extract<TabEvent, { type: "UPDATE_AUDIO_STATE" }> }) =>
            tabOps.updateAudioState(context, event.tabId, { soundPlaying: event.soundPlaying })
          ),
        },
        UPDATE_LOCATION: {
          actions: assign(({ context, event }: { context: AppState; event: Extract<TabEvent, { type: "UPDATE_LOCATION" }> }) =>
            tabOps.updateTabLocation(context, event.tabId, event.uri, event.options)
          ),
        },
        SET_VISIBILITY: { actions: callOp<"SET_VISIBILITY">(tabOps.setTabVisibility) },
        // NOTE: bridge/modules/tab-crud.ts and bridge/TabbrowserCompat.ts guard
        // `_beginRemoveTab` with `appState.value.tabs[id]?.isClosing` checks.
        // Ideally those guards should live here as XState state guards, but they
        // live in the bridge layer for now.
        BEGIN_CLOSE_TAB: { actions: callOp<"BEGIN_CLOSE_TAB">(tabOps.beginCloseTab) },
        END_CLOSE_TAB: { actions: callOp<"END_CLOSE_TAB">(tabOps.endCloseTab) },
        DISCARD_TAB: { actions: callOp<"DISCARD_TAB">(tabOps.discardTab) },
        // --- Tab lifecycle events ---
        // SET_LOADING / SET_LOADED model the isBusy flag explicitly; prefer these
        // over raw SET_BUSY when the caller knows the tab is starting/finishing a
        // navigation so intent is clear.
        SET_LOADING: {
          actions: assign(({ context, event }: { context: AppState; event: Extract<TabEvent, { type: "SET_LOADING" }> }) =>
            context.tabs[event.tabId]
              ? { ...context, tabs: { ...context.tabs, [event.tabId]: { ...context.tabs[event.tabId], isBusy: true } } }
              : context
          ),
        },
        SET_LOADED: {
          actions: assign(({ context, event }: { context: AppState; event: Extract<TabEvent, { type: "SET_LOADED" }> }) =>
            context.tabs[event.tabId]
              ? { ...context, tabs: { ...context.tabs, [event.tabId]: { ...context.tabs[event.tabId], isBusy: false } } }
              : context
          ),
        },
        CRASH_TAB: {
          actions: assign(({ context, event }: { context: AppState; event: Extract<TabEvent, { type: "CRASH_TAB" }> }) =>
            context.tabs[event.tabId]
              ? { ...context, tabs: { ...context.tabs, [event.tabId]: { ...context.tabs[event.tabId], isCrashed: true, isBusy: false } } }
              : context
          ),
        },
        RESTORE_TAB: {
          actions: assign(({ context, event }: { context: AppState; event: Extract<TabEvent, { type: "RESTORE_TAB" }> }) =>
            context.tabs[event.tabId]
              ? { ...context, tabs: { ...context.tabs, [event.tabId]: { ...context.tabs[event.tabId], isCrashed: false, isDiscarded: false } } }
              : context
          ),
        },
        CREATE_GROUP: { actions: callOp<"CREATE_GROUP">(groupOps.createGroup) },
        ADD_TAB_TO_GROUP: { actions: callOp<"ADD_TAB_TO_GROUP">(groupOps.addTabToGroup) },
        ADD_TABS_TO_GROUP: { actions: callOp<"ADD_TABS_TO_GROUP">(groupOps.addTabsToGroup) },
        REMOVE_TAB_FROM_GROUP: { actions: callOp<"REMOVE_TAB_FROM_GROUP">(groupOps.removeTabFromGroup) },
        CREATE_SPLIT_VIEW: { actions: callOp<"CREATE_SPLIT_VIEW">(groupOps.createSplitView) },
        ADD_TAB_TO_SPLIT_VIEW: { actions: callOp<"ADD_TAB_TO_SPLIT_VIEW">(groupOps.addTabToSplitView) },
        REMOVE_SPLIT_VIEW: { actions: callOp<"REMOVE_SPLIT_VIEW">(groupOps.removeSplitView) },
        UPDATE_CONFIG: {
          actions: assign(({ context, event }: { context: AppState; event: Extract<TabEvent, { type: "UPDATE_CONFIG" }> }) => ({
            ...context, config: { ...context.config, ...event.config },
          })),
        },
      },
    },
  },
});
