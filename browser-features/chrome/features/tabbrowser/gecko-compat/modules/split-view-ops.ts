// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L3218~L3367
// Section: Split View Operations · Adjacent Tab Operations

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { appState, send } from "../../state/store.ts";
import * as GroupOps from "../../ops/group-ops.ts";
import { DOMRegistry } from "../DOMRegistry.ts";
import type { TabId, SplitViewId } from "../../types/TabState.ts";
import { resolveTabId, dispatch } from "../compat-helpers.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    addAdjacentNewTab(tab: MozTabbrowserTab): void;
    addAdjacentTab(adjacentTab: any, uriString: string, options?: any): any;
    isSplitViewWrapper(element: any): boolean;
    moveTabToSplitView(tab: MozTabbrowserTab, splitViewWrapper: any): void;
    moveSplitViewToExistingGroup(splitView: any, group: MozTabbrowserTabGroup, metricsContext?: any): void;
    showSplitViewPanels(tabs: MozTabbrowserTab[]): void;
    hideSplitViewPanels(tabs: MozTabbrowserTab[]): void;
    openSplitViewMenu(anchorElement: any): void;
    replaceTabWithWindow(tab: MozTabbrowserTab, options?: any): any;
    replaceTabsWithWindow(contextTab: any, options?: any): any;
    replaceGroupWithWindow(group: MozTabbrowserTabGroup): any;
    ungroupSplitView(splitView: any): void;
    createTabsForSessionRestore(
      restoreTabsLazily: boolean,
      selectTab: number,
      tabDataList: any[],
      tabGroupDataList: any[]
    ): any[];
  }
}

