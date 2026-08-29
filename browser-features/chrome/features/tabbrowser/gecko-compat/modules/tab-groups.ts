// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L828~L832, L2991~L3283, L3791~L3804, L4082~L4132,
// L4259~L4283, L5339~L5408, L5727~L5751, L6131~L6151, L6568~L6854, L7912~L7944
// Section: Tab Groups · Multi-Selection · Succession
//
// A tab group is a <tab-group> element in the strip; a multi-selected tab
// carries the `multiselected` attribute and sits in _multiSelectedTabsSet.

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";

const { BrowserWindowTracker } = ChromeUtils.importESModule(
  "resource:///modules/BrowserWindowTracker.sys.mjs",
);

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    // Tab groups
    _createTabGroup(id: string, color: string, collapsed: boolean, label?: string, isAdoptingGroup?: boolean): any;
    addTabGroup(tabs: MozTabbrowserTab[], options?: any): any;
    removeTabGroup(group: MozTabbrowserTabGroup, options?: any): Promise<void>;
    ungroupTab(tab: MozTabbrowserTab): void;
    getTabGroupById(groupId: string): any;
    getAllTabGroups(options?: any): any[];
    moveTabToGroup(tab: MozTabbrowserTab, group: any, metricsContext?: any): void;
    moveTabToExistingGroup(tab: MozTabbrowserTab, group: any): void;
    adoptTabGroup(group: MozTabbrowserTabGroup, options?: any): any;
    // Multi-selection
    selectedTabs: MozTabbrowserTab[];
    readonly multiSelectedTabsCount: number;
    lastMultiSelectedTab: MozTabbrowserTab | null;
    addToMultiSelectedTabs(tab: MozTabbrowserTab): void;
    addRangeToMultiSelectedTabs(startTab: MozTabbrowserTab, endTab: MozTabbrowserTab): void;
    removeFromMultiSelectedTabs(tab: MozTabbrowserTab): void;
    clearMultiSelectedTabs(): void;
    selectAllTabs(): void;
    allTabsSelected(): boolean;
    lockClearMultiSelectionOnce(): void;
    unlockClearMultiSelection(): void;
    _avoidSingleSelectedTab(): void;
    _switchToNextMultiSelectedTab(): void;
    _mayTabBeMultiselected(tab: MozTabbrowserTab): boolean;
    _startMultiSelectChange(): void;
    _endMultiSelectChange(): void;
    _updateMultiselectedTabCloseButtonTooltip(): void;
    toggleMuteAudioOnMultiSelectedTabs(tab: MozTabbrowserTab): void;
    resumeDelayedMediaOnMultiSelectedTabs(): void;
    pinMultiSelectedTabs(): void;
    unpinMultiSelectedTabs(): void;
    reloadMultiSelectedTabs(): void;
    reloadTab(tab: MozTabbrowserTab): void;
    reloadTabs(tabs: MozTabbrowserTab[]): void;
    // Succession, blur
    setSuccessor(tab: MozTabbrowserTab, successor: MozTabbrowserTab | null): void;
    replaceInSuccession(tab: MozTabbrowserTab, otherTab: MozTabbrowserTab | null): void;
    _blurTab(tab: MozTabbrowserTab): void;
    _findTabToBlurTo(tab: MozTabbrowserTab, excludeTabs?: MozTabbrowserTab[]): MozTabbrowserTab | null;
    // Ranges and bulk moves
    _getTabsToTheEndFrom(tab: MozTabbrowserTab): MozTabbrowserTab[];
    _getTabsToTheStartFrom(tab: MozTabbrowserTab): MozTabbrowserTab[];
    removeTabsToTheEndFrom(tab: MozTabbrowserTab, options?: any): void;
    removeTabsToTheStartFrom(tab: MozTabbrowserTab, options?: any): void;
    moveTabsToEnd(contextTab: MozTabbrowserTab): void;
    moveTabsToStart(contextTab: MozTabbrowserTab): void;
    moveTabsAfter(elements: any[], targetElement: any, metricsContext?: any): void;
    moveTabsBefore(elements: any[], targetElement: any, metricsContext?: any): void;
    _updateTabBarForPinnedTabs(): void;
    _updateTabsAfterInsert(): void;
    _determineURIToLoad(uriString: string, createLazyBrowser: boolean): any;
  }
}

