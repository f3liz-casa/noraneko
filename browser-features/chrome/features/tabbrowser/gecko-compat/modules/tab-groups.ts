// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L3325~L3596
// Section: Tab Groups · Multi-Selection

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { pipe, A, O } from "@mobily/ts-belt";
import { appState, send } from "../../state/store.ts";
import * as TabOps from "../../ops/tab-ops.ts";
import * as GroupOps from "../../ops/group-ops.ts";
import { DOMRegistry } from "../DOMRegistry.ts";
import type { GroupId } from "../../types/TabState.ts";
import { resolveTabId, dispatch } from "../compat-helpers.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    createTabGroup(tabs?: MozTabbrowserTab[], options?: any): any;
    // Methods
    addTabGroup(tabs: MozTabbrowserTab[], options?: any): any;
    removeTabGroup(group: MozTabbrowserTabGroup, options?: any): Promise<void>;
    ungroupTab(tab: MozTabbrowserTab): void;
    getTabGroupById(groupId: GroupId): any;
    getAllTabGroups(options?: any): any[];
    moveTabToExistingGroup(tab: MozTabbrowserTab, groupId: GroupId): void;
    moveTabToGroup(tab: MozTabbrowserTab, group: any, metricsContext?: any): void;
    adoptTabGroup(group: MozTabbrowserTabGroup): void;
    selectedTabs: MozTabbrowserTab[];
    multiSelectedTabsCount: number;
    lastMultiSelectedTab: MozTabbrowserTab | null;
    addToMultiSelectedTabs(tab: MozTabbrowserTab): void;
    removeFromMultiSelectedTabs(tab: MozTabbrowserTab): void;
    clearMultiSelectedTabs(options?: any): void;
    selectAllTabs(): void;
    allTabsSelected(): boolean;
    _avoidSingleSelectedTab(): void;
    addRangeToMultiSelectedTabs(startTab: MozTabbrowserTab, endTab: MozTabbrowserTab): void;
    lockClearMultiSelectionOnce(): void;
    unlockClearMultiSelection(): void;
    _startMultiSelectChange(): void;
    _endMultiSelectChange(): void;
    _mayTabBeMultiselected(tab: MozTabbrowserTab): boolean;
    _switchToNextMultiSelectedTab(): void;
    _updateMultiselectedTabCloseButtonTooltip(): void;
    toggleMuteAudioOnMultiSelectedTabs(tab: MozTabbrowserTab): void;
    resumeDelayedMediaOnMultiSelectedTabs(): void;
    reloadMultiSelectedTabs(): void;
    reloadTab(tab: MozTabbrowserTab): void;
    reloadTabs(tabs: MozTabbrowserTab[]): void;
    pinMultiSelectedTabs(): void;
    unpinMultiSelectedTabs(): void;
    setSuccessor(tab: MozTabbrowserTab, successor: MozTabbrowserTab | null): void;
    replaceInSuccession(tab: MozTabbrowserTab, otherTab: MozTabbrowserTab | null): void;
    _blurTab(tab: MozTabbrowserTab): void;
    _findTabToBlurTo(tab: MozTabbrowserTab, excludeTabs?: MozTabbrowserTab[]): MozTabbrowserTab | null;
    _getTabsToTheEndFrom(tab: MozTabbrowserTab): MozTabbrowserTab[];
    _getTabsToTheStartFrom(tab: MozTabbrowserTab): MozTabbrowserTab[];
    removeTabsToTheEndFrom(tab: MozTabbrowserTab, options?: any): void;
    removeTabsToTheStartFrom(tab: MozTabbrowserTab, options?: any): void;
    moveTabsToEnd(contextTab: MozTabbrowserTab): void;
    moveTabsToStart(contextTab: MozTabbrowserTab): void;
    moveTabsAfter(tabs: MozTabbrowserTab[], targetTab: MozTabbrowserTab, metricsContext?: any): void;
    moveTabsBefore(tabs: MozTabbrowserTab[], targetTab: MozTabbrowserTab, metricsContext?: any): void;
    _updateTabBarForPinnedTabs(): void;
    _updateTabsAfterInsert(): void;
    _determineURIToLoad(uriString: string, createLazyBrowser: boolean): any;
  }
}