export const methods = {
  // ==========================================================================
  // Split View & Adjacent Tab Operations
  // tabbrowser.js L3218~L3367
  // noraneko extension — no direct tabbrowser.js equivalent
  // ==========================================================================

  /**
   * Opens a new blank tab immediately after `tab` in the tab strip.
   *
   * The new tab inherits the user-context ID and group of `tab` and receives
   * focus in the URL bar.
   */
  // upstream: addAdjacentNewTab@5ab49fa4ca FIREFOX_143_0_1_RELEASE
  addAdjacentNewTab(tab: MozTabbrowserTab) {
    try {
      Services.obs?.notifyObservers?.(
        {
          wrappedJSObject: new Promise(resolve => {
            this.selectedTab = this.addTrustedTab("about:newtab", {
              tabIndex: (tab as any)._tPos + 1,
              userContextId: (tab as any).userContextId,
              tabGroup: (tab as any).group,
              focusUrlBar: true,
            });
            resolve(this.selectedBrowser);
          }),
        },
        "browser-open-newtab-start"
      );
    } catch (_) { /* */ }
  },

  /**
   * Opens `uriString` in a new tab placed immediately after `adjacentTab`.
   *
   * When `adjacentTab` belongs to a group and no explicit `options.tabGroup`
   * is provided, the tab is inserted after the last tab in that group.
   *
   * @returns The newly created tab.
   */
  addAdjacentTab(adjacentTab: MozTabbrowserTab, uriString: string, options: any = {}): any {
    // Insert tab after adjacent tab, or after its group if it's in one
    const tabIndex =
      !options.tabGroup && (adjacentTab as any).group
        ? (adjacentTab as any).group.tabs.at(-1)?._tPos + 1
        : (adjacentTab as any)._tPos + 1;

    return this.addTab(uriString, {
      ...options,
      tabIndex,
    });
  },

  /**
   * Returns `true` if `element` is a `tab-split-view-wrapper` custom element.
   */
  isSplitViewWrapper(element: any): boolean {
    return element?.tagName === "tab-split-view-wrapper" ||
           element?.localName === "tab-split-view-wrapper";
  },

  /**
   * Moves `tab` into the given split-view wrapper element.
   *
   * Pinned tabs and tabs already belonging to the same split view are
   * silently ignored.
   *
   * @throws When `tab` is not a recognised tab element.
   */
  moveTabToSplitView(tab: MozTabbrowserTab, splitViewWrapper: any) {
    if (!this.isTab(tab)) {
      throw new Error("Can only move a tab into a split view wrapper");
    }
    if ((tab as any).pinned) {
      return;
    }
    if (
      (tab as any).splitview &&
      (tab as any).splitview.splitViewId === splitViewWrapper.splitViewId
    ) {
      return;
    }

    // Use native tabContainer methods if available
    try {
      (this as any)._handleTabMove?.(tab, () => splitViewWrapper.appendChild(tab));
      this.removeFromMultiSelectedTabs(tab);
      this.tabContainer?._notifyBackgroundTab?.(tab);
    } catch (_) { /* */ }
  },

  /**
   * Moves an entire split-view wrapper into an existing tab group.
   *
   * @param metricsContext - Optional context object forwarded to the internal
   *                         move handler for telemetry purposes.
   * @throws When `splitView` is not a split-view wrapper element.
   */
  moveSplitViewToExistingGroup(splitView: any, group: any, metricsContext: any = null) {
    if (!this.isSplitViewWrapper(splitView)) {
      throw new Error("Can only move a split view into a tab group");
    }
    if (splitView.group && splitView.group.id === group.id) {
      return;
    }

    const splitViewTabs = splitView.tabs;
    try {
      (this as any)._handleTabMove?.(
        splitView,
        () => group.appendChild(splitView),
        metricsContext
      );
      for (const tab of splitViewTabs) {
        this.removeFromMultiSelectedTabs(tab);
        this.tabContainer?._notifyBackgroundTab?.(tab);
      }
    } catch (_) { /* */ }
  },

  /**
   * Ensures each tab's browser panel is inserted and activates its docShell.
   *
   * Registers all panel IDs with the tabpanels element so they are rendered
   * side-by-side in split view.
   */
  showSplitViewPanels(tabs: MozTabbrowserTab[]) {
    const panels: string[] = [];
    for (const tab of tabs) {
      this._insertBrowser(tab, false);
      (this as any)._insertSplitViewFooter?.(tab);
      const browser = (tab as any).linkedBrowser;
      if (browser) {
        browser.docShellIsActive = true;
      }
      panels.push((tab as any).linkedPanel);
    }
    const tabpanels = this.window.document.getElementById("tabbrowser-tabpanels");
    if (tabpanels) {
      (tabpanels as any).splitViewPanels = panels;
    }
  },

  /**
   * Removes each tab's panel from the split-view rendering list.
   */
  hideSplitViewPanels(tabs: MozTabbrowserTab[]) {
    for (const tab of tabs) {
      const tabpanels = this.window.document.getElementById("tabbrowser-tabpanels");
      (tabpanels as any)?.removePanelFromSplitView?.((tab as any).linkedPanel);
    }
  },

  /**
   * Opens the split-view context menu anchored to `anchorElement`.
   */
  openSplitViewMenu(anchorElement: any) {
    try {
      const menu = this.window.document.getElementById("split-view-menu") as XULPopupElement | null;
      menu?.openPopup?.(anchorElement, "after_start");
    } catch (_) { /* */ }
  },

  /**
   * Tears `tab` out of the current window and moves it into a new browser window.
   *
   * Returns `null` when the toolbar is hidden (popup windows) or window
   * creation fails.
   *
   * @returns The new `Window`, or `null` on failure.
   */
  // upstream: replaceTabWithWindow@e05472bb7d FIREFOX_143_0_1_RELEASE
  replaceTabWithWindow(tab: MozTabbrowserTab, options: any = {}): any {
    // Move tab to new window
    try {
      if ((this.window as any).toolbar?.visible === false) {
        return null;
      }

      const winFeatures = "chrome,dialog=no,all";
      const newWin = this.window.openDialog?.(
        AppConstants.BROWSER_CHROME_URL,
        "_blank",
        winFeatures
      );

      if (!newWin) return null;

      const delayedStartupPromise = new Promise(resolve => {
        Services.obs?.addObserver?.({
          observe(subject: any) {
            if (subject === newWin) {
              Services.obs?.removeObserver?.(this, "browser-delayed-startup-finished");
              resolve(null);
            }
          },
        }, "browser-delayed-startup-finished");
      });

      delayedStartupPromise.then(() => {
        if (newWin.gBrowser) {
          newWin.gBrowser.swapBrowsersAndCloseOther?.(
            newWin.gBrowser.selectedTab,
            tab
          );
        }
      });

      return newWin;
    } catch (_) {
      return null;
    }
  },

  /**
   * Moves all currently selected tabs (or `contextTab` if not multi-selected)
   * into a new browser window.
   *
   * @returns The new `Window`, or `null` when there is nothing to move.
   */
  // upstream: replaceTabsWithWindow@354f106a94 FIREFOX_143_0_1_RELEASE
  replaceTabsWithWindow(contextTab: any, options: any = {}): any {
    // If only one tab selected or context tab not multi-selected, use single tab
    if (this.selectedTabs.length === 1 || !this.selectedTabs.includes(contextTab)) {
      return this.replaceTabWithWindow(contextTab, options);
    }

    const tabs = this.selectedTabs.filter((t: any) => t !== this.selectedTab);
    if (tabs.length === 0) {
      return null;
    }

    if (tabs.length === 1) {
      return this.replaceTabWithWindow(tabs[0], options);
    }

    // Multiple tabs: move selected tab to new window, then move others
    const selectedTab = this.selectedTab;
    const win = this.replaceTabWithWindow(selectedTab, options);

    if (win) {
      const delayedStartupPromise = new Promise(resolve => {
        Services.obs?.addObserver?.({
          observe(subject: any) {
            if (subject === win) {
              Services.obs?.removeObserver?.(this, "browser-delayed-startup-finished");
              resolve(null);
            }
          },
        }, "browser-delayed-startup-finished");
      });

      delayedStartupPromise.then(() => {
        if (win.gBrowser) {
          for (const tab of tabs) {
            win.gBrowser.adoptTab?.(tab);
          }
        }
      });
    }

    return win;
  },

  /**
   * Moves the entire tab group to a new browser window.
   *
   * @returns The new `Window`, or `null` if the group is empty.
   */
  // upstream: replaceGroupWithWindow@be9b539537 FIREFOX_143_0_1_RELEASE
  replaceGroupWithWindow(group: MozTabbrowserTabGroup): any {
    // Move entire tab group to new window
    if (!group?.tabs?.length) return null;
    return this.replaceTabWithWindow(group.tabs[0]);
  },

  /**
   * Removes `tab` from its tab group and fires a `TabUngrouped` event.
   *
   * Does nothing if the tab is not currently in a group.
   */

  /**
   * Removes every tab in `splitView` from its tab group.
   *
   * Does nothing if `splitView` is not a split-view wrapper element.
   */
  ungroupSplitView(splitView: MozSplitView) {
    // Remove split view from its group
    if (!this.isSplitViewWrapper(splitView)) return;
    const tabs = splitView.tabs;
    for (const tab of tabs) {
      this.ungroupTab(tab);
    }
  },

  /**
   * Recreates a set of tabs from session-restore data.
   *
   * Builds tabs and tab-group DOM fragments in a single batch to minimise
   * reflows, then selects the appropriate tab.
   *
   * @param restoreTabsLazily - When `true`, non-selected non-pinned tabs are
   *                            created with lazy browsers.
   * @param selectTab         - 1-based index of the tab to select after restore.
   * @param tabDataList       - Serialised tab state objects from SessionStore.
   * @param tabGroupDataList  - Serialised tab-group state objects from SessionStore.
   * @returns Array of created (or reused) tab elements in restore order.
   */
  // upstream: createTabsForSessionRestore@27d532f24c FIREFOX_143_0_1_RELEASE
  createTabsForSessionRestore(
    restoreTabsLazily: boolean,
    selectTab: number,
    tabDataList: any[],
    tabGroupDataList: any[]
  ): any[] {
    const tabs: any[] = [];
    const tabsFragment = this.window.document.createDocumentFragment();
    let tabToSelect: any = null;
    const hiddenTabs = new Map();
    const tabGroupWorkingData = new Map();

    // Create tab group fragments
    for (const tabGroupData of tabGroupDataList) {
      tabGroupWorkingData.set(tabGroupData.id, {
        stateData: tabGroupData,
        node: undefined,
        containingTabsFragment: this.window.document.createDocumentFragment(),
      });
    }

    // Create tabs
    for (let i = 0; i < tabDataList.length; i++) {
      const tabData = tabDataList[i];
      const userContextId = tabData.userContextId;
      const select = i === selectTab - 1;
      let tab: any;
      let tabWasReused = false;

      // Reuse selected tab if possible
      if (
        select &&
        (this.selectedTab as any).userContextId === userContextId &&
        !SessionStore?.isTabRestoring?.(this.selectedTab) &&
        !this.tabContainer?.verticalMode
      ) {
        tabWasReused = true;
        tab = this.selectedTab;
        if (!tabData.pinned) {
          this.unpinTab(tab);
        } else {
          this.pinTab(tab);
        }
      }

      // Add new tab if needed
      if (!tab) {
        const createLazyBrowser = restoreTabsLazily && !select && !tabData.pinned;
        let url = "about:blank";
        if (tabData.entries?.length) {
          const activeIndex = Math.min(
            Math.max((tabData.index || tabData.entries.length) - 1, 0),
            tabData.entries.length - 1
          );
          url = tabData.entries[activeIndex].url;
        }

        const preferredRemoteType = E10SUtils.getRemoteTypeForURI?.(
          url,
          gMultiProcessBrowser,
          gFissionBrowser,
          E10SUtils.DEFAULT_REMOTE_TYPE,
          null,
          E10SUtils.predictOriginAttributes?.({ window: this.window, userContextId })
        );

        tab = this.addTrustedTab(createLazyBrowser ? url : "about:blank", {
          createLazyBrowser,
          skipAnimation: true,
          noInitialLabel: true,
          userContextId,
          skipBackgroundNotify: true,
          bulkOrderedOpen: true,
          insertTab: false,
          skipLoad: true,
          preferredRemoteType,
        });

        if (select) {
          tabToSelect = tab;
        }
      }

      tabs.push(tab);

      // Handle pinned tabs
      if (tabData.pinned) {
        this.pinTab(tab);
        this._fireTabOpen(tab, {});
      } else if (tabData.groupId) {
        // Handle grouped tabs
        const tabGroup = tabGroupWorkingData.get(tabData.groupId);
        if (tabGroup) {
          tabGroup.containingTabsFragment.appendChild(tab);
          if (!tabGroup.node) {
            tabGroup.node = (this as any)._createTabGroup?.(
              tabGroup.stateData.id,
              tabGroup.stateData.color,
              tabGroup.stateData.collapsed,
              tabGroup.stateData.name
            );
            if (tabGroup.node) {
              tabsFragment.appendChild(tabGroup.node);
            }
          }
        }
      } else {
        if ((tab as any).hidden) {
          (tab as any).hidden = true;
          hiddenTabs.set(tab, tabData.extData?.hiddenBy);
        }
        tabsFragment.appendChild(tab);
      }
    }

    // Insert all tabs at once
    for (const [, data] of tabGroupWorkingData) {
      if (data.node && data.containingTabsFragment.childNodes.length) {
        data.node.appendChild(data.containingTabsFragment);
      }
    }

    const container = this.tabContainer?.arrowScrollbox || this.tabContainer;
    container?.appendChild?.(tabsFragment);

    // Update positions
    this._updateTabsAfterInsert();

    // Select appropriate tab
    if (tabToSelect) {
      this.selectedTab = tabToSelect;
    }

    return tabs;
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
