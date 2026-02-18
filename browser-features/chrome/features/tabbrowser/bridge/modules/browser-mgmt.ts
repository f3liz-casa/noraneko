// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L2154~L2307, L5801~L7705
// Section: Browser Swap · Browser State · Remoteness · Print Preview

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { appState, selectedTab as selectedTabSignal, updateState } from "../../state/store.ts";
import * as TabOps from "../../ops/tab-ops.ts";
import { DOMRegistry } from "../DOMRegistry.ts";
import { BrowserSystem } from "../BrowserSystem.ts";
import type { TabId } from "../../types/TabState.ts";
import { resolveTabId, dispatch } from "../compat-helpers.ts";

// Add other declare const needed

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    // Class fields used by this module
    _isBusy: boolean;
    _switcher: any;
    _previewMode: boolean;
    _asyncTabSwitching: boolean;
    _tabNotificationDeck: any;
    _printPreviewBrowsers: Set<any>;
    // Methods
    swapBrowsersAndCloseOther(ourTab: any, otherTab: any): void;
    shouldActivateDocShell(browser: XULBrowserElement): boolean;
    updateCurrentBrowser(forceUpdate?: boolean): void;
    appendStatusPanel(browser?: any): any;
    readNotificationBox(browser: XULBrowserElement): any;
    getTabNotificationDeck(): any;
    updateBrowserRemoteness(browser: XULBrowserElement, options?: any): boolean;
    updateBrowserRemotenessByURL(browser: XULBrowserElement, url: string, options?: any): boolean;
    activateBrowserForPrintPreview(browser: XULBrowserElement): void;
    deactivatePrintPreviewBrowsers(): void;
    _swapBrowserDocShells(browser: XULBrowserElement, otherBrowser: any): void;
    _swapRegisteredOpenURIs(browser: XULBrowserElement, otherBrowser: any): void;
    _createLazyBrowser(tab: MozTabbrowserTab): void;
    _reregisterOpenTab(tab: MozTabbrowserTab, groupId: string | null): void;
    _unregisterAndReregisterOpenTab(tab: MozTabbrowserTab, originalGroupId: string | null): void;
  }
}