export const methods = {
  // ==========================================================================
  // Tab Groups (addTabGroup, removeTabGroup, etc.)
  // tabbrowser.js L3368~L5086
  // ==========================================================================

  /**
   * Creates a new tab group and assigns the given tabs to it.
   *
   * @param tabs - Tabs to include in the new group.
   * @param options.id    - Explicit group ID; auto-generated if omitted.
   * @param options.title - Display name for the group.
   * @param options.color - Color key for the group label (e.g. `"blue"`).
   * @returns The newly created group object.
   */
  createTabGroup(tabs: MozTabbrowserTab[] = [], options: any = {}): any {
    const id = options.id ?? GroupOps.generateLegacyId();
    send({ type: "CREATE_GROUP", id, title: options.title ?? "", color: options.color ?? "blue" });
    for (const t of tabs) {
      const tid = resolveTabId(t);
      if (tid) send({ type: "ADD_TAB_TO_GROUP", tabId: tid, groupId: id });
    }
    return appState.value.groups[id];
  },

  /**
   * Creates a new tab group from `tabs`, auto-assigning the next unused color.
   * Pinned tabs are silently excluded — they cannot belong to a group.
   *
   * @param tabs - Candidate tabs; pinned tabs are filtered out automatically.
   * @param options.title - Display name for the group.
   * @param options.color - Override the auto-selected color.
   * @returns The new group object, or `null` when no groupable tabs remain.
   */
  // upstream: addTabGroup@1697b981cf FIREFOX_143_0_1_RELEASE
  addTabGroup(tabs: MozTabbrowserTab[], options: any = {}) {
    // Filter out pinned tabs (can't be in groups)
    const groupableTabs = tabs.filter(t => !t.pinned);
    if (!groupableTabs.length) return null;
    const color = options.color ?? (this as any).tabGroupMenu?.nextUnusedColor?.() ?? "blue";
    return this.createTabGroup(groupableTabs, { ...options, color });
  },

  /** Move one tab into `group` (pinned tabs stay where they are). */
  moveTabToGroup(tab: MozTabbrowserTab, group: any, metricsContext?: any) {
    if (!this.isTab(tab)) {
      throw new Error("Can only move a tab into a tab group");
    }
    if (tab.pinned) {
      return;
    }
    if (tab.group && tab.group.id === group.id) {
      return;
    }

    this._handleTabMove(tab, () => group.appendChild(tab), metricsContext);
    this.removeFromMultiSelectedTabs(tab);
    this.tabContainer._notifyBackgroundTab(tab);
  },

  /**
   * Returns the group with the given ID, or `null` if no such group exists.
   */
  // upstream: getTabGroupById@004c84576c FIREFOX_143_0_1_RELEASE
  getTabGroupById(groupId: GroupId) {
    return appState.value.groups[groupId] ?? null;
  },

  /**
   * Returns all currently open tab groups.
   */
  // upstream: getAllTabGroups@d054fef402 FIREFOX_143_0_1_RELEASE
  getAllTabGroups() {
    return Object.values(appState.value.groups);
  },

  /**
   * Moves a tab into an existing group, firing a `TabGrouped` event.
   */
  moveTabToExistingGroup(tab: MozTabbrowserTab, groupId: GroupId) {
    const id = resolveTabId(tab);
    if (!id) return;
    send({ type: "ADD_TAB_TO_GROUP", tabId: id, groupId });
    const el = DOMRegistry.getTab(id);
    if (el) dispatch(el, "TabGrouped");
  },

  /**
   * Registers a tab group originating from another window into this window's state.
   * No-ops when the group already belongs to this window or is already tracked.
   */
  // upstream: adoptTabGroup@2bc10c331f FIREFOX_143_0_1_RELEASE
  adoptTabGroup(group: MozTabbrowserTabGroup) {
    if (group?.ownerGlobal === (this as any).window) return;
    if (group?.id && !appState.value.groups[group.id]) {
      send({ type: "CREATE_GROUP", id: group.id, title: group.label, color: group.color });
    }
  },

  /**
   * Closes a tab group and all its tabs.
   *
   * Fires `TabGroupRemoveRequested` before proceeding; listeners may call
   * `preventDefault()` to abort the removal (e.g. to save the session).
   *
   * @param options.skipSessionStore - Skip SessionStore persistence for the closed tabs.
   * @param options.isUserTriggered  - Indicate that the user explicitly requested removal.
   */
  // upstream: removeTabGroup@2c01e93671 FIREFOX_143_0_1_RELEASE
  async removeTabGroup(group: MozTabbrowserTabGroup, options: any = {}) {
    if (!group) return;
    const { skipSessionStore = false, isUserTriggered = false } = options;

    // Fire removal request event for SessionStore interception
    const requestEvent = new CustomEvent("TabGroupRemoveRequested", {
      bubbles: true,
      detail: { group, isUserTriggered },
    });
    (this as any).tabContainer?.dispatchEvent?.(requestEvent);
    if (requestEvent.defaultPrevented) return;

    // Get all tabs in the group and remove them
    const tabs = group.tabs ? [...group.tabs] : [];
    if (tabs.length) {
      await (this as any).removeTabs(tabs, {
        animate: true,
        skipGroupCheck: true,
        skipSessionStore,
      });
    }

    // If group element still exists in DOM, remove it
    try { group.remove?.(); } catch (_) { /* */ }
  },

  /**
   * Removes a tab from its group without closing it, firing a `TabUngrouped` event.
   */
  // upstream: ungroupTab@8837d7e828 FIREFOX_143_0_1_RELEASE
  ungroupTab(tab: MozTabbrowserTab) {
    if (!tab) return;
    const id = tab._tabId ?? tab.id;
    if (!id) return;
    send({ type: "REMOVE_TAB_FROM_GROUP", tabId: id });
    tab.removeAttribute?.("group-id");
    dispatch(tab, "TabUngrouped");
  },

  // ==========================================================================
  // Multi-selection
  // tabbrowser.js L6304~L7362
  // ==========================================================================

  /** Returns all currently selected tabs — the active tab plus any multi-selected tabs. */
  // upstream: get selectedTabs@fa90b92447 FIREFOX_143_0_1_RELEASE
  get selectedTabs(): MozTabbrowserTab[] {
    const s = appState.value;
    return pipe(
      s.tabOrder,
      A.filter(id => s.tabs[id].isMultiSelected || id === s.selectedTabId),
      A.filterMap(id => O.fromNullable(DOMRegistry.getTab(id))),
    ) as MozTabbrowserTab[];
  },

  /** Replaces the multi-selection with the given set of tabs. */
  // upstream: set selectedTabs@9cac866a4e FIREFOX_143_0_1_RELEASE
  set selectedTabs(tabs: MozTabbrowserTab[]) {
    this.clearMultiSelectedTabs();
    for (const t of tabs) this.addToMultiSelectedTabs(t);
  },

  /** Returns the count of tabs that are explicitly multi-selected (excludes the single active tab). */
  // upstream: get multiSelectedTabsCount@5ebd7d7ea8 FIREFOX_143_0_1_RELEASE
  get multiSelectedTabsCount(): number {
    return appState.value.tabOrder.filter(id => appState.value.tabs[id].isMultiSelected).length;
  },

  /** Returns the most recently added multi-selected tab, or `null` if the reference has been collected. */
  // upstream: get lastMultiSelectedTab@c9b78d08a9 FIREFOX_143_0_1_RELEASE
  get lastMultiSelectedTab(): MozTabbrowserTab | null {
    return this._lastMultiSelectedTabRef?.deref() ?? null;
  },

  /** Stores a weak reference to the most recently multi-selected tab. */
  // upstream: set lastMultiSelectedTab@1483625711 FIREFOX_143_0_1_RELEASE
  set lastMultiSelectedTab(tab: MozTabbrowserTab | null) {
    this._lastMultiSelectedTabRef = tab ? new WeakRef(tab) : null;
  },

  /**
   * Adds a tab to the multi-selection and records it as the last multi-selected tab.
   */
  // upstream: addToMultiSelectedTabs@e116c23d69 FIREFOX_143_0_1_RELEASE
  addToMultiSelectedTabs(tab: MozTabbrowserTab) {
    const id = resolveTabId(tab);
    if (!id) return;
    send({ type: "SET_MULTI_SELECTION", tabIds: [id], isSelected: true });
    this._multiSelectedTabsSet.add(tab);
    this.lastMultiSelectedTab = tab;
  },

  /**
   * Removes a tab from the multi-selection.
   */
  // upstream: removeFromMultiSelectedTabs@37a51b83d9 FIREFOX_143_0_1_RELEASE
  removeFromMultiSelectedTabs(tab: MozTabbrowserTab) {
    const id = resolveTabId(tab);
    if (!id) return;
    send({ type: "SET_MULTI_SELECTION", tabIds: [id], isSelected: false });
    this._multiSelectedTabsSet.delete(tab);
  },

  /**
   * Clears the entire multi-selection.
   * No-op when clearing is currently locked (see `lockClearMultiSelectionOnce`).
   */
  // upstream: clearMultiSelectedTabs@1cb2a0b306 FIREFOX_143_0_1_RELEASE
  clearMultiSelectedTabs() {
    if (this._clearMultiSelectionLocked) {
      if (this._clearMultiSelectionLockedOnce) {
        this._clearMultiSelectionLockedOnce = false;
        this._clearMultiSelectionLocked = false;
      }
      return;
    }
    send({ type: "CLEAR_MULTI_SELECTION" });
    this._multiSelectedTabsSet = new WeakSet();
    this.lastMultiSelectedTab = null;
  },

  /**
   * Adds all visible (non-hidden) tabs to the multi-selection.
   */
  // upstream: selectAllTabs@6a5310e0cd FIREFOX_143_0_1_RELEASE
  selectAllTabs() {
    send({
      type: "SET_MULTI_SELECTION",
      tabIds: appState.value.tabOrder.filter(id => !appState.value.tabs[id].isHidden),
      isSelected: true,
    });
  },

  // upstream: _avoidSingleSelectedTab@ef83b2d036 FIREFOX_143_0_1_RELEASE
  _avoidSingleSelectedTab() {
    if (this.multiSelectedTabsCount === 1) {
      this.clearMultiSelectedTabs();
    }
  },

  // upstream: _switchToNextMultiSelectedTab@6384a65022 FIREFOX_143_0_1_RELEASE
  _switchToNextMultiSelectedTab() {
    this._clearMultiSelectionLocked = true;
    try {
      const lastMultiSelectedTab = this.lastMultiSelectedTab;
      if (lastMultiSelectedTab && !lastMultiSelectedTab.selected) {
        this.selectedTab = lastMultiSelectedTab;
      } else {
        const selectedTabs = ChromeUtils.nondeterministicGetWeakSetKeys?.(
          this._multiSelectedTabsSet
        )?.filter?.((t: any) => this._mayTabBeMultiselected(t));
        if (selectedTabs?.length) {
          this.selectedTab = selectedTabs.at(-1);
        }
      }
    } catch (e) {
      console.error(e);
    }
    this._clearMultiSelectionLocked = false;
  },

  // upstream: _mayTabBeMultiselected@dd5eadc0a9 FIREFOX_143_0_1_RELEASE
  _mayTabBeMultiselected(tab: MozTabbrowserTab): boolean {
    // A tab can be multiselected if it's not hidden and not in process of closing
    return tab && !tab.hidden && !tab.closing;
  },

  /**
   * Prevents the very next `clearMultiSelectedTabs` call from taking effect.
   * Useful when a UI interaction would otherwise unintentionally clear the selection.
   */
  // upstream: lockClearMultiSelectionOnce@c69d6bd60e FIREFOX_143_0_1_RELEASE
  lockClearMultiSelectionOnce() {
    this._clearMultiSelectionLockedOnce = true;
  },

  /**
   * Unconditionally unlocks multi-selection clearing, cancelling any pending lock.
   */
  // upstream: unlockClearMultiSelection@ba40d88c88 FIREFOX_143_0_1_RELEASE
  unlockClearMultiSelection() {
    this._clearMultiSelectionLocked = false;
    this._clearMultiSelectionLockedOnce = false;
  },

  /** Batch multi-selection changes; the TabMultiSelect events go out on the next microtask. */
  _startMultiSelectChange() {
    if (!this._multiSelectChangeStarted) {
      this._multiSelectChangeStarted = true;
      Promise.resolve().then(() => this._endMultiSelectChange());
    }
  },

  // upstream: _endMultiSelectChange@e26018c999 FIREFOX_143_0_1_RELEASE
  _endMultiSelectChange() {
    if (!this._multiSelectChangeStarted) return;
    this._multiSelectChangeStarted = false;

    const tabs = this.tabs;
    // Emit events for tabs that changed multi-select state
    for (const tab of this._multiSelectChangeAdditions) {
      if (tabs.includes(tab)) {
        dispatch(tab, "TabMultiSelect");
      }
    }

    for (const tab of this._multiSelectChangeRemovals) {
      dispatch(tab, "TabMultiSelect");
    }

    if (this._multiSelectChangeSelected) {
      this.tabContainer?._handleTabSelect?.();
    }

    this._multiSelectChangeAdditions.clear();
    this._multiSelectChangeRemovals.clear();
    this._multiSelectChangeSelected = false;
  },

  /**
   * Adds every visible tab between `tab1` and `tab2` (inclusive) to the multi-selection.
   * When both arguments refer to the same tab, only that tab is added.
   */
  // upstream: addRangeToMultiSelectedTabs@00b2eaa939 FIREFOX_143_0_1_RELEASE
  addRangeToMultiSelectedTabs(tab1: MozTabbrowserTab, tab2: MozTabbrowserTab) {
    if (!tab1 || !tab2) return;
    if (tab1 === tab2) {
      this.addToMultiSelectedTabs(tab1);
      return;
    }

    const tabs = this.visibleTabs;
    const idx1 = tabs.indexOf(tab1);
    const idx2 = tabs.indexOf(tab2);
    if (idx1 === -1 || idx2 === -1) return;

    const [start, end] = idx1 < idx2 ? [idx1, idx2] : [idx2, idx1];
    
    for (let i = start; i <= end; i++) {
      this.addToMultiSelectedTabs(tabs[i]);
    }
  },

  /**
   * Pins all unpinned tabs in the current multi-selection.
   * The Firefox View tab is always excluded.
   */
  // upstream: pinMultiSelectedTabs@2459160bde FIREFOX_143_0_1_RELEASE
  pinMultiSelectedTabs() {
    const tabs = this.selectedTabs.filter((t: any) => !t.pinned && t !== FirefoxViewHandler?.tab);
    for (const tab of tabs) {
      this.pinTab(tab);
    }
  },

  /**
   * Unpins all pinned tabs in the current multi-selection.
   */
  // upstream: unpinMultiSelectedTabs@5153d1675d FIREFOX_143_0_1_RELEASE
  unpinMultiSelectedTabs() {
    const tabs = this.selectedTabs.filter((t: any) => t.pinned);
    for (const tab of tabs) {
      this.unpinTab(tab);
    }
  },

  /**
   * Reloads the page in `tab`.
   */
  // upstream: reloadTab@80e91ea62b FIREFOX_143_0_1_RELEASE
  reloadTab(tab: MozTabbrowserTab) {
    const browser = this.getBrowserForTab(tab);
    if (browser) {
      browser.reload?.();
    }
  },

  /**
   * Reloads the page in each of the given tabs.
   */
  // upstream: reloadTabs@0a2073ad06 FIREFOX_143_0_1_RELEASE
  reloadTabs(tabs: MozTabbrowserTab[]) {
    for (const tab of tabs) {
      this.reloadTab(tab);
    }
  },

  /**
   * Reloads all currently selected (including multi-selected) tabs.
   */
  // upstream: reloadMultiSelectedTabs@9e9d1ab1a1 FIREFOX_143_0_1_RELEASE
  reloadMultiSelectedTabs() {
    this.reloadTabs(this.selectedTabs);
  },

  /**
   * Resumes delayed or blocked media playback in all currently selected tabs.
   */
  // upstream: resumeDelayedMediaOnMultiSelectedTabs@c636e60903 FIREFOX_143_0_1_RELEASE
  resumeDelayedMediaOnMultiSelectedTabs() {
    const tabs = this.selectedTabs;
    for (const tab of tabs) {
      const browser = this.getBrowserForTab(tab);
      browser?.resumeMedia?.();
    }
  },

  /**
   * Returns `true` when every visible tab is either selected or multi-selected.
   */
  // upstream: allTabsSelected@00b7cd492f FIREFOX_143_0_1_RELEASE
  allTabsSelected(): boolean {
    return this.visibleTabs.every((t: any) => t.multiselected || t.selected);
  },

  // upstream: _blurTab@56393a9e66 FIREFOX_143_0_1_RELEASE
  _blurTab(tab: MozTabbrowserTab) {
    const toBlur = this._findTabToBlurTo(tab);
    if (toBlur) {
      this.selectedTab = toBlur;
    }
  },

  // upstream: _findTabToBlurTo@a0c8371b95 FIREFOX_143_0_1_RELEASE
  _findTabToBlurTo(tab: MozTabbrowserTab, excludeTabs: MozTabbrowserTab[] = []): MozTabbrowserTab | null {
    if (!tab?.selected) return null;

    // Don't select Firefox View tab
    if (FirefoxViewHandler?.tab) {
      excludeTabs.push(FirefoxViewHandler.tab);
    }

    const excludeSet = new Set(excludeTabs);

    // Try successor first
    if (tab.successor && !excludeSet.has(tab.successor)) {
      return tab.successor;
    }

    // Try owner if preference enabled
    if (
      tab.owner?.visible &&
      !excludeSet.has(tab.owner) &&
      Services.prefs?.getBoolPref?.("browser.tabs.selectOwnerOnClose")
    ) {
      return tab.owner;
    }

    // Try next visible tab
    const remainingTabs = this.visibleTabs.filter((t: any) => !excludeSet.has(t));
    
    // Find next tab after current
    let candidate = this.tabContainer?.findNextTab?.(tab, {
      direction: 1,
      filter: (t: any) => remainingTabs.includes(t),
    });

    if (!candidate) {
      // Find previous tab
      candidate = this.tabContainer?.findNextTab?.(tab, {
        direction: -1,
        filter: (t: any) => remainingTabs.includes(t),
      });
    }

    if (candidate) return candidate;

    // Try collapsed tab groups
    const eligibleTabs = new Set(this.tabsInCollapsedTabGroups).difference(excludeSet);
    
    candidate = this.tabContainer?.findNextTab?.(tab, {
      direction: 1,
      filter: (t: any) => eligibleTabs.has(t),
    });

    if (!candidate) {
      candidate = this.tabContainer?.findNextTab?.(tab, {
        direction: -1,
        filter: (t: any) => eligibleTabs.has(t),
      });
    }

    return candidate;
  },

  // upstream: _getTabsToTheEndFrom@2fecb7adfc FIREFOX_143_0_1_RELEASE
  _getTabsToTheEndFrom(tab: MozTabbrowserTab): MozTabbrowserTab[] {
    const tabs = this.visibleTabs;
    const idx = tabs.indexOf(tab);
    return idx >= 0 ? tabs.slice(idx + 1) : [];
  },

  // upstream: _getTabsToTheStartFrom@6232c189c9 FIREFOX_143_0_1_RELEASE
  _getTabsToTheStartFrom(tab: MozTabbrowserTab): MozTabbrowserTab[] {
    const tabs = this.visibleTabs;
    const idx = tabs.indexOf(tab);
    return idx > 0 ? tabs.slice(0, idx) : [];
  },

  /**
   * Closes all visible tabs that appear after `tab` in the strip.
   */
  // upstream: removeTabsToTheEndFrom@5c8e1c89e6 FIREFOX_143_0_1_RELEASE
  removeTabsToTheEndFrom(tab: MozTabbrowserTab, options?: any) {
    const tabs = this._getTabsToTheEndFrom(tab);
    if (tabs.length) {
      this.removeTabs(tabs, options);
    }
  },

  /**
   * Closes all visible tabs that appear before `tab` in the strip.
   */
  // upstream: removeTabsToTheStartFrom@141970b0e1 FIREFOX_143_0_1_RELEASE
  removeTabsToTheStartFrom(tab: MozTabbrowserTab, options?: any) {
    const tabs = this._getTabsToTheStartFrom(tab);
    if (tabs.length) {
      this.removeTabs(tabs, options);
    }
  },

  /**
   * Moves `contextTab` — or the entire multi-selection when it includes `contextTab` — to the end of the tab strip.
   */
  // upstream: moveTabsToEnd@a732d435b6 FIREFOX_143_0_1_RELEASE
  moveTabsToEnd(contextTab: MozTabbrowserTab) {
    const id = resolveTabId(contextTab);
    if (!id) return;
    const tabs = this.selectedTabs.includes(contextTab)
      ? this.selectedTabs
      : [contextTab];
    // Move to end of tab order
    for (const tab of tabs) {
      this.moveTabToEnd(tab);
    }
  },

  /**
   * Moves `contextTab` — or the entire multi-selection when it includes `contextTab` — to the start of the tab strip (after any pinned tabs).
   */
  // upstream: moveTabsToStart@af5470908a FIREFOX_143_0_1_RELEASE
  moveTabsToStart(contextTab: MozTabbrowserTab) {
    const id = resolveTabId(contextTab);
    if (!id) return;
    const tabs = this.selectedTabs.includes(contextTab)
      ? this.selectedTabs
      : [contextTab];
    // Move to start (after pinned tabs)
    for (const tab of tabs) {
      this.moveTabToStart(tab);
    }
  },

  /**
   * Moves multiple tabs to appear immediately after `targetTab` in the tab strip.
   */
  // upstream: moveTabsAfter@f09cbac032 FIREFOX_143_0_1_RELEASE
  moveTabsAfter(tabs: MozTabbrowserTab[], targetTab: MozTabbrowserTab, metricsContext?: any) {
    // Move multiple tabs to appear after target
    const targetIdx = this.tabs.indexOf(targetTab);
    if (targetIdx < 0) return;
    
    for (let i = tabs.length - 1; i >= 0; i--) {
      this.moveTabAfter(tabs[i], targetTab, metricsContext);
    }
  },

  /**
   * Moves multiple tabs to appear immediately before `targetTab` in the tab strip.
   */
  // upstream: moveTabsBefore@86117421eb FIREFOX_143_0_1_RELEASE
  moveTabsBefore(tabs: MozTabbrowserTab[], targetTab: MozTabbrowserTab, metricsContext?: any) {
    // Move multiple tabs to appear before target
    const targetIdx = this.tabs.indexOf(targetTab);
    if (targetIdx < 0) return;

    for (const tab of tabs) {
      this.moveTabBefore(tab, targetTab, metricsContext);
    }
  },

  // upstream: _updateTabBarForPinnedTabs@17215f04d1 FIREFOX_143_0_1_RELEASE
  _updateTabBarForPinnedTabs() {
    this.tabContainer?._unlockTabSizing?.();
    this.tabContainer?._handleTabSelect?.(true);
    this.tabContainer?._updateCloseButtons?.();
  },

  // upstream: _updateTabsAfterInsert@c1ffceba0b FIREFOX_143_0_1_RELEASE
  _updateTabsAfterInsert() {
    const tabs = this.tabs;
    for (let i = 0; i < tabs.length; i++) {
      (tabs[i] as any)._tPos = i;
      (tabs[i] as any)._selected = false;
    }
    // Restore selection on selected tab
    if (this.selectedTab) {
      (this.selectedTab as any)._selected = true;
    }
  },

  // upstream: _determineURIToLoad@088582c0e6 FIREFOX_143_0_1_RELEASE
  _determineURIToLoad(uriString: string, createLazyBrowser: boolean): any {
    uriString = uriString || "about:blank";
    let aURIObject = null;
    try {
      aURIObject = Services.io.newURI(uriString);
    } catch (ex) {
      // Will try to fix up later
    }

    let lazyBrowserURI;
    if (createLazyBrowser && uriString !== "about:blank") {
      lazyBrowserURI = aURIObject;
      uriString = "about:blank";
    }

    const uriIsAboutBlank = uriString === "about:blank";
    return { uri: aURIObject, uriIsAboutBlank, lazyBrowserURI, uriString };
  },

  /**
   * Replaces `tab`'s slot in the successor chain with `otherTab`.
   *
   * Any tab that currently points to `tab` as its successor is updated to point
   * to `otherTab` instead, and `tab`'s own successor is transferred to `otherTab`.
   */
  // upstream: replaceInSuccession@b956f16386 FIREFOX_143_0_1_RELEASE
  replaceInSuccession(tab: MozTabbrowserTab, otherTab: MozTabbrowserTab | null) {
    // Replace tab's position in successor chain
    if (tab?.successor === otherTab) return;
    const predecessors = new Map();
    for (const t of this.tabs) {
      if ((t as any).successor) {
        predecessors.set((t as any).successor, t);
      }
    }
    const predecessor = predecessors.get(tab);
    if (predecessor) {
      (predecessor as any).successor = otherTab;
    }
    if (otherTab) {
      (tab as any).successor = (otherTab as any).successor;
      (otherTab as any).successor = null;
    }
  },

  /**
   * Sets `successorTab` as the successor of `tab`.
   * No-op when `tab` and `successorTab` are the same element.
   */
  // upstream: setSuccessor@8cde3964fa FIREFOX_143_0_1_RELEASE
  setSuccessor(tab: MozTabbrowserTab, successorTab: MozTabbrowserTab | null) {
    if (tab && tab !== successorTab) {
      (tab as any).successor = successorTab;
    }
  },

  /**
   * Toggles muted state on `tab` and all other multi-selected tabs together.
   * If any of the targeted tabs is currently muted, all are unmuted; otherwise all are muted.
   */
  // upstream: toggleMuteAudioOnMultiSelectedTabs@8192419538 FIREFOX_143_0_1_RELEASE
  toggleMuteAudioOnMultiSelectedTabs(tab: MozTabbrowserTab) {
    const id = resolveTabId(tab);
    if (!id) return;
    const s = appState.value;
    const targets = s.tabs[id]?.isMultiSelected
      ? s.tabOrder.filter(i => s.tabs[i].isMultiSelected)
      : [id];
    const anyMuted = targets.some(i => s.tabs[i]?.isMuted);
    for (const tid of targets) {
      send({ type: "SET_MUTED", tabId: tid, isMuted: !anyMuted });
    }
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