export const methods = {
  // ==========================================================================
  // Tab Groups
  // tabbrowser.js L2991~L3283
  // ==========================================================================

  _createTabGroup(id: string, color: string, collapsed: boolean, label = "", isAdoptingGroup = false): any {
    const group: any = this.window.document.createXULElement("tab-group", { is: "tab-group" });
    group.id = id;
    group.collapsed = collapsed;
    group.color = color;
    group.label = label;
    group.wasCreatedByAdoption = isAdoptingGroup;
    return group;
  },

  /**
   * Make a group out of `tabs` (a new <tab-group> in the strip, the tabs
   * moved into it). Returns null when nothing groupable was given.
   */
  addTabGroup(
    tabs: MozTabbrowserTab[],
    {
      id = null,
      color = null,
      label = "",
      insertBefore = null,
      isAdoptingGroup = false,
      isUserTriggered = false,
      telemetryUserCreateSource = "unknown",
    }: any = {},
  ): any {
    if (!tabs?.length) {
      throw new Error("Cannot create tab group with zero tabs");
    }

    if (!color) {
      color = this.tabGroupMenu.nextUnusedColor;
    }

    if (!id) {
      // Note: If this changes, make sure to also update the
      // getExtTabGroupIdForInternalTabGroupId implementation in
      // browser/components/extensions/parent/ext-browser.js.
      // See: Bug 1960104 - Improve tab group ID generation in addTabGroup
      id = `${Date.now()}-${Math.round(Math.random() * 100)}`;
    }
    const group = this._createTabGroup(id, color, false, label, isAdoptingGroup);
    this.tabContainer.insertBefore(group, insertBefore?.group ?? insertBefore);
    group.addTabs(tabs);

    // Bail out if the group is empty at this point. This can happen if all
    // provided tabs are pinned and therefore cannot be grouped.
    if (!group.tabs.length) {
      group.remove();
      return null;
    }

    if (isUserTriggered) {
      group.dispatchEvent(
        new CustomEvent("TabGroupCreateByUser", {
          bubbles: true,
          detail: {
            telemetryUserCreateSource,
          },
        }),
      );
    }

    // Fixes bug1953801 and bug1954689
    // Ensure that the tab state cache is updated immediately after creating
    // a group. This is necessary because we consider group creation a
    // deliberate user action indicating the tab has importance for the user.
    // Without this, it is not possible to save and close a tab group with
    // a short lifetime.
    group.tabs.forEach((tab: any) => {
      this.TabStateFlusher.flush(tab.linkedBrowser);
    });

    return group;
  },

  /**
   * Close a group and every tab in it. TabGroupRemoveRequested goes out
   * first, while the tabs are still grouped, so SessionStore can save it.
   */
  async removeTabGroup(group: MozTabbrowserTabGroup, options: any = {}): Promise<void> {
    options = { isUserTriggered: false, telemetrySource: this.TabMetrics.METRIC_SOURCE.UNKNOWN, ...options };
    if (this.tabGroupMenu.panel.state != "closed") {
      this.tabGroupMenu.panel.hidePopup(options.animate);
    }

    if (!options.skipPermitUnload) {
      // Process permit unload handlers and allow user cancel
      const cancel = await this.runBeforeUnloadForTabs(group.tabs);
      if (cancel) {
        if (SessionStore.getSavedTabGroup(group.id)) {
          // If this group is currently saved, it's being removed as part of a
          // save & close operation. We need to forget the saved group
          // if the close is canceled.
          SessionStore.forgetSavedTabGroup(group.id);
        }
        return;
      }
      options.skipPermitUnload = true;
    }

    if (group.tabs.length == this.tabs.length) {
      // explicit calls to removeTabGroup are not expected to save groups.
      // if removing this group closes a window, we need to tell the window
      // not to save the group.
      (group as any).saveOnWindowClose = false;
    }

    // This needs to be fired before tabs are removed because session store
    // needs to respond to this while tabs are still part of the group
    group.dispatchEvent(
      new CustomEvent("TabGroupRemoveRequested", {
        bubbles: true,
        detail: {
          skipSessionStore: options.skipSessionStore,
          isUserTriggered: options.isUserTriggered,
          telemetrySource: options.telemetrySource,
        },
      }),
    );

    // Skip session store on a per-tab basis since these tabs will get
    // recorded as part of a group
    options.skipSessionStore = true;

    // tell removeTabs not to subprocess groups since we're removing a group.
    options.skipGroupCheck = true;

    this.removeTabs(group.tabs, options);
  },

  /** Take `tab` out of its group: it lands right after the group in the strip. */
  ungroupTab(tab: MozTabbrowserTab) {
    if (!tab.group) {
      return;
    }

    this._handleTabMove(tab, () =>
      this.tabContainer.insertBefore(tab, (tab.group as any).nextElementSibling),
    );
  },

  /** Move one tab into `group` (pinned tabs stay where they are). */
  moveTabToGroup(aTab: MozTabbrowserTab, aGroup: any, metricsContext?: any) {
    if (!this.isTab(aTab)) {
      throw new Error("Can only move a tab into a tab group");
    }
    if (aTab.pinned) {
      return;
    }
    if (aTab.group && (aTab.group as any).id === aGroup.id) {
      return;
    }

    this._handleTabMove(aTab, () => aGroup.appendChild(aTab), metricsContext);
    this.removeFromMultiSelectedTabs(aTab);
    this.tabContainer._notifyBackgroundTab(aTab);
  },

  /** Ours: the name some callers use for moveTabToGroup. */
  moveTabToExistingGroup(tab: MozTabbrowserTab, group: any) {
    this.moveTabToGroup(tab, group);
  },

  /** Bring a group over from another window: adopt its tabs, then regroup them here. */
  adoptTabGroup(group: MozTabbrowserTabGroup, { elementIndex, tabIndex, selectTab }: any = {}): any {
    const g = group as any;
    if (g.ownerDocument == this.window.document) {
      return group;
    }
    g.removedByAdoption = true;
    g.saveOnWindowClose = false;

    const oldSelectedTab = selectTab && g.ownerGlobal.gBrowser.selectedTab;
    const newTabs: any[] = [];

    // bug1969925 adopting a tab group will cause the window to close if it
    // is the only thing on the tab strip
    // In this case, the `TabUngrouped` event will not fire, so we have to do it manually
    const noOtherTabsInWindow = g.ownerGlobal.gBrowser.nonHiddenTabs.every((t: any) => t.group == group);

    for (const tab of g.tabs) {
      if (noOtherTabsInWindow) {
        g.dispatchEvent(
          new CustomEvent("TabUngrouped", {
            bubbles: true,
            detail: tab,
          }),
        );
      }
      const adoptedTab = this.adoptTab(tab, {
        elementIndex,
        tabIndex,
        selectTab: tab === oldSelectedTab,
      });
      newTabs.push(adoptedTab);
      // Put next tab after current one.
      elementIndex = undefined;
      tabIndex = adoptedTab._tPos + 1;
    }

    return this.addTabGroup(newTabs, {
      id: g.id,
      label: g.label,
      color: g.color,
      insertBefore: newTabs[0],
      isAdoptingGroup: true,
    });
  },

  /** Every tab group in every window of this kind (private or not). */
  getAllTabGroups({ sortByLastSeenActive = false }: any = {}): any[] {
    const win = this.window as any;
    const groups: any[] = BrowserWindowTracker.getOrderedWindows({
      private: win.PrivateBrowsingUtils.isWindowPrivate(win),
    }).reduce((acc: any[], thisWindow: any) => acc.concat(thisWindow.gBrowser.tabGroups), []);
    if (sortByLastSeenActive) {
      groups.sort((group1, group2) => group2.lastSeenActive - group1.lastSeenActive);
    }
    return groups;
  },

  getTabGroupById(id: string): any {
    const win = this.window as any;
    for (const w of BrowserWindowTracker.getOrderedWindows({
      private: win.PrivateBrowsingUtils.isWindowPrivate(win),
    })) {
      for (const group of w.gBrowser.tabGroups) {
        if (group.id === id) {
          return group;
        }
      }
    }
    return null;
  },

  // ==========================================================================
  // Multi-selection
  // tabbrowser.js L6568~L6854
  // ==========================================================================

  _updateMultiselectedTabCloseButtonTooltip() {
    const doc = this.window.document as any;
    const tabCount = this.selectedTabs.length;
    this.selectedTabs.forEach((selectedTab) => {
      doc.l10n.setArgs(selectedTab.querySelector(".tab-close-button"), {
        tabCount,
      });
    });
  },

  addToMultiSelectedTabs(aTab: MozTabbrowserTab) {
    if (aTab.multiselected) {
      return;
    }

    aTab.setAttribute("multiselected", "true");
    aTab.setAttribute("aria-selected", "true");
    this._multiSelectedTabsSet.add(aTab);
    this._startMultiSelectChange();
    if (this._multiSelectChangeRemovals.has(aTab)) {
      this._multiSelectChangeRemovals.delete(aTab);
    } else {
      this._multiSelectChangeAdditions.add(aTab);
    }

    this._updateMultiselectedTabCloseButtonTooltip();
  },

  /** Every visible tab from one to the other, inclusive, joins the selection. */
  addRangeToMultiSelectedTabs(aTab1: MozTabbrowserTab, aTab2: MozTabbrowserTab) {
    if (aTab1 == aTab2) {
      return;
    }

    const tabs = this.visibleTabs;
    const indexOfTab1 = tabs.indexOf(aTab1);
    const indexOfTab2 = tabs.indexOf(aTab2);

    const [lowerIndex, higherIndex] =
      indexOfTab1 < indexOfTab2
        ? [Math.max(0, indexOfTab1), indexOfTab2]
        : [Math.max(0, indexOfTab2), indexOfTab1];

    for (let i = lowerIndex; i <= higherIndex; i++) {
      this.addToMultiSelectedTabs(tabs[i]);
    }

    this._updateMultiselectedTabCloseButtonTooltip();
  },

  removeFromMultiSelectedTabs(aTab: MozTabbrowserTab) {
    if (!aTab.multiselected) {
      return;
    }
    aTab.removeAttribute("multiselected");
    aTab.removeAttribute("aria-selected");
    this._multiSelectedTabsSet.delete(aTab);
    this._startMultiSelectChange();
    if (this._multiSelectChangeAdditions.has(aTab)) {
      this._multiSelectChangeAdditions.delete(aTab);
    } else {
      this._multiSelectChangeRemovals.add(aTab);
    }
    // Update labels for Close buttons of the remaining multiselected tabs:
    this._updateMultiselectedTabCloseButtonTooltip();
    // Update the label for the Close button of the tab being removed
    // from the multiselection:
    (this.window.document as any).l10n.setArgs(aTab.querySelector(".tab-close-button"), {
      tabCount: 1,
    });
  },

  clearMultiSelectedTabs() {
    if (this._clearMultiSelectionLocked) {
      if (this._clearMultiSelectionLockedOnce) {
        this._clearMultiSelectionLockedOnce = false;
        this._clearMultiSelectionLocked = false;
      }
      return;
    }

    if (this.multiSelectedTabsCount < 1) {
      return;
    }

    for (const tab of this.selectedTabs) {
      this.removeFromMultiSelectedTabs(tab);
    }
    this._lastMultiSelectedTabRef = null;
  },

  selectAllTabs() {
    const visibleTabs = this.visibleTabs;
    this.addRangeToMultiSelectedTabs(visibleTabs[0], visibleTabs[visibleTabs.length - 1]);
  },

  allTabsSelected(): boolean {
    return this.visibleTabs.length == 1 || this.visibleTabs.every((t) => t.multiselected);
  },

  lockClearMultiSelectionOnce() {
    this._clearMultiSelectionLockedOnce = true;
    this._clearMultiSelectionLocked = true;
  },

  unlockClearMultiSelection() {
    this._clearMultiSelectionLockedOnce = false;
    this._clearMultiSelectionLocked = false;
  },

  _avoidSingleSelectedTab() {
    if (this.multiSelectedTabsCount == 1) {
      this.clearMultiSelectedTabs();
    }
  },

  _switchToNextMultiSelectedTab() {
    this._clearMultiSelectionLocked = true;

    // Guarantee that _clearMultiSelectionLocked lock gets released.
    try {
      const lastMultiSelectedTab = this.lastMultiSelectedTab as any;
      if (!lastMultiSelectedTab.selected) {
        this.selectedTab = lastMultiSelectedTab;
      } else {
        const selectedTabs = ChromeUtils.nondeterministicGetWeakSetKeys(this._multiSelectedTabsSet).filter(
          this._mayTabBeMultiselected,
        );
        this.selectedTab = selectedTabs.at(-1);
      }
    } catch (e) {
      console.error(e);
    }

    this._clearMultiSelectionLocked = false;
  },

  set selectedTabs(tabs: MozTabbrowserTab[]) {
    this.clearMultiSelectedTabs();
    this.selectedTab = tabs[0];
    if (tabs.length > 1) {
      for (const tab of tabs) {
        this.addToMultiSelectedTabs(tab);
      }
    }
  },

  /** The multi-selected tabs in strip order; the selected tab counts even when not marked. */
  get selectedTabs(): MozTabbrowserTab[] {
    const { selectedTab, _multiSelectedTabsSet } = this;
    const tabs: any[] = ChromeUtils.nondeterministicGetWeakSetKeys(_multiSelectedTabsSet).filter(
      this._mayTabBeMultiselected,
    );
    if (
      (!_multiSelectedTabsSet.has(selectedTab) && this._mayTabBeMultiselected(selectedTab)) ||
      !tabs.length
    ) {
      tabs.push(selectedTab);
    }
    return tabs.sort((a, b) => a._tPos - b._tPos);
  },

  get multiSelectedTabsCount(): number {
    return ChromeUtils.nondeterministicGetWeakSetKeys(this._multiSelectedTabsSet).filter(
      this._mayTabBeMultiselected,
    ).length;
  },

  get lastMultiSelectedTab(): MozTabbrowserTab | null {
    const tab = this._lastMultiSelectedTabRef ? (this._lastMultiSelectedTabRef as any).get() : null;
    if (tab && tab.isConnected && this._multiSelectedTabsSet.has(tab)) {
      return tab;
    }
    const selectedTab = this.selectedTab;
    this.lastMultiSelectedTab = selectedTab;
    return selectedTab;
  },

  set lastMultiSelectedTab(aTab: MozTabbrowserTab | null) {
    this._lastMultiSelectedTabRef = Cu.getWeakReference(aTab);
  },

  _mayTabBeMultiselected(aTab: MozTabbrowserTab): boolean {
    return (aTab as any).visible;
  },

  /** Batch multi-selection changes; the TabMultiSelect event goes out on the next microtask. */
  _startMultiSelectChange() {
    if (!this._multiSelectChangeStarted) {
      this._multiSelectChangeStarted = true;
      Promise.resolve().then(() => this._endMultiSelectChange());
    }
  },

  _endMultiSelectChange() {
    let noticeable = false;
    const { selectedTab } = this;
    if (this._multiSelectChangeAdditions.size) {
      if (!selectedTab.multiselected) {
        this.addToMultiSelectedTabs(selectedTab);
      }
      noticeable = true;
    }
    if (this._multiSelectChangeRemovals.size) {
      if (this._multiSelectChangeRemovals.has(selectedTab)) {
        this._switchToNextMultiSelectedTab();
      }
      this._avoidSingleSelectedTab();
      noticeable = true;
    }
    this._multiSelectChangeStarted = false;
    if (noticeable || this._multiSelectChangeSelected) {
      this._multiSelectChangeSelected = false;
      this._multiSelectChangeAdditions.clear();
      this._multiSelectChangeRemovals.clear();
      this.dispatchEvent(new CustomEvent("TabMultiSelect", { bubbles: true }));
    }
  },

  toggleMuteAudioOnMultiSelectedTabs(aTab: MozTabbrowserTab) {
    const tabMuted = aTab.linkedBrowser!.audioMuted;
    const tabsToToggle = this.selectedTabs.filter((tab) => tab.linkedBrowser!.audioMuted == tabMuted);
    for (const tab of tabsToToggle) {
      (tab as any).toggleMuteAudio();
    }
  },

  resumeDelayedMediaOnMultiSelectedTabs() {
    for (const tab of this.selectedTabs) {
      (tab as any).resumeDelayedMedia();
    }
  },

  pinMultiSelectedTabs() {
    for (const tab of this.selectedTabs) {
      this.pinTab(tab);
    }
  },

  unpinMultiSelectedTabs() {
    // The selectedTabs getter returns the tabs
    // in visual order. We need to unpin in reverse
    // order to maintain visual order.
    const selectedTabs = this.selectedTabs;
    for (let i = selectedTabs.length - 1; i >= 0; i--) {
      const tab = selectedTabs[i];
      this.unpinTab(tab);
    }
  },

  reloadMultiSelectedTabs() {
    this.reloadTabs(this.selectedTabs);
  },

  reloadTabs(tabs: MozTabbrowserTab[]) {
    for (const tab of tabs) {
      try {
        (this.getBrowserForTab(tab) as any).reload();
      } catch (_e) {
        // ignore failure to reload so others will be reloaded
      }
    }
  },

  /** A user reload: temporary permissions and auth-prompt throttling reset too. */
  reloadTab(aTab: MozTabbrowserTab) {
    const win = this.window as any;
    const browser = this.getBrowserForTab(aTab) as any;
    // Reset temporary permissions on the current tab. This is done here
    // because we only want to reset permissions on user reload.
    win.SitePermissions.clearTemporaryBlockPermissions(browser);
    // Also reset DOS mitigations for the basic auth prompt on reload.
    delete browser.authPromptAbuseCounter;
    win.gIdentityHandler.hidePopup();
    win.gPermissionPanel.hidePopup();
    browser.reload();
  },

  // ==========================================================================
  // Succession and blur
  // tabbrowser.js L5339~L5408, L7912~L7944
  // ==========================================================================

  /** The tab to select when `aTab` closes or hides; null when aTab is not selected. */
  _findTabToBlurTo(aTab: MozTabbrowserTab, aExcludeTabs: MozTabbrowserTab[] = []): MozTabbrowserTab | null {
    const win = this.window as any;
    if (!aTab.selected) {
      return null;
    }
    if (win.FirefoxViewHandler.tab) {
      aExcludeTabs.push(win.FirefoxViewHandler.tab);
    }

    const excludeTabs = new Set(aExcludeTabs);

    // If this tab has a successor, it should be selectable, since
    // hiding or closing a tab removes that tab as a successor.
    if (aTab.successor && !excludeTabs.has(aTab.successor)) {
      return aTab.successor;
    }

    if (
      aTab.owner?.visible &&
      !excludeTabs.has(aTab.owner) &&
      Services.prefs.getBoolPref("browser.tabs.selectOwnerOnClose")
    ) {
      return aTab.owner;
    }

    // Try to find a remaining tab that comes after the given tab
    const remainingTabs = Array.prototype.filter.call(this.visibleTabs, (tab: any) => !excludeTabs.has(tab));

    let tab = this.tabContainer.findNextTab(aTab, {
      direction: 1,
      filter: (_tab: any) => remainingTabs.includes(_tab),
    });

    if (!tab) {
      tab = this.tabContainer.findNextTab(aTab, {
        direction: -1,
        filter: (_tab: any) => remainingTabs.includes(_tab),
      });
    }

    if (tab) {
      return tab;
    }

    // If no qualifying visible tab was found, see if there is a tab in
    // a collapsed tab group that could be selected.
    const eligibleTabs = new Set(this.tabsInCollapsedTabGroups).difference(excludeTabs);

    tab = this.tabContainer.findNextTab(aTab, {
      direction: 1,
      filter: (_tab: any) => eligibleTabs.has(_tab),
    });

    if (!tab) {
      tab = this.tabContainer.findNextTab(aTab, {
        direction: -1,
        filter: (_tab: any) => eligibleTabs.has(_tab),
      });
    }

    return tab;
  },

  _blurTab(aTab: MozTabbrowserTab) {
    this.selectedTab = this._findTabToBlurTo(aTab);
  },

  setSuccessor(aTab: MozTabbrowserTab, successorTab: MozTabbrowserTab | null) {
    const win = this.window;
    if (aTab.ownerGlobal != win) {
      throw new Error("Cannot set the successor of another window's tab");
    }
    if (successorTab == aTab) {
      successorTab = null;
    }
    if (successorTab && successorTab.ownerGlobal != win) {
      throw new Error("Cannot set the successor to another window's tab");
    }
    if (aTab.successor) {
      (aTab.successor as any).predecessors.delete(aTab);
    }
    aTab.successor = successorTab;
    if (successorTab) {
      const s = successorTab as any;
      if (!s.predecessors) {
        s.predecessors = new Set();
      }
      s.predecessors.add(aTab);
    }
  },

  /** Everyone whose successor was `aTab` now points at `aOtherTab`. */
  replaceInSuccession(aTab: MozTabbrowserTab, aOtherTab: MozTabbrowserTab | null) {
    const predecessors = (aTab as any).predecessors;
    if (predecessors) {
      for (const predecessor of Array.from(predecessors) as any[]) {
        this.setSuccessor(predecessor, aOtherTab);
      }
    }
  },

  // ==========================================================================
  // Ranges and bulk moves
  // tabbrowser.js L3791~L3804, L4082~L4132, L4259~L4283, L6131~L6151
  // ==========================================================================

  _getTabsToTheStartFrom(aTab: MozTabbrowserTab): MozTabbrowserTab[] {
    const tabsToStart: MozTabbrowserTab[] = [];
    if (!(aTab as any).visible) {
      return tabsToStart;
    }
    const tabs = this.openTabs;
    for (let i = 0; i < tabs.length; ++i) {
      if (tabs[i] == aTab) {
        break;
      }
      // Ignore pinned and hidden tabs.
      if (tabs[i].pinned || tabs[i].hidden) {
        continue;
      }
      // In a multi-select context, select all unselected tabs
      // starting from the context tab.
      if (aTab.multiselected && tabs[i].multiselected) {
        continue;
      }
      tabsToStart.push(tabs[i]);
    }
    return tabsToStart;
  },

  _getTabsToTheEndFrom(aTab: MozTabbrowserTab): MozTabbrowserTab[] {
    const tabsToEnd: MozTabbrowserTab[] = [];
    if (!(aTab as any).visible) {
      return tabsToEnd;
    }
    const tabs = this.openTabs;
    for (let i = tabs.length - 1; i >= 0; --i) {
      if (tabs[i] == aTab) {
        break;
      }
      // Ignore pinned and hidden tabs.
      if (tabs[i].pinned || tabs[i].hidden) {
        continue;
      }
      // In a multi-select context, select all unselected tabs
      // starting from the context tab.
      if (aTab.multiselected && tabs[i].multiselected) {
        continue;
      }
      tabsToEnd.push(tabs[i]);
    }
    return tabsToEnd;
  },

  removeTabsToTheStartFrom(aTab: MozTabbrowserTab, options?: any) {
    const tabs = this._getTabsToTheStartFrom(aTab);
    if (!this.warnAboutClosingTabs(tabs.length, this.closingTabsEnum.TO_START)) {
      return;
    }

    this.removeTabs(tabs, options);
  },

  removeTabsToTheEndFrom(aTab: MozTabbrowserTab, options?: any) {
    const tabs = this._getTabsToTheEndFrom(aTab);
    if (!this.warnAboutClosingTabs(tabs.length, this.closingTabsEnum.TO_END)) {
      return;
    }

    this.removeTabs(tabs, options);
  },

  moveTabsToStart(contextTab: MozTabbrowserTab) {
    const tabs = contextTab.multiselected ? this.selectedTabs : [contextTab];
    // Walk the array in reverse order so the tabs are kept in order.
    for (let i = tabs.length - 1; i >= 0; i--) {
      this.moveTabToStart(tabs[i]);
    }
  },

  moveTabsToEnd(contextTab: MozTabbrowserTab) {
    const tabs = contextTab.multiselected ? this.selectedTabs : [contextTab];
    for (const tab of tabs) {
      this.moveTabToEnd(tab);
    }
  },

  moveTabsBefore(elements: any[], targetElement: any, metricsContext?: any) {
    this._moveTabsNextTo(elements, targetElement, true, metricsContext);
  },

  moveTabsAfter(elements: any[], targetElement: any, metricsContext?: any) {
    this._moveTabsNextTo(elements, targetElement, false, metricsContext);
  },

  _updateTabBarForPinnedTabs() {
    this.tabContainer._unlockTabSizing();
    this.tabContainer._handleTabSelect(true);
    this.tabContainer._updateCloseButtons();
  },

  _updateTabsAfterInsert() {
    for (let i = 0; i < this.tabs.length; i++) {
      (this.tabs[i] as any)._tPos = i;
      (this.tabs[i] as any)._selected = false;
    }

    // If we're in the midst of an async tab switch while calling
    // moveTabTo, we can get into a case where _visuallySelected
    // is set to true on two different tabs.
    //
    // What we want to do in moveTabTo is to remove logical selection
    // from all tabs, and then re-add logical selection to selectedTab
    // (and visual selection as well if we're not running with e10s, which
    // setting _selected will do automatically).
    //
    // If we're running with e10s, then the visual selection will not
    // be changed, which is fine, since if we weren't in the midst of a
    // tab switch, the previously visually selected tab should still be
    // correct, and if we are in the midst of a tab switch, then the async
    // tab switcher will set the visually selected tab once the tab switch
    // has completed.
    if (this.selectedTab) this.selectedTab._selected = true;
  },

  // upstream: _determineURIToLoad@088582c0e6 FIREFOX_143_0_1_RELEASE
  _determineURIToLoad(uriString: string, createLazyBrowser: boolean): any {
    uriString = uriString || "about:blank";
    let aURIObject = null;
    try {
      aURIObject = Services.io.newURI(uriString);
    } catch (_ex) {
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
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
