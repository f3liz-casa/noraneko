// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L872~L1053, L1784~L2153, L2307~L3217, L3368~L3704, L6461~L7019, L7805~L7877
// Section: Internal URI/Load · Tab Move/Position · Group/SplitView · Tab State · Utility

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { appState, selectedTab as selectedTabSignal, orderedTabs } from "../../state/store.ts";
import * as TabOps from "../../ops/tab-ops.ts";
import * as GroupOps from "../../ops/group-ops.ts";
import { DOMRegistry } from "../DOMRegistry.ts";
import { BrowserSystem } from "../BrowserSystem.ts";
import type { AppState, TabData, TabId, GroupId, SplitViewId } from "../../types/TabState.ts";
import { resolveTabId, dispatch } from "../compat-helpers.ts";

declare const PlacesUIUtils: any;
declare const LOAD_FLAGS_NONE: number;
declare const LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP: number;
declare const LOAD_FLAGS_FIXUP_SCHEME_TYPOS: number;

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    // Class fields used by this module
    _taskbarTabTitle: string | null;
    tabLocalization: any;
    // Methods — Internal URI/Load
    loadURI(uri: string, params?: any): void;
    fixupAndLoadURIString(uri: string, params?: any): void;
    loadTabs(uris: string[], options?: any): void;
    _determineURIToLoad(browser: XULBrowserElement, uriString: string, triggeringPrincipal?: any): string;
    _fixupURIString(uri: string): string;
    _isForInitialAboutBlank(browser: XULBrowserElement, uriString: string): boolean;
    _internalMaybeFixupLoadURI(browser: XULBrowserElement, uri: string, options?: any): any;
    _loadFlagsToFixupFlags(loadFlags: number): number;
    _normalizeLoadURIOptions(options: any): any;
    _handleUriInChrome(browser: XULBrowserElement, uri: any): boolean;
    _kickOffBrowserLoad(browser: XULBrowserElement, uri: string, options?: any): void;
    _getTriggeringPrincipalFromHistory(browser: XULBrowserElement, uri: any): any;
    _maybeRequestReplyFromRemoteContent(browser: XULBrowserElement): void;
    _updateTriggerMetadataForLoad(browser: XULBrowserElement, options: any): void;
    // Internal tab ops
    _insertTabAtIndex(tab: MozTabbrowserTab, options?: any): void;
    _tabAttrModified(tab: MozTabbrowserTab, changed: string[]): void;
    _updateTabsAfterInsert(options?: any): void;
    _updateTabBarForPinnedTabs(): void;
    _notifyOnTabMove(tab: MozTabbrowserTab): void;
    _getTabMoveState(tab: MozTabbrowserTab): any;
    _handleTabMove(tab: MozTabbrowserTab, oldIndex: number): void;
    _moveTabNextTo(tab: MozTabbrowserTab, referenceTab: any, options?: any): void;
    _isLastTabInWindow(): boolean;
    _isFirstOrLastInTabGroup(tab: MozTabbrowserTab): boolean;
    _elementIndexToTabIndex(elementIndex: number): number;
    // Group/split view
    _createTabGroup(id: string, color: string, collapsed: boolean, label?: string, isAdoptingGroup?: boolean): any;
    _createTabSplitView(tabEls: any[], options?: any): any;
    _insertSplitViewFooter(tab: MozTabbrowserTab): void;
    ungroupSplitView(splitView: any): void;
    moveSplitViewToExistingGroup(splitView: any, group: MozTabbrowserTabGroup): void;
    openSplitViewMenu(event: Event): void;
    hideSplitViewPanels(): void;
    showSplitViewPanels(splitView: any): void;
    // Tab state/event
    _fireTabOpen(tab: MozTabbrowserTab): void;
    _beginRemoveTab(tab: MozTabbrowserTab, options?: any): any;
    _endRemoveTab(tab: MozTabbrowserTab, options?: any): void;
    _blurTab(tab: MozTabbrowserTab): void;
    _findTabToBlurTo(tab: MozTabbrowserTab): any;
    _avoidSingleSelectedTab(tab: MozTabbrowserTab): void;
    _adjustFocusBeforeTabSwitch(tab: MozTabbrowserTab, newTab: any): void;
    _adjustFocusAfterTabSwitch(newTab: any): void;
    _onTransitionEnd(event: TransitionEvent): void;
    _moveTabsNextTo(tab: MozTabbrowserTab, referenceTab: any, options?: any): void;
    // Utility
    _mirror(source?: any, dest?: any, properties?: string[]): void;
    _notifyPinnedStatus(tab: MozTabbrowserTab, options?: any): void;
    _separateWholeGroups(tabs: MozTabbrowserTab[]): any[];
    _tabStub: never; // defined in TabbrowserCompat.ts extended section
  }
}