export const methods: Partial<TabbrowserCompat> & ThisType<TabbrowserCompat> = {
  // ==========================================================================
  // swapBrowsersAndCloseOther
  // tabbrowser.js L5801~L5944
  // ==========================================================================

  /**
   * Swap the Gecko content between two tabs without closing either tab.
   * Progress listeners and attributes are migrated accordingly.
   */
  swapBrowsers(ourTab: MozTabbrowserTab, otherTab: MozTabbrowserTab) {
    const id1 = resolveTabId(ourTab);
    const id2 = resolveTabId(otherTab);
    if (!id1 || !id2) return;

    const otherTabBrowser = (otherTab as any).ownerGlobal?.gBrowser;
    const ourBrowser = DOMRegistry.getBrowser(id1) as any;
    const otherBrowser = otherTabBrowser?.getBrowserForTab?.(otherTab) ?? DOMRegistry.getBrowser(id2);
    if (!ourBrowser || !otherBrowser) return;

    // Remove progress listeners from other tab
    const filter = otherTabBrowser?._tabFilters?.get?.(otherTab);
    const tabListener = otherTabBrowser?._tabListeners?.get?.(otherTab);
    if (filter && tabListener) {
      try {
        (otherBrowser as any).webProgress?.removeProgressListener?.(filter);
        filter.removeProgressListener?.(tabListener);
      } catch (_) { /* */ }
    }

    // Transfer label/title properties
    if ((otherTab as any)._labelIsContentTitle !== undefined) {
      (ourTab as any)._labelIsContentTitle = (otherTab as any)._labelIsContentTitle;
    }
    if ((otherTab as any)._fullLabel !== undefined) {
      (ourTab as any)._fullLabel = (otherTab as any)._fullLabel;
    }
    const otherLabel = (otherTab as any).getAttribute?.("label");
    if (otherLabel) {
      (ourTab as any).setAttribute?.("label", otherLabel);
      const id = resolveTabId(ourTab);
      if (id) {
        updateState(d => {
          if (d.tabs[id]) d.tabs[id].label = otherLabel;
        });
      }
    }

    // Perform docshell swap
    this._swapBrowserDocShells(ourTab, otherBrowser);

    // Swap permanentKey
    const ourPK = ourBrowser.permanentKey;
    ourBrowser.permanentKey = otherBrowser.permanentKey;
    otherBrowser.permanentKey = ourPK;
    (ourTab as any).permanentKey = ourBrowser.permanentKey;
    (otherTab as any).permanentKey = otherBrowser.permanentKey;

    // Update _tabForBrowser WeakMap
    this._tabForBrowser.set(ourBrowser, ourTab);
    if (otherTabBrowser) {
      otherTabBrowser._tabForBrowser?.set?.(otherBrowser, otherTab);
    }

    // Update DOP state
    if (id1) {
      updateState(d => {
        if (d.tabs[id1]) d.tabs[id1].permanentKey = ourBrowser.permanentKey;
      });
    }

    // Restore listeners for swapped-in tab
    if (otherTabBrowser && filter) {
      try {
        const newListener = new otherTabBrowser.ownerGlobal.TabProgressListener(
          otherTab, otherBrowser, false, false,
        );
        otherTabBrowser._tabListeners.set(otherTab, newListener);
        const notifyAll = Ci.nsIWebProgress.NOTIFY_ALL;
        filter.addProgressListener(newListener, notifyAll);
        (otherBrowser as any).webProgress?.addProgressListener?.(filter, notifyAll);
      } catch (_) { /* */ }
    }
  },

  /**
   * Swap the Gecko `<browser>` content between two tabs from (potentially)
   * different windows, then close `otherTab`.
   *
   * Copies relevant tab attributes, migrates progress listeners, and handles
   * the edge case where `otherTab` is the last tab in its window (closes the
   * window instead of just the tab).
   */
  swapBrowsersAndCloseOther(ourTab: MozTabbrowserTab, otherTab: MozTabbrowserTab) {
    const id1 = resolveTabId(ourTab);
    const id2 = resolveTabId(otherTab);
    if (!id1 || !id2) return;

    const otherTabBrowser = (otherTab as any).ownerGlobal?.gBrowser;
    const ourBrowser = DOMRegistry.getBrowser(id1) as any;
    const otherBrowser = otherTabBrowser?.getBrowserForTab?.(otherTab) ?? DOMRegistry.getBrowser(id2);
    if (!ourBrowser || !otherBrowser) return;

    // Validate cross-window compatibility
    try {
      const isPrivate = PrivateBrowsingUtils?.isWindowPrivate?.(this.window);
      const otherIsPrivate = PrivateBrowsingUtils?.isWindowPrivate?.((otherTab as any).ownerGlobal);
      if (isPrivate !== otherIsPrivate) return;
    } catch (_) { /* */ }

    const isPending = (otherTab as any).hasAttribute?.("pending");
    const closeWindow = otherTabBrowser?.tabs?.length === 1;
    const modifiedAttrs: string[] = [];

    // Clear any pending sound-playing attribute removal timer
    if (otherTab._soundPlayingAttrRemovalTimer) {
      otherTab._soundPlayingAttrRemovalTimer.cancel?.();
      otherTab._soundPlayingAttrRemovalTimer = null;
    }

    // Transfer tab attributes
    for (const attr of ["muted", "discarded", "undiscardable", "soundplaying"] as const) {
      if ((otherTab as any).hasAttribute?.(attr)) {
        (ourTab as any).toggleAttribute?.(attr, true);
        modifiedAttrs.push(attr);
      }
    }
    if ((otherTab as any).hasAttribute?.("muted") && ourBrowser.mute) {
      ourBrowser.mute();
      (ourTab as any).muteReason = (otherTab as any).muteReason;
    }
    if ((otherTab as any).hasAttribute?.("usercontextid")) {
      (ourTab as any).setUserContextId?.((otherTab as any).getAttribute("usercontextid"));
      modifiedAttrs.push("usercontextid");
    }
    if ((otherTab as any).hasAttribute?.("sharing")) {
      (ourTab as any).setAttribute?.("sharing", (otherTab as any).getAttribute("sharing"));
      modifiedAttrs.push("sharing");
      (ourTab as any)._sharingState = (otherTab as any)._sharingState;
      try { webrtcUI?.swapBrowserForNotification?.(otherBrowser, ourBrowser); } catch (_) { /* */ }
    }
    if ((otherTab as any).hasAttribute?.("pictureinpicture")) {
      (ourTab as any).toggleAttribute?.("pictureinpicture", true);
      modifiedAttrs.push("pictureinpicture");
      dispatch(otherTab, "TabSwapPictureInPicture", ourTab);
    }

    try { SitePermissions?.copyTemporaryPermissions?.(otherBrowser, ourBrowser); } catch (_) { /* */ }

    // Preserve original registered open URI for events
    (otherTab as any)._originalRegisteredOpenURI = (otherBrowser as any).registeredOpenURI;

    // Transfer isDistinctProductPageVisit for history tracking
    if (otherBrowser.isDistinctProductPageVisit) {
      ourBrowser.isDistinctProductPageVisit = otherBrowser.isDistinctProductPageVisit;
    }

    const stateFlags = (otherTabBrowser?._tabListeners?.get?.(otherTab) as any)?.mStateFlags;

    if (isPending) {
      // Pending tab — transfer via session store
      (ourTab as any).initializingTab = true;
      delete ourBrowser._cachedCurrentURI;
      try { SessionStore?.setTabState?.(ourTab, SessionStore?.getTabState?.(otherTab)); } catch (_) { /* */ }
      delete (ourTab as any).initializingTab;
      this._swapRegisteredOpenURIs(ourBrowser, otherBrowser);
    } else {
      // Active tab — swap docshells
      if (!ourBrowser.mIconURL && (otherBrowser as any).mIconURL) {
        this.setIcon(ourTab, (otherBrowser as any).mIconURL);
      }
      if ((otherTab as any).hasAttribute?.("busy")) {
        (ourTab as any).setAttribute?.("busy", "true");
        modifiedAttrs.push("busy");
        if ((ourTab as any).selected) this._isBusy = true;
      }
      this._swapBrowserDocShells(ourTab, otherBrowser, stateFlags);
    }

    // Unregister previously opened URI
    if ((otherBrowser as any).registeredOpenURI) {
      try {
        const uci = (otherBrowser as any).getAttribute?.("usercontextid") || 0;
        this.UrlbarProviderOpenTabs?.unregisterOpenTab?.(
          (otherBrowser as any).registeredOpenURI.spec, uci,
          (otherTab as any).group?.id,
          PrivateBrowsingUtils?.isWindowPrivate?.(this.window),
        );
      } catch (_) { /* */ }
      delete (otherBrowser as any).registeredOpenURI;
    }

    // Transfer findbar data
    const otherFindBar = (otherTab as any)._findBar;
    if (otherFindBar?.findMode === otherFindBar?.FIND_NORMAL) {
      const oldValue = otherFindBar._findField?.value;
      const wasHidden = otherFindBar.hidden;
      this.getFindBar(ourTab).then((fb: any) => {
        if (!fb) return;
        fb._findField.value = oldValue;
        if (!wasHidden) fb.onFindCommand();
      });
    }

    // Close other window or remove tab
    if (closeWindow) {
      (otherTab as any).ownerGlobal?.close?.();
    } else {
      otherTabBrowser?._endRemoveTab?.(otherTab);
    }

    // Clear initial title flag so setTabTitle updates properly
    (ourTab as any)._labelIsInitialTitle = false;
    this.setTabTitle(ourTab);

    if ((ourTab as any).selected) {
      this.updateCurrentBrowser(true);
    }

    if (modifiedAttrs.length) {
      this._tabAttrModified(ourTab, modifiedAttrs);
    }
  },

  _swapBrowserDocShells(ourTab: MozTabbrowserTab, otherBrowser: XULBrowserElement, stateFlags?: number) {
    const ourBrowser = this.getBrowserForTab(ourTab) as any;
    if (!ourBrowser) return;

    // Unhook our progress listener
    const filter = this._tabFilters.get(ourTab);
    const tabListener = this._tabListeners.get(ourTab);
    if (filter && tabListener) {
      try {
        ourBrowser.webProgress?.removeProgressListener?.(filter);
        filter.removeProgressListener?.(tabListener);
      } catch (_) { /* */ }
    }

    this._swapRegisteredOpenURIs(ourBrowser, otherBrowser);

    // Toggle docshell activation
    if (!this._switcher) {
      try { otherBrowser.docShellIsActive = this.shouldActivateDocShell(ourBrowser); } catch (_) { /* */ }
    }

    // Handle hidden browser containers for customize mode
    const ourContainer = ourBrowser.ownerDocument?.getElementById?.("browser");
    const otherContainer = otherBrowser.ownerDocument?.getElementById?.("browser");
    const ourWasHidden = ourContainer?.hidden;
    const otherWasHidden = otherContainer?.hidden;
    if (ourContainer) ourContainer.hidden = false;
    if (otherContainer) otherContainer.hidden = false;

    // Swap docshells
    try { ourBrowser.swapDocShells?.(otherBrowser); } catch (e) { console.warn("swapDocShells failed", e); }

    if (ourContainer) ourContainer.hidden = ourWasHidden;
    if (otherContainer) otherContainer.hidden = otherWasHidden;

    // Swap permanentKey
    const ourPermanentKey = ourBrowser.permanentKey;
    ourBrowser.permanentKey = otherBrowser.permanentKey;
    otherBrowser.permanentKey = ourPermanentKey;
    (ourTab as any).permanentKey = ourBrowser.permanentKey;

    // Update state store
    const ourId = resolveTabId(ourTab);
    if (ourId) {
      updateState(d => {
        if (d.tabs[ourId]) d.tabs[ourId].permanentKey = ourBrowser.permanentKey;
      });
    }

    // Restore progress listener
    if (filter) {
      try {
        const newListener = new TabProgressListener(ourTab, ourBrowser, false, false, stateFlags);
        this._tabListeners.set(ourTab, newListener);
        const notifyAll = Ci.nsIWebProgress.NOTIFY_ALL;
        filter.addProgressListener(newListener, notifyAll);
        ourBrowser.webProgress?.addProgressListener?.(filter, notifyAll);
      } catch (_) { /* */ }
    }
  },

  _swapRegisteredOpenURIs(ourBrowser: XULBrowserElement, otherBrowser: XULBrowserElement) {
    const tmp = ourBrowser.registeredOpenURI;
    delete ourBrowser.registeredOpenURI;
    if (otherBrowser.registeredOpenURI) {
      ourBrowser.registeredOpenURI = otherBrowser.registeredOpenURI;
      delete otherBrowser.registeredOpenURI;
    }
    if (tmp) otherBrowser.registeredOpenURI = tmp;
  },

  // ==========================================================================
  // Browser State (Gecko delegation)
  // tabbrowser.js L2154~L2306, L5801~L5944
  // ==========================================================================

  /**
   * Returns `true` if `browser`'s docshell should be active — i.e., the browser
   * belongs to the selected tab and the document is not hidden.
   */
  shouldActivateDocShell(browser: XULBrowserElement): boolean {
    const tab = this.getTabForBrowser(browser);
    return tab === this.selectedTab && !document.hidden;
  },

  /**
   * Synchronises all UI state to reflect the currently selected tab.
   *
   * Fires `TabSelect`, updates the URL bar, status panel, notification box,
   * security indicators, and busy-state progress events.
   *
   * @param aForceUpdate - Re-run the update even if the selected browser has not changed.
   */
  updateCurrentBrowser(aForceUpdate?: boolean) {
    const newBrowser = this.getBrowserAtIndex(
      this.tabContainer?.selectedIndex ?? appState.value.tabOrder.indexOf(appState.value.selectedTabId ?? ""),
    );
    if (this.selectedBrowser === newBrowser && !aForceUpdate) return;

    const oldBrowser = this.selectedBrowser as any;
    const oldTab = this.selectedTab;
    const newTab = newBrowser ? this.getTabForBrowser(newBrowser) : null;
    if (!newTab || !newBrowser) return;

    // Save URL bar selection state before switch
    gURLBar?.saveSelectionStateForBrowser?.(oldBrowser);

    let timerId: any;
    if (!aForceUpdate) {
      try { timerId = (globalThis as any).Glean?.browserTabswitch?.update?.start?.(); } catch (_) { /* */ }
      if (typeof gMultiProcessBrowser !== "undefined" && gMultiProcessBrowser) {
        this._asyncTabSwitching = true;
        this._getSwitcher().requestTab(newTab);
        this._asyncTabSwitching = false;
      }
      try { document.commandDispatcher?.lock?.(); } catch (_) { /* */ }
    }

    // Reset owner on old tab unless in preview mode
    if (!this._previewMode && oldTab && !(oldTab as any).selected) {
      (oldTab as any).owner = null;
    }

    const lastRelated = this._lastRelatedTabMap.get(oldTab);
    if (lastRelated && !(lastRelated as any).selected) {
      (lastRelated as any).owner = null;
    }
    this._lastRelatedTabMap = new WeakMap();

    // Non-multiprocess: toggle docshell activation
    if (typeof gMultiProcessBrowser !== "undefined" && !gMultiProcessBrowser) {
      oldBrowser?.removeAttribute?.("primary");
      oldBrowser && (oldBrowser.docShellIsActive = false);
      (newBrowser as any).setAttribute?.("primary", "true");
      (newBrowser as any).docShellIsActive = !document.hidden;
    }

    // Update selection state
    const newId = resolveTabId(newTab);
    if (newId) setSelectedTab(newId);
    this.showTab(newTab);

    // Status panel & notification box
    this.appendStatusPanel(newBrowser);
    this._updateVisibleNotificationBox(newBrowser);

    // Popup/redirect blocker sync
    try {
      const oldBlocked = oldBrowser?.popupAndRedirectBlocker?.getBlockedPopupCount?.();
      const newBlocked = (newBrowser as any).popupAndRedirectBlocker?.getBlockedPopupCount?.();
      if (oldBlocked !== newBlocked) (newBrowser as any).popupAndRedirectBlocker?.sendObserverUpdateBlockedPopupsEvent?.();
      if (oldBrowser?.popupAndRedirectBlocker?.isRedirectBlocked?.() !== (newBrowser as any).popupAndRedirectBlocker?.isRedirectBlocked?.()) {
        (newBrowser as any).popupAndRedirectBlocker?.sendObserverUpdateBlockedRedirectEvent?.();
      }
    } catch (_) { /* */ }

    // Fire progress listener events for location/security sync
    const webProgress = (newBrowser as any).webProgress;
    this._callProgressListeners(null, "onLocationChange",
      [webProgress, null, (newBrowser as any).currentURI, 0, true], true, false);

    const securityUI = (newBrowser as any).securityUI;
    if (securityUI) {
      this._callProgressListeners(null, "onSecurityChange",
        [webProgress, null, securityUI.state], true, false);
      try {
        this._callProgressListeners(null, "onContentBlockingEvent",
          [webProgress, null, (newBrowser as any).getContentBlockingEvents?.(), true], true, false);
      } catch (_) { /* */ }
    }

    // Restore in-progress load state
    const listener = this._tabListeners.get(newTab);
    if (listener?.mStateFlags) {
      this._callProgressListeners(null, "onUpdateCurrentBrowser",
        [listener.mStateFlags, listener.mStatus, listener.mMessage, listener.mTotalProgress], true, false);
    }

    if (!this._previewMode) {
      (newTab as any).recordTimeFromUnloadToReload?.();
      (newTab as any).updateLastAccessed?.();
      (oldTab as any)?.updateLastAccessed?.();
      try {
        if (this.ownerGlobal === BrowserWindowTracker?.getTopWindow?.()) {
          (newTab as any).updateLastSeenActive?.();
          (oldTab as any)?.updateLastSeenActive?.();
        }
      } catch (_) { /* */ }

      // Save find bar value from old tab
      const oldFindBar = (oldTab as any)?._findBar;
      if (oldFindBar && oldFindBar.findMode === oldFindBar.FIND_NORMAL && !oldFindBar.hidden) {
        this._lastFindValue = oldFindBar._findField.value;
      }

      this.updateTitlebar();
      (newTab as any).removeAttribute?.("titlechanged");
      if ((newTab as any).attention !== undefined) (newTab as any).attention = false;
      (newBrowser as any).unselectedTabHover?.(false);
    }

    // Busy state sync
    const isBusy = (newTab as any).hasAttribute?.("busy");
    if (isBusy && !this._isBusy) {
      this._isBusy = true;
      this._callProgressListeners(null, "onStateChange",
        [webProgress, null, Ci.nsIWebProgressListener.STATE_START | Ci.nsIWebProgressListener.STATE_IS_NETWORK, 0],
        true, false);
    }
    if (!isBusy && this._isBusy) {
      this._isBusy = false;
      this._callProgressListeners(null, "onStateChange",
        [webProgress, null, Ci.nsIWebProgressListener.STATE_STOP | Ci.nsIWebProgressListener.STATE_IS_NETWORK, 0],
        true, false);
    }

    if (!this._previewMode) {
      const event = new CustomEvent("TabSelect", {
        bubbles: true, cancelable: false,
        detail: { previousTab: oldTab },
      });
      (newTab as any).dispatchEvent?.(event);

      if (oldTab) this._tabAttrModified(oldTab, ["selected"]);
      this._tabAttrModified(newTab, ["selected"]);

      this._startMultiSelectChange();
      this._multiSelectChangeSelected = true;
      this.clearMultiSelectedTabs();
      if (this._multiSelectChangeAdditions.size && oldTab) {
        this.addToMultiSelectedTabs(oldTab);
      }

      if (typeof gMultiProcessBrowser !== "undefined" && !gMultiProcessBrowser) {
        this._adjustFocusBeforeTabSwitch(oldTab, newTab);
        this._adjustFocusAfterTabSwitch(newTab);
      }

      if (aForceUpdate || (typeof gMultiProcessBrowser !== "undefined" && !gMultiProcessBrowser)) {
        gURLBar?.afterTabSwitchFocusChange?.();
      }
    }

    try { updateUserContextUIIndicator?.(); } catch (_) { /* */ }
    try { gPermissionPanel?.updateSharingIndicator?.(); } catch (_) { /* */ }

    // Touch drag support (Windows)
    (oldTab as any)?.removeAttribute?.("touchdownstartsdrag");
    (newTab as any).setAttribute?.("touchdownstartsdrag", "true");

    if (typeof gMultiProcessBrowser !== "undefined" && !gMultiProcessBrowser) {
      try { document.commandDispatcher?.unlock?.(); } catch (_) { /* */ }
      this.dispatchEvent(new CustomEvent("TabSwitchDone", { bubbles: true, cancelable: true }) as any);
    }

    if (!aForceUpdate && timerId !== undefined) {
      try { (globalThis as any).Glean?.browserTabswitch?.update?.stopAndAccumulate?.(timerId); } catch (_) { /* */ }
    }

    // Check for ASRouter tab switch trigger
    if (!this._previewMode) {
      this._checkIfShouldTriggerTabSelectMessage();
    }
  },

  /**
   * Moves the floating `StatusPanel` element to immediately follow `browser` in the DOM.
   *
   * Defaults to `selectedBrowser` when no argument is provided.
   */
  appendStatusPanel(browser: XULBrowserElement = this.selectedBrowser) {
    try { browser?.insertAdjacentElement?.("afterend", StatusPanel?.panel); } catch (_) { /* */ }
  },

  _updateVisibleNotificationBox(browser: XULBrowserElement) {
    if (!this._tabNotificationDeck) return;
    const notificationBox = this.readNotificationBox(browser);
    const deck = this.getTabNotificationDeck();
    if (deck) {
      deck.selectedViewName = notificationBox?.stack?.getAttribute?.("name") ?? "";
    }
  },

  /**
   * Returns the cached `NotificationBox` instance for `browser`, or `null` if none
   * has been created yet (non-blocking alternative to `getNotificationBox`).
   */
  readNotificationBox(browser: XULBrowserElement): any {
    return browser?._notificationBox ?? null;
  },

  /**
   * Returns the `<notificationbox-deck>` element used to display per-tab notification
   * boxes, instantiating it from its template on the first call.
   */
  getTabNotificationDeck(): any {
    if (!this._tabNotificationDeck) {
      // Try to instantiate from template first (only once)
      const template = document.getElementById("tab-notification-deck-template") as any;
      if (template?.content?.hasChildNodes?.()) {
        // Only instantiate if content is non-empty
        try { template.replaceWith(template.content); } catch (_) { /* */ }
      }
      this._tabNotificationDeck = document.getElementById("tab-notification-deck") ?? null;
    }
    return this._tabNotificationDeck;
  },

  _startMultiSelectChange() {
    if (!this._multiSelectChangeStarted) {
      this._multiSelectChangeStarted = true;
      Promise.resolve().then(() => { this._multiSelectChangeStarted = false; });
    }
  },

  _adjustFocusBeforeTabSwitch(oldTab: MozTabbrowserTab, newTab: MozTabbrowserTab) {
    if (this._previewMode) return;

    const oldBrowser = (oldTab as any)?.linkedBrowser;
    const newBrowser = (newTab as any)?.linkedBrowser;

    // Save URL bar focus state
    try { gURLBar?.getBrowserState?.(oldBrowser) && (gURLBar.getBrowserState(oldBrowser).urlbarFocused = gURLBar.focused); } catch (_) { /* */ }

    if (this._asyncTabSwitching && newBrowser) {
      newBrowser._userTypedValueAtBeforeTabSwitch = newBrowser.userTypedValue;
    }

    // Save find bar focus state
    if (this.isFindBarInitialized(oldTab)) {
      const findBar = this.getCachedFindBar(oldTab);
      (oldTab as any)._findBarFocused = !findBar?.hidden && findBar?._findField?.getAttribute?.("focused") === "true";
    }

    const activeEl = document.activeElement;
    if (activeEl === oldTab) {
      (newTab as any)?.focus?.();
    } else if (
      typeof gMultiProcessBrowser !== "undefined" && gMultiProcessBrowser &&
      activeEl !== newBrowser && activeEl !== newTab
    ) {
      let keepFocusOnUrlBar = false;
      try {
        keepFocusOnUrlBar = newBrowser && gURLBar?.getBrowserState?.(newBrowser)?.urlbarFocused && gURLBar?.focused;
      } catch (_) { /* */ }
      if (!keepFocusOnUrlBar) {
        try { (document.activeElement as any)?.blur?.(); } catch (_) { /* */ }
      }
    }
  },

  _adjustFocusAfterTabSwitch(newTab: MozTabbrowserTab) {
    // Don't steal focus from the tab bar
    if (document.activeElement === newTab) return;

    const newBrowser = this.getBrowserForTab(newTab) as any;
    if (!newBrowser) return;

    // Tab dialog has priority
    if (newBrowser.hasAttribute?.("tabDialogShowing")) {
      try { newBrowser.tabDialogBox?.focus?.(); } catch (_) { /* */ }
      return;
    }

    // Restore URL bar focus
    try {
      if (gURLBar?.getBrowserState?.(newBrowser)?.urlbarFocused) {
        const selectURL = () => {
          if (this._asyncTabSwitching) {
            newBrowser._awaitingSetURI = true;
            const currentActiveElement = document.activeElement;
            gURLBar.inputField?.addEventListener?.("SetURI", () => {
              delete newBrowser._awaitingSetURI;
              const prevTyped = newBrowser._userTypedValueAtBeforeTabSwitch;
              delete newBrowser._userTypedValueAtBeforeTabSwitch;
              if (newBrowser.userTypedValue && newBrowser.userTypedValue !== prevTyped) return;
              if (currentActiveElement !== document.activeElement) return;
              gURLBar.restoreSelectionStateForBrowser?.(newBrowser);
            }, { once: true });
          } else {
            gURLBar.restoreSelectionStateForBrowser?.(newBrowser);
          }
        };

        if (document.documentElement?.hasAttribute?.("inDOMFullscreen")) {
          this.window.addEventListener("MozDOMFullscreen:Exited", selectURL, { once: true });
          return;
        }

        if (!(this.window as any).fullScreen || (newTab as any).isEmpty) {
          selectURL();
          return;
        }
      }
    } catch (_) { /* */ }

    // Restore find bar focus
    try {
      if ((newTab as any)._findBarFocused) {
        const findBar = this.getCachedFindBar(newTab);
        if (findBar && !findBar.hidden) {
          findBar._findField?.focus?.();
          return;
        }
      }
    } catch (_) { /* */ }

    // Don't focus content if something else was focused after tab switch
    if (typeof gMultiProcessBrowser !== "undefined" && gMultiProcessBrowser && document.activeElement !== document.body) {
      return;
    }

    // Focus the content area
    try {
      const fm = Services.focus;
      let focusFlags = fm.FLAG_NOSCROLL;

      if (typeof gMultiProcessBrowser !== "undefined" && !gMultiProcessBrowser) {
        const newFocusedElement = fm.getFocusedElementForWindow?.((this.window as any).content, true, {});
        if (
          newFocusedElement &&
          ((newFocusedElement as any) instanceof (this.window as any).HTMLAnchorElement ||
            newFocusedElement.getAttributeNS?.("http://www.w3.org/1999/xlink", "type") === "simple")
        ) {
          focusFlags |= fm.FLAG_SHOWRING;
        }
      }

      fm.setFocus(newBrowser, focusFlags);
    } catch (_) {
      try { newBrowser.focus?.(); } catch (_2) { /* */ }
    }
  },

  // ==========================================================================
  // updateBrowserRemoteness
  // tabbrowser.js L2154~L2306
  // ==========================================================================

  /**
   * Switch a `<browser>` between the main (remote) content process and the
   * parent process.
   *
   * This is called when navigating between regular and privileged content, or
   * when e10s state changes. Returns `true` when a remoteness change occurred.
   *
   * @throws When `options.remoteType` is not provided
   */
  updateBrowserRemoteness(browser: XULBrowserElement, options: any = {}): boolean {
    const b = browser as any;
    if (!b) return false;
    const { newFrameloader, remoteType } = options;

    if (remoteType === undefined) throw new Error("Remote type must be set!");

    const isRemote = b.getAttribute?.("remote") === "true";
    const shouldBeRemote = remoteType !== (E10SUtils?.NOT_REMOTE ?? null);

    if (typeof gMultiProcessBrowser !== "undefined" && !gMultiProcessBrowser && shouldBeRemote) {
      throw new Error("Cannot switch to remote browser in a window without the remote tabs load context.");
    }

    const oldRemoteType = b.remoteType;
    if (isRemote === shouldBeRemote && !newFrameloader && (!isRemote || oldRemoteType === remoteType)) {
      return false;
    }

    const tab = this.getTabForBrowser(b);
    if (tab) this._insertBrowser(tab);

    const evt = document.createEvent("Events");
    evt.initEvent("BeforeTabRemotenessChange", true, false);
    (tab as any)?.dispatchEvent?.(evt);

    // Unhook progress listener
    const filter = this._tabFilters.get(tab);
    let listener = this._tabListeners.get(tab);
    if (filter) {
      try {
        b.webProgress?.removeProgressListener?.(filter);
        filter.removeProgressListener?.(listener);
      } catch (_) { /* */ }
    }
    try { listener?.destroy?.(); } catch (_) { /* */ }

    const oldDroppedLinkHandler = b.droppedLinkHandler;
    const oldUserTypedValue = b.userTypedValue;
    const hadStartedLoad = b.didStartLoadSinceLastUserTyping?.() ?? false;

    try { b.destroy?.(); } catch (_) { /* */ }

    if (shouldBeRemote) {
      b.setAttribute("remote", "true");
      b.setAttribute("remoteType", remoteType);
    } else {
      b.setAttribute("remote", "false");
      b.removeAttribute("remoteType");
    }

    try { b.changeRemoteness?.({ remoteType }); } catch (e) { console.warn("changeRemoteness failed", e); }
    try { b.construct?.(); } catch (_) { /* */ }

    b.userTypedValue = oldUserTypedValue;
    if (hadStartedLoad) {
      try { b.urlbarChangeTracker?.startedLoad?.(); } catch (_) { /* */ }
    }
    b.droppedLinkHandler = oldDroppedLinkHandler;

    // Side-effect: layer tree ready/cleared events
    try { b.docShellIsActive = b.docShellIsActive; } catch (_) { /* */ }

    // Create new progress listener
    try {
      const newListener = new TabProgressListener(tab, b, true, false);
      this._tabListeners.set(tab, newListener);
      let newFilter = filter;
      if (!newFilter) {
        newFilter = Cc["@mozilla.org/appshell/component/browser-status-filter;1"]
          .createInstance(Ci.nsIWebProgress);
        this._tabFilters.set(tab, newFilter);
      }
      newFilter.addProgressListener(newListener, Ci.nsIWebProgress.NOTIFY_ALL);
      b.webProgress?.addProgressListener?.(newFilter, Ci.nsIWebProgress.NOTIFY_ALL);
    } catch (_) { /* */ }

    // Restore securityUI state
    try {
      const securityUI = b.securityUI;
      const state = securityUI ? securityUI.state : Ci.nsIWebProgressListener?.STATE_IS_INSECURE ?? 0;
      this._callProgressListeners(b, "onSecurityChange", [b.webProgress, null, state], true, false);
      const cbEvent = b.getContentBlockingEvents?.() ?? 0;
      this._callProgressListeners(b, "onContentBlockingEvent", [b.webProgress, null, cbEvent, true], true, false);
    } catch (_) { /* */ }

    if (shouldBeRemote) (tab as any)?.removeAttribute?.("crashed");

    // Reset findbar browser reference
    if (this.isFindBarInitialized(tab)) {
      try { this.getCachedFindBar(tab).browser = b; } catch (_) { /* */ }
    }

    const evt2 = document.createEvent("Events");
    evt2.initEvent("TabRemotenessChange", true, false);
    (tab as any)?.dispatchEvent?.(evt2);

    return true;
  },

  /**
   * Marks `browser` as a print-preview browser and activates its docshell.
   *
   * Call `deactivatePrintPreviewBrowsers` to revert when print preview is closed.
   */
  activateBrowserForPrintPreview(browser: XULBrowserElement) {
    this._printPreviewBrowsers.add(browser);
    if (browser) (browser as any).docShellIsActive = true;
  },

  /**
   * Deactivates the docshells of all current print-preview browsers and clears
   * the tracking set.
   */
  deactivatePrintPreviewBrowsers() {
    for (const b of this._printPreviewBrowsers) {
      (b as any).docShellIsActive = false;
    }
    this._printPreviewBrowsers.clear();
  },

  _insertBrowser(tab: MozTabbrowserTab, insertedOnTabCreation = false) {
    // If browser is already inserted or window is closed, do nothing
    if ((this.window as any).closed) return;

    const browser = (tab as any)?.linkedBrowser;
    if (!browser) return;

    // Check if browser is already in DOM (not just linkedPanel which stubs have)
    const panel = this.getPanel(browser);
    if (panel?.parentNode && (tab as any).linkedPanel) return;  // Already inserted

    // If browser has lazy proxy properties, remove them
    if (this._browserBindingProperties[0] in browser) {
      for (const name of this._browserBindingProperties) {
        try { delete browser[name]; } catch (_) { /* */ }
      }
    }

    const browserParams = (tab as any)._browserParams ?? { uriIsAboutBlank: true, usingPreloadedContent: false };
    delete (tab as any)._browserParams;
    delete browser._cachedCurrentURI;

    if (panel) {
      // Only assign panel ID if it doesn't already have one
      if (!panel.id) {
        const uniqueId = this._generateUniquePanelID();
        panel.id = uniqueId;
        (tab as any).linkedPanel = uniqueId;
      } else {
        // Panel already has an ID, sync linkedPanel
        (tab as any).linkedPanel = panel.id;
      }

      // Inject into DOM if needed
      const tabpanels = document.getElementById("tabbrowser-tabpanels");
      if (!panel.parentNode && tabpanels) {
        tabpanels.appendChild(panel);
      }
    }

    // Wire up progress listener
    try {
      this._wireProgressListener(tab, browser, browserParams.uriIsAboutBlank, browserParams.usingPreloadedContent);
    } catch (_) { /* */ }

    try {
      browser.droppedLinkHandler = handleDroppedLink;
      browser.loadURI = URILoadingWrapper?.loadURI?.bind?.(URILoadingWrapper, browser);
      browser.fixupAndLoadURIString = URILoadingWrapper?.fixupAndLoadURIString?.bind?.(URILoadingWrapper, browser);
    } catch (_) { /* */ }

    // Start inactive unless using preloaded content
    if (!browserParams.usingPreloadedContent) {
      try { browser.docShellIsActive = false; } catch (_) { /* */ }
    }

    // Set hasSiblings
    try {
      const tabCount = this.tabs.length;
      if (tabCount === 2) {
        this.tabs[0]?.linkedBrowser?.browsingContext && (this.tabs[0].linkedBrowser.browsingContext.hasSiblings = true);
        this.tabs[1]?.linkedBrowser?.browsingContext && (this.tabs[1].linkedBrowser.browsingContext.hasSiblings = true);
      } else if (browser.browsingContext) {
        browser.browsingContext.hasSiblings = tabCount > 1;
      }
    } catch (_) { /* */ }

    if ((tab as any).userContextId) {
      browser.setAttribute?.("usercontextid", (tab as any).userContextId);
    }
    try { if (browser.browsingContext) browser.browsingContext.isAppTab = (tab as any).pinned ?? false; } catch (_) { /* */ }

    if ((tab as any).selected) {
      try { updateUserContextUIIndicator?.(); } catch (_) { /* */ }
    }

    // Fire TabBrowserInserted
    if ((tab as any).isConnected) {
      dispatch(tab, "TabBrowserInserted", { insertedOnTabCreation });
    }
  },

  _createLazyBrowser(tab: MozTabbrowserTab) {
    const browser = (tab as any)?.linkedBrowser;
    if (!browser) return;

    const self = this;
    for (const name of this._browserBindingProperties) {
      let getter: (() => any) | undefined;
      let setter: ((v: any) => any) | undefined;
      switch (name) {
        case "audioMuted":
          getter = () => (tab as any).hasAttribute?.("muted") ?? false;
          break;
        case "contentTitle":
          getter = () => { try { return SessionStore?.getLazyTabValue?.(tab, "title") ?? ""; } catch (_) { return ""; } };
          break;
        case "currentURI":
          getter = () => {
            if (browser._cachedCurrentURI) return browser._cachedCurrentURI;
            const url = ((() => { try { return SessionStore?.getLazyTabValue?.(tab, "url"); } catch (_) { return null; } })()) || "about:blank";
            return (browser._cachedCurrentURI = Services.io.newURI(url));
          };
          break;
        case "didStartLoadSinceLastUserTyping":
          getter = () => () => false;
          break;
        case "fullZoom": case "textZoom":
          getter = () => 1;
          break;
        case "tabHasCustomZoom":
          getter = () => false;
          break;
        case "getTabBrowser":
          getter = () => () => self;
          break;
        case "isRemoteBrowser":
          getter = () => browser.getAttribute?.("remote") === "true";
          break;
        case "permitUnload":
          getter = () => () => ({ permitUnload: true });
          break;
        case "reload": case "reloadWithFlags":
          getter = () => (params: any) => {
            const handler = () => {
              tab.removeEventListener?.("SSTabRestoring", handler);
              browser[name]?.(params);
            };
            tab.addEventListener?.("SSTabRestoring", handler, { once: true });
            self._insertBrowser(tab);
          };
          break;
        case "remoteType":
          getter = () => {
            const url = ((() => { try { return SessionStore?.getLazyTabValue?.(tab, "url"); } catch (_) { return null; } })()) || "about:blank";
            let uri = browser._cachedCurrentURI;
            if (!uri) uri = browser._cachedCurrentURI = Services.io.newURI(url);
            try {
              const oa = E10SUtils?.predictOriginAttributes?.({
                browser, userContextId: (tab as any).getAttribute?.("usercontextid"),
              });
              return E10SUtils?.getRemoteTypeForURI?.(url, gMultiProcessBrowser, gFissionBrowser, undefined, uri, oa);
            } catch (_) { return E10SUtils?.DEFAULT_REMOTE_TYPE ?? "web"; }
          };
          break;
        case "userTypedValue": case "userTypedClear":
          getter = () => { try { return SessionStore?.getLazyTabValue?.(tab, name); } catch (_) { return null; } };
          break;
        default:
          getter = () => { self._insertBrowser(tab); return browser[name]; };
          setter = (value: any) => { self._insertBrowser(tab); return (browser[name] = value); };
      }
      Object.defineProperty(browser, name, {
        get: getter,
        set: setter,
        configurable: true,
        enumerable: true,
      });
    }
  },
};