export const methods: Partial<TabbrowserCompat> & ThisType<TabbrowserCompat> = {
  // ==========================================================================
  // Internal URI/Load Methods
  // tabbrowser.js L2307~L3217
  // ==========================================================================

  _normalizeLoadURIOptions(browser: XULBrowserElement, loadURIOptions: any): void {
    if (!loadURIOptions.triggeringPrincipal) {
      throw new Error("Must load with a triggering Principal");
    }

    if (
      loadURIOptions.userContextId &&
      loadURIOptions.userContextId != browser.getAttribute?.("usercontextid")
    ) {
      throw new Error("Cannot load with mismatched userContextId");
    }

    loadURIOptions.loadFlags |= loadURIOptions.flags || LOAD_FLAGS_NONE;
    delete loadURIOptions.flags;
    loadURIOptions.hasValidUserGestureActivation ??=
      this.window.document.hasValidTransientUserGestureActivation;
  },

  _loadFlagsToFixupFlags(browser: XULBrowserElement, loadFlags: number): number {
    let fixupFlags = Ci.nsIURIFixup?.FIXUP_FLAG_NONE || 0;
    if (loadFlags & LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP) {
      fixupFlags |= Ci.nsIURIFixup?.FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP || 0;
    }
    if (loadFlags & LOAD_FLAGS_FIXUP_SCHEME_TYPOS) {
      fixupFlags |= Ci.nsIURIFixup?.FIXUP_FLAG_FIX_SCHEME_TYPOS || 0;
    }
    if (PrivateBrowsingUtils?.isBrowserPrivate?.(browser)) {
      fixupFlags |= Ci.nsIURIFixup?.FIXUP_FLAG_PRIVATE_CONTEXT || 0;
    }
    return fixupFlags;
  },

  _fixupURIString(browser: XULBrowserElement, uriString: string, loadURIOptions: any): any {
    try {
      const fixupFlags = this._loadFlagsToFixupFlags(browser, loadURIOptions.loadFlags || 0);
      const fixupInfo = Services.uriFixup?.getFixupURIInfo?.(uriString, fixupFlags);
      return fixupInfo?.preferredURI || null;
    } catch (_) {
      return null;
    }
  },

  _handleUriInChrome(browser: XULBrowserElement, uri: any): boolean {
    if (uri?.scheme === "file") {
      try {
        const mimeType = Cc["@mozilla.org/mime;1"]
          ?.getService?.(Ci.nsIMIMEService)
          ?.getTypeFromURI?.(uri);
        if (mimeType === "application/x-xpinstall") {
          const systemPrincipal = Services.scriptSecurityManager?.getSystemPrincipal?.();
          AddonManager?.getInstallForURL?.(uri.spec, {
            telemetryInfo: { source: "file-url" },
          }).then((install: any) => {
            AddonManager?.installAddonFromWebpage?.(
              mimeType,
              browser,
              systemPrincipal,
              install
            );
          });
          return true;
        }
      } catch (_) {
        return false;
      }
    }
    return false;
  },

  _internalMaybeFixupLoadURI(browser: XULBrowserElement, uriString: string, uri: any, loadURIOptions: any): void {
    this._normalizeLoadURIOptions(browser, loadURIOptions);
    
    if (!uriString && !uri) {
      uri = Services.io?.newURI?.("about:blank");
    }

    const startedWithURI = !!uri;
    if (!uri) {
      uri = this._fixupURIString(browser, uriString, loadURIOptions);
    }

    if (uri && this._handleUriInChrome(browser, uri)) {
      return;
    }

    if (loadURIOptions.isCaptivePortalTab) {
      browser.browsingContext.isCaptivePortalTab = true;
    }

    browser.isNavigating = true;
    try {
      if (startedWithURI) {
        browser.webNavigation?.loadURI?.(uri, loadURIOptions);
      } else {
        browser.webNavigation?.fixupAndLoadURIString?.(uriString, loadURIOptions);
      }
    } finally {
      browser.isNavigating = false;
    }
  },

  _isForInitialAboutBlank(webProgress: any, stateFlags: number, location?: any): boolean {
    if (!(this as any).mBlank || !webProgress?.isTopLevel) {
      return false;
    }

    if (
      stateFlags & Ci.nsIWebProgressListener?.STATE_STOP &&
      (this as any).mRequestCount === 0 &&
      !location
    ) {
      return true;
    }

    const locationSpec = location ? location.spec : "";
    return locationSpec === "about:blank";
  },

  // ==========================================================================
  // Internal Tab Move & Position Methods
  // tabbrowser.js L6461~L7019
  // ==========================================================================

  _handleTabMove(element: any, moveCallback: () => void, metricsContext?: any): void {
    let tabs: any[];
    if (this.isTab(element)) {
      tabs = [element];
    } else if (this.isTabGroup(element)) {
      tabs = element.tabs || [];
    } else if (this.isSplitViewWrapper?.(element)) {
      tabs = element.tabs || [];
    } else {
      throw new Error("Can only move a tab, tab group, or split view within the tab bar");
    }

    const wasFocused = this.window.document.activeElement === this.selectedTab;
    const previousTabStates = tabs.map((tab: any) => this._getTabMoveState(tab));

    moveCallback();

    if (wasFocused) {
      this.selectedTab?.focus?.();
    }

    for (let i = 0; i < tabs.length; i++) {
      const currentTabState = this._getTabMoveState(tabs[i]);
      this._notifyOnTabMove(tabs[i], previousTabStates[i], currentTabState, metricsContext);
    }
  },

  _getTabMoveState(tab: MozTabbrowserTab): any {
    if (!this.isTab(tab)) {
      return undefined;
    }

    const state: any = {
      tabIndex: (tab as any)._tPos,
    };
    if ((tab as any).visible) {
      state.elementIndex = (tab as any).elementIndex;
    }
    if ((tab as any).group) {
      state.tabGroupId = (tab as any).group.id;
    }
    return state;
  },

  _notifyOnTabMove(tab: MozTabbrowserTab, previousTabState: any, currentTabState: any, metricsContext?: any): void {
    if (!this.isTab(tab) || !previousTabState || !currentTabState) {
      return;
    }

    const changedPosition = previousTabState.tabIndex !== currentTabState.tabIndex;
    const changedTabGroup = previousTabState.tabGroupId !== currentTabState.tabGroupId;

    if (changedPosition || changedTabGroup) {
      tab.dispatchEvent?.(
        new CustomEvent("TabMove", {
          bubbles: true,
          detail: {
            previousTabState,
            currentTabState,
            isUserTriggered: metricsContext?.isUserTriggered ?? false,
            telemetrySource: metricsContext?.telemetrySource ?? "unknown",
          },
        })
      );
    }
  },

  _moveTabNextTo(element: any, targetElement: any, moveBefore = false, metricsContext?: any): void {
    if (this.isTabGroupLabel?.(targetElement)) {
      targetElement = targetElement.group;
      if (!moveBefore && !targetElement.collapsed) {
        targetElement = targetElement.tabs?.[0];
        moveBefore = true;
      }
    }
    if (this.isTabGroupLabel?.(element)) {
      element = element.group;
      if (targetElement?.group) {
        targetElement = targetElement.group;
      }
    }

    if ((element as any).pinned && !targetElement?.pinned) {
      targetElement = this.tabs[this.pinnedTabCount - 1];
      moveBefore = false;
    } else if (!(element as any).pinned && targetElement?.pinned) {
      targetElement = this.tabs[this.pinnedTabCount];
      if (targetElement?.group) {
        targetElement = targetElement.group;
      }
      moveBefore = true;
    }

    const getContainer = () =>
      (element as any).pinned
        ? this.tabContainer?.pinnedTabsContainer
        : this.tabContainer;

    this._handleTabMove(
      element,
      () => {
        const container = getContainer();
        if (moveBefore) {
          container?.insertBefore?.(element, targetElement);
        } else if (targetElement) {
          container?.insertBefore?.(element, targetElement.nextElementSibling);
        } else {
          container?.appendChild?.(element);
        }
      },
      metricsContext
    );
  },

  /**
   * Move multiple tabs next to a target tab.
   *
   * Applies `_moveTabNextTo` for each tab in order, preserving relative
   * ordering via sequential insertions relative to `targetTab`.
   */
  _moveTabsNextTo(tabs: MozTabbrowserTab[], targetTab: any, relation: string): void {
    for (const tab of tabs) {
      this._moveTabNextTo(tab, targetTab, relation === "before");
    }
  },

  _insertTabAtIndex(tab: MozTabbrowserTab, index: number, options: any = {}): void {
    if (options.ownerTab) {
      (tab as any).owner = options.ownerTab;
    }

    let elementIndex = index;
    if (typeof options.elementIndex === "number") {
      elementIndex = options.elementIndex;
    } else if (typeof options.tabIndex === "number") {
      elementIndex = this._elementIndexToTabIndex(options.tabIndex);
    } else {
      elementIndex = Infinity;
      
      if (options.openerTab || this.selectedTab) {
        const previousTab = options.openerTab || this.selectedTab;
        if (previousTab?.visible) {
          elementIndex = (previousTab as any).elementIndex + 1;
        }
      }
    }

    const allItems = this.tabContainer?.dragAndDropElements || [];
    if (elementIndex < allItems.length) {
      const targetElement = allItems[elementIndex];
      this.tabContainer?.insertBefore?.(tab, targetElement);
    } else {
      this.tabContainer?.appendChild?.(tab);
    }
  },

  _elementIndexToTabIndex(elementIndex: number): number {
    if (elementIndex < 0) {
      return -1;
    }
    const allElements = this.tabContainer?.dragAndDropElements || [];
    if (elementIndex >= allElements.length) {
      return this.tabs.length;
    }
    let element = allElements[elementIndex];
    if (this.isTabGroupLabel?.(element)) {
      element = element.group?.tabs?.[0];
    }
    return element?._tPos ?? -1;
  },

  _isFirstOrLastInTabGroup(tab: MozTabbrowserTab): boolean {
    if ((tab as any).group) {
      const groupTabs = (tab as any).group.tabs || [];
      return groupTabs[0] === tab || groupTabs[groupTabs.length - 1] === tab;
    }
    return false;
  },

  _isLastTabInWindow(): boolean {
    let openTabCount = 0;
    for (const tab of this.tabs) {
      if ((tab as any).isOpen && !(tab as any).hidden) {
        openTabCount++;
        if (openTabCount > 1) {
          return false;
        }
      }
    }
    return openTabCount === 1;
  },

  // ==========================================================================
  // Internal Tab Group & Split View Methods
  // tabbrowser.js L3368~L3704
  // ==========================================================================

  _createTabGroup(options: any): any {
    const { id, color, collapsed, label = "", isAdoptingGroup = false } = options;
    const group = this.window.document.createXULElement?.("tab-group", { is: "tab-group" });
    if (group) {
      group.id = id;
      group.collapsed = collapsed;
      group.color = color;
      group.label = label;
      (group as any).wasCreatedByAdoption = isAdoptingGroup;
    }
    return group;
  },

  _createTabGroupMenuItem(group: MozTabbrowserTabGroup, isSaved = false): any {
    const item = this.window.document.createXULElement?.("menuitem");
    if (!item) return null;

    item.setAttribute?.("tab-group-id", group.id);

    const label = group.label ?? group.name;
    if (label) {
      item.setAttribute?.("label", label);
    } else {
      (this.window.document as any).l10n?.setAttributes?.(item, "tab-context-unnamed-group");
    }

    item.classList?.add?.("menuitem-iconic", "tab-group-icon");
    if (isSaved) {
      item.classList?.add?.("tab-group-icon-closed");
    }

    item.style?.setProperty?.("--tab-group-color", `var(--tab-group-color-${group.color})`);
    item.style?.setProperty?.("--tab-group-color-invert", `var(--tab-group-color-${group.color}-invert)`);
    item.style?.setProperty?.("--tab-group-color-pale", `var(--tab-group-color-${group.color}-pale)`);

    return item;
  },

  _createTabSplitView(options: any): any {
    const splitview = this.window.document.createXULElement?.("tab-split-view-wrapper", {
      is: "tab-split-view-wrapper",
    });
    if (splitview && options?.id) {
      (splitview as any).splitViewId = options.id;
    }
    return splitview;
  },

  /**
   * Ensure a `split-view-footer` element exists for the given tab's panel.
   * Mirrors Firefox's `tabbrowser.js#insertSplitViewFooter`.
   *
   * @param tab - The tab whose linked panel should receive the footer
   */
  _insertSplitViewFooter(tab: MozTabbrowserTab): void {
    if (!tab) return;
    try {
      const panelId = (tab as any).linkedPanel;
      if (!panelId) return;
      const panelEl = this.window.document.getElementById(panelId);
      if (!panelEl) return;
      if (panelEl.querySelector("split-view-footer")) return;
      const footer = (this.window.document as any).createXULElement?.("split-view-footer")
        ?? this.window.document.createElement("split-view-footer");
      footer.setTab?.(tab);
      panelEl.appendChild(footer);
    } catch (_) { /* */ }
  },

  _separateWholeGroups(tabs: MozTabbrowserTab[]): any {
    // Separate whole tab groups from individual tabs
    const groups = new Set();
    const individualTabs = [];
    
    for (const tab of tabs) {
      if ((tab as any).group && !groups.has((tab as any).group)) {
        groups.add((tab as any).group);
      } else if (!(tab as any).group) {
        individualTabs.push(tab);
      }
    }
    
    return { groups: Array.from(groups), individualTabs };
  },

  // ==========================================================================
  // Internal Tab State & Event Methods
  // tabbrowser.js L1784~L2153
  // ==========================================================================

  _shouldShowProgress(request: any): boolean {
    if ((this as any).mBlank) {
      return false;
    }

    try {
      if (request?.originalURI?.schemeIs?.("about")) {
        return false;
      }
    } catch (_) { /* */ }

    return true;
  },

  _handleKeyDownEvent(event: KeyboardEvent): void {
    if (!event.isTrusted || event.defaultCancelled || (event as any).defaultPreventedByChrome) {
      return;
    }

    const action = ShortcutUtils?.getSystemActionForEvent?.(event);
    switch (action) {
      case ShortcutUtils?.TOGGLE_CARET_BROWSING:
        this._maybeRequestReplyFromRemoteContent(event);
        return;
      case ShortcutUtils?.MOVE_TAB_BACKWARD:
        this.moveTabBackward?.();
        event.preventDefault();
        return;
      case ShortcutUtils?.MOVE_TAB_FORWARD:
        this.moveTabForward?.();
        event.preventDefault();
        return;
      case ShortcutUtils?.CLOSE_TAB:
        if (this.multiSelectedTabsCount) {
          this.removeMultiSelectedTabs?.();
        } else if (!this.selectedTab?.pinned) {
          this.removeCurrentTab?.({ animate: true });
        }
        event.preventDefault();
        break;
    }
  },

  _handleKeyPressEvent(event: KeyboardEvent): void {
    if (!event.isTrusted || event.defaultCancelled || (event as any).defaultPreventedByChrome) {
      return;
    }

    const action = ShortcutUtils?.getSystemActionForEvent?.(event, { rtl: RTL_UI });
    switch (action) {
      case ShortcutUtils?.TOGGLE_CARET_BROWSING:
        if (!event.defaultPrevented && !this._maybeRequestReplyFromRemoteContent(event)) {
          this.toggleCaretBrowsing?.();
        }
        break;
      case ShortcutUtils?.NEXT_TAB:
        if (AppConstants?.platform === "macosx") {
          this.tabContainer?.advanceSelectedTab?.(1, true);
          event.preventDefault();
        }
        break;
      case ShortcutUtils?.PREVIOUS_TAB:
        if (AppConstants?.platform === "macosx") {
          this.tabContainer?.advanceSelectedTab?.(-1, true);
          event.preventDefault();
        }
        break;
    }
  },

  /**
   * Handle CSS `transitionend` for the status panel.
   * Hides the panel element when it is no longer visible after animation.
   *
   * Mirrors Firefox's `StatusPanel._onTransitionEnd`.
   */
  _onTransitionEnd(): void {
    try {
      if (!(this as any).isVisible) {
        (this as any).panel.hidden = true;
      }
    } catch (_) { /* */ }
  },

  // ==========================================================================
  // Internal Utility Methods
  // tabbrowser.js L872~L1053
  // ==========================================================================

  _mirror(source?: any, dest?: any, properties?: string[]): void {
    // Mirror properties from source to dest
    if (!source || !dest || !properties) {
      return;
    }
    
    try {
      for (const prop of properties) {
        if (prop in source) {
          dest[prop] = source[prop];
        }
      }
    } catch (_) { /* */ }
  },

  _notifyPinnedStatus(tab: MozTabbrowserTab, options: any = {}): void {
    try {
      if (!tab) return;
      
      tab.dispatchEvent?.(
        new CustomEvent("TabPinned", {
          bubbles: true,
          detail: options,
        })
      );
    } catch (_) { /* */ }
  },

  /**
   * `nsIObserver` callback — handles preference changes and service
   * notifications that affect tab state.
   *
   * Observed topics: `contextual-identity-updated`,
   * `process-creation`, `nsPref:changed` (for audio/autoplay prefs).
   */
  observe(subject: any, topic: string) {
    switch (topic) {
      case "contextual-identity-updated": {
        const identity = subject?.wrappedJSObject;
        if (identity) {
          for (const tab of this.tabs) {
            if ((tab as any).getAttribute?.("usercontextid") == identity.userContextId) {
              try { ContextualIdentityService?.setTabStyle?.(tab); } catch (_) { /* */ }
            }
          }
          // Invalidate taskbar tab title cache since container names changed
          this._taskbarTabTitle = null;
          this._taskbarTabTitleLastProfile = null;
          this.updateTitlebar();
        }
        break;
      }
      case "intl:app-locales-changed":
        // Recreate tabLocalization for new locale
        try {
          this.tabLocalization = new (this.window as any).Localization(
            ["browser/tabbrowser.ftl", "browser/defaultBrowserNotification.ftl"],
            true,
          );
        } catch (_) { /* */ }
        this._populateTitleCache();
        this.updateTitlebar();
        break;
    }
  },
};
