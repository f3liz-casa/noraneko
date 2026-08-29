// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L5801~L5944, L6178~L6305

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { resolveTabId, dispatch } from "../compat-helpers.ts";
import { DOMRegistry } from "../DOMRegistry.ts";
import { appState, send } from "../../state/store.ts";
import type { TabId } from "../../types/TabState.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    _isBusy: boolean;
    _asyncTabSwitching: boolean;
    _switcher: any;
    _tabFilters: Map<any, any>;
    _tabListeners: Map<any, any>;
    swapBrowsers(ourTab: MozTabbrowserTab, otherTab: MozTabbrowserTab): void;
    swapBrowsersAndCloseOther(ourTab: MozTabbrowserTab, otherTab: MozTabbrowserTab): void;
    _swapBrowserDocShells(ourTab: MozTabbrowserTab, otherBrowser: XULBrowserElement, stateFlags?: number): void;
    _swapRegisteredOpenURIs(browser: XULBrowserElement, otherBrowser: any): void;
    setIcon(tab: MozTabbrowserTab, iconUrl: string): void;
    _tabAttrModified(tab: MozTabbrowserTab, modifiedAttrs: string[]): void;
    setTabTitle(tab: MozTabbrowserTab): void;
    _endRemoveTab(tab: MozTabbrowserTab): void;
    window: Window;
    shouldActivateDocShell(browser: XULBrowserElement): boolean;
    updateCurrentBrowser(forceUpdate?: boolean): void;
    getFindBar(tab: MozTabbrowserTab): Promise<any>;
  }
}

export const swapBrowserMethods = {
  // upstream: swapBrowsers@694109d5b3 FIREFOX_143_0_1_RELEASE
  swapBrowsers(ourTab: MozTabbrowserTab, otherTab: MozTabbrowserTab) {
    const id1 = resolveTabId(ourTab);
    const id2 = resolveTabId(otherTab);
    if (!id1 || !id2) return;

    const otherTabBrowser = (otherTab as any).ownerGlobal?.gBrowser;
    const ourBrowser = DOMRegistry.getBrowser(id1) as any;
    const otherBrowser = otherTabBrowser?.getBrowserForTab?.(otherTab) ?? DOMRegistry.getBrowser(id2);
    if (!ourBrowser || !otherBrowser) return;

    if (!ourBrowser.mIconURL && (otherBrowser as any).mIconURL) {
      this.setIcon(ourTab, (otherBrowser as any).mIconURL);
    }

    const stateFlags = (otherTabBrowser?._tabListeners?.get?.(otherTab) as any)?.mStateFlags;
    this._swapBrowserDocShells(ourTab, otherBrowser, stateFlags);
  },

  // upstream: swapBrowsersAndCloseOther@f28a7412fb FIREFOX_143_0_1_RELEASE
  swapBrowsersAndCloseOther(ourTab: MozTabbrowserTab, otherTab: MozTabbrowserTab) {
    const id1 = resolveTabId(ourTab);
    const id2 = resolveTabId(otherTab);
    if (!id1 || !id2) return;

    const otherTabBrowser = (otherTab as any).ownerGlobal?.gBrowser;
    const ourBrowser = DOMRegistry.getBrowser(id1) as any;
    const otherBrowser = otherTabBrowser?.getBrowserForTab?.(otherTab) ?? DOMRegistry.getBrowser(id2);
    if (!ourBrowser || !otherBrowser) return;

    try {
      const isPrivate = (globalThis as any).PrivateBrowsingUtils?.isWindowPrivate?.(this.window);
      const otherIsPrivate = (globalThis as any).PrivateBrowsingUtils?.isWindowPrivate?.((otherTab as any).ownerGlobal);
      if (isPrivate !== otherIsPrivate) return;
    } catch (_) { /* */ }

    const isPending = (otherTab as any).hasAttribute?.("pending");
    const closeWindow = otherTabBrowser?.tabs?.length === 1;
    const modifiedAttrs: string[] = [];

    if (otherTab._soundPlayingAttrRemovalTimer) {
      (otherTab._soundPlayingAttrRemovalTimer as any).cancel?.();
      otherTab._soundPlayingAttrRemovalTimer = null;
    }

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
      try { (globalThis as any).webrtcUI?.swapBrowserForNotification?.(otherBrowser, ourBrowser); } catch (_) { /* */ }
    }
    if ((otherTab as any).hasAttribute?.("pictureinpicture")) {
      (ourTab as any).toggleAttribute?.("pictureinpicture", true);
      modifiedAttrs.push("pictureinpicture");
      dispatch(otherTab, "TabSwapPictureInPicture", ourTab);
    }

    try { (globalThis as any).SitePermissions?.copyTemporaryPermissions?.(otherBrowser, ourBrowser); } catch (_) { /* */ }

    (otherTab as any)._originalRegisteredOpenURI = (otherBrowser as any).registeredOpenURI;

    if (otherBrowser.isDistinctProductPageVisit) {
      ourBrowser.isDistinctProductPageVisit = otherBrowser.isDistinctProductPageVisit;
    }

    const stateFlags = (otherTabBrowser?._tabListeners?.get?.(otherTab) as any)?.mStateFlags;

    if (isPending) {
      (ourTab as any).initializingTab = true;
      delete ourBrowser._cachedCurrentURI;
      try { (globalThis as any).SessionStore?.setTabState?.(ourTab, (globalThis as any).SessionStore?.getTabState?.(otherTab)); } catch (_) { /* */ }
      delete (ourTab as any).initializingTab;
      this._swapRegisteredOpenURIs(ourBrowser, otherBrowser);
    } else {
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

    if ((otherBrowser as any).registeredOpenURI) {
      try {
        const uci = (otherBrowser as any).getAttribute?.("usercontextid") || 0;
        (globalThis as any).UrlbarProviderOpenTabs?.unregisterOpenTab?.(
          (otherBrowser as any).registeredOpenURI.spec, uci,
          (otherTab as any).group?.id,
          (globalThis as any).PrivateBrowsingUtils?.isWindowPrivate?.(this.window),
        );
      } catch (_) { /* */ }
      delete (otherBrowser as any).registeredOpenURI;
    }

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

    if (closeWindow) {
      (otherTab as any).ownerGlobal?.close?.();
    } else {
      otherTabBrowser?._endRemoveTab?.(otherTab);
    }

    (ourTab as any)._labelIsInitialTitle = false;
    this.setTabTitle(ourTab);

    if ((ourTab as any).selected) {
      this.updateCurrentBrowser(true);
    }

    if (modifiedAttrs.length) {
      this._tabAttrModified(ourTab, modifiedAttrs);
    }
  },

  // upstream: _swapBrowserDocShells@853247ab91 FIREFOX_143_0_1_RELEASE
  _swapBrowserDocShells(ourTab: MozTabbrowserTab, otherBrowser: XULBrowserElement, stateFlags?: number) {
    const ourBrowser = this.getBrowserForTab(ourTab) as any;
    if (!ourBrowser) return;

    const filter = this._tabFilters.get(ourTab);
    const tabListener = this._tabListeners.get(ourTab);
    if (filter && tabListener) {
      try {
        ourBrowser.webProgress?.removeProgressListener?.(filter);
        filter.removeProgressListener?.(tabListener);
      } catch (_) { /* */ }
    }

    this._swapRegisteredOpenURIs(ourBrowser, otherBrowser);

    if (!this._switcher) {
      try { otherBrowser.docShellIsActive = this.shouldActivateDocShell(ourBrowser); } catch (_) { /* */ }
    }

    const ourContainer = ourBrowser.ownerDocument?.getElementById?.("browser");
    const otherContainer = otherBrowser.ownerDocument?.getElementById?.("browser");
    const ourWasHidden = ourContainer?.hidden;
    const otherWasHidden = otherContainer?.hidden;
    if (ourContainer) ourContainer.hidden = false;
    if (otherContainer) otherContainer.hidden = false;

    try { ourBrowser.swapDocShells?.(otherBrowser); } catch (e) { console.warn("swapDocShells failed", e); }

    if (ourContainer) ourContainer.hidden = ourWasHidden ?? false;
    if (otherContainer) otherContainer.hidden = otherWasHidden ?? false;

    const ourPermanentKey = ourBrowser.permanentKey;
    ourBrowser.permanentKey = otherBrowser.permanentKey;
    otherBrowser.permanentKey = ourPermanentKey;
    (ourTab as any).permanentKey = ourBrowser.permanentKey;

    const ourId = resolveTabId(ourTab);
    if (ourId) {
      send({ type: "SET_PERMANENT_KEY", tabId: ourId, permanentKey: ourBrowser.permanentKey });
    }

    if (filter) {
      try {
        const newListener = (globalThis as any).TabProgressListener ? new (globalThis as any).TabProgressListener(ourTab, ourBrowser, false, false, stateFlags) : null;
        if (newListener) {
          this._tabListeners.set(ourTab, newListener);
          const notifyAll = (globalThis as any).Ci?.nsIWebProgress?.NOTIFY_ALL || 0xffffffff;
          filter.addProgressListener(newListener, notifyAll);
          ourBrowser.webProgress?.addProgressListener?.(filter, notifyAll);
        }
      } catch (_) { /* */ }
    }
  },

  // ==========================================================================
  // Tab switching
  // tabbrowser.js L1734~L1993 (updateCurrentBrowser)
  // ==========================================================================

  /**
   * The tabbox has moved its selection (tab strip and panel deck already
   * point at the new tab); bring the rest of the browser along. Reached from
   * the tabpanels `select` listener, so every selection change — a click, a
   * shortcut, `gBrowser.selectedTab = t` — passes through here once.
   *
   * Not ported: Glean tab-switch timing.
   */
  // upstream: updateCurrentBrowser@c801423591 FIREFOX_143_0_1_RELEASE
  updateCurrentBrowser(forceUpdate?: boolean) {
    const win = this.window as any;
    const newTab: any = this.tabContainer.selectedItem;
    const newBrowser: any = newTab ? this.getBrowserForTab(newTab) : null;
    if (!newTab || !newBrowser) return;
    if (this.selectedBrowser === newBrowser && !forceUpdate) return;

    const oldTab: any = this.selectedTab;
    const oldBrowser: any = this.selectedBrowser;
    // Once the async switcher starts, it's unpredictable when it will touch
    // the address bar, thus we store its state immediately.
    win.gURLBar?.saveSelectionStateForBrowser?.(oldBrowser);

    if (!forceUpdate) {
      if (win.gMultiProcessBrowser) {
        this._asyncTabSwitching = true;
        this._getSwitcher().requestTab(newTab);
        this._asyncTabSwitching = false;
      }
      (document as any).commandDispatcher?.lock();
    }

    // Preview mode should not reset the owner
    if (oldTab && !this._previewMode && !oldTab.selected) oldTab.owner = null;
    const lastRelatedTab = oldTab ? this._lastRelatedTabMap.get(oldTab) : null;
    if (lastRelatedTab && !lastRelatedTab.selected) lastRelatedTab.owner = null;
    this._lastRelatedTabMap = new WeakMap();

    if (!win.gMultiProcessBrowser) {
      if (oldBrowser) {
        oldBrowser.removeAttribute("primary");
        oldBrowser.docShellIsActive = false;
      }
      newBrowser.setAttribute("primary", "true");
      newBrowser.docShellIsActive = !document.hidden;
    }

    // tabbrowser.js sets `_selectedTab`/`_selectedBrowser` here; ours live in
    // the store, and `selectedTab`/`selectedBrowser` read from it.
    const newId = resolveTabId(newTab);
    if (newId) send({ type: "SELECT_TAB", tabId: newId });
    this.showTab(newTab);
    this.appendStatusPanel();
    this._updateVisibleNotificationBox?.(newBrowser);

    const oldBlocker = oldBrowser?.popupAndRedirectBlocker;
    const newBlocker = newBrowser.popupAndRedirectBlocker;
    if (oldBlocker && newBlocker) {
      if (oldBlocker.getBlockedPopupCount() != newBlocker.getBlockedPopupCount()) {
        newBlocker.sendObserverUpdateBlockedPopupsEvent();
      }
      if (oldBlocker.isRedirectBlocked() != newBlocker.isRedirectBlocked()) {
        newBlocker.sendObserverUpdateBlockedRedirectEvent();
      }
    }

    // Update the URL bar.
    const webProgress = newBrowser.webProgress;
    this._callProgressListeners(
      null as any, "onLocationChange", [webProgress, null, newBrowser.currentURI, 0, true], true, false,
    );
    const securityUI = newBrowser.securityUI;
    if (securityUI) {
      this._callProgressListeners(
        null as any, "onSecurityChange", [webProgress, null, securityUI.state], true, false,
      );
      // The true final argument marks this event as simulated.
      this._callProgressListeners(
        null as any, "onContentBlockingEvent",
        [webProgress, null, newBrowser.getContentBlockingEvents(), true], true, false,
      );
    }
    const listener = this._tabListeners.get(newTab);
    if (listener?._stateFlags) {
      this._callProgressListeners(
        null as any, "onUpdateCurrentBrowser",
        [listener._stateFlags, listener._status, listener._message, listener._totalProgress], true, false,
      );
    }

    if (!this._previewMode) {
      newTab.recordTimeFromUnloadToReload?.();
      newTab.updateLastAccessed?.();
      oldTab?.updateLastAccessed?.();
      // if this is the foreground window, update the last-seen timestamps.
      if (win.BrowserWindowTracker?.getTopWindow?.() === win) {
        newTab.updateLastSeenActive?.();
        oldTab?.updateLastSeenActive?.();
      }

      const oldFindBar = oldTab?._findBar;
      if (oldFindBar && oldFindBar.findMode == oldFindBar.FIND_NORMAL && !oldFindBar.hidden) {
        this._lastFindValue = oldFindBar._findField.value;
      }

      this.updateTitlebar();

      newTab.removeAttribute("titlechanged");
      newTab.attention = false;

      // The tab has been selected, it's not unselected anymore.
      newBrowser.unselectedTabHover?.(false);
    }

    // If the new tab's busy state differs from ours, tell the global
    // progress listeners so the throbber and stop/reload button follow.
    const busy = newTab.hasAttribute("busy");
    if (busy !== !!this._isBusy) {
      this._isBusy = busy;
      const flag = busy
        ? Ci.nsIWebProgressListener.STATE_START!
        : Ci.nsIWebProgressListener.STATE_STOP!;
      this._callProgressListeners(
        null as any, "onStateChange",
        [webProgress, null, flag | Ci.nsIWebProgressListener.STATE_IS_NETWORK!, 0], true, false,
      );
    }

    // TabSelect is suppressed during preview mode to avoid confusing
    // extensions and other code that rely upon the other suppressed changes.
    if (!this._previewMode) {
      newTab.dispatchEvent(new CustomEvent("TabSelect", {
        bubbles: true,
        cancelable: false,
        detail: { previousTab: oldTab },
      }));

      this._checkIfShouldTriggerTabSelectMessage();

      if (oldTab) this._tabAttrModified(oldTab, ["selected"]);
      this._tabAttrModified(newTab, ["selected"]);

      // `_startMultiSelectChange` is declared by tab-groups but not written yet.
      this._startMultiSelectChange?.();
      this._multiSelectChangeSelected = true;
      this.clearMultiSelectedTabs();
      if (this._multiSelectChangeAdditions?.size && oldTab) {
        // Some tab has been multiselected just before switching tabs.
        // The tab that was selected at that point should also be multiselected.
        this.addToMultiSelectedTabs(oldTab);
      }

      if (!win.gMultiProcessBrowser) {
        this._adjustFocusBeforeTabSwitch(oldTab, newTab);
        this._adjustFocusAfterTabSwitch(newTab);
      }

      // A forced update can mean the tab was already selected; keep the
      // urlbar's internal state in sync as if focus changed.
      if (forceUpdate || !win.gMultiProcessBrowser) {
        win.gURLBar?.afterTabSwitchFocusChange?.();
      }
    }

    win.updateUserContextUIIndicator?.();
    win.gPermissionPanel?.updateSharingIndicator?.();

    // Enable touch events to start a native dragging session (Windows only).
    oldTab?.removeAttribute("touchdownstartsdrag");
    newTab.setAttribute("touchdownstartsdrag", "true");

    if (!win.gMultiProcessBrowser) {
      (document as any).commandDispatcher?.unlock();
      this.dispatchEvent(new CustomEvent("TabSwitchDone", { bubbles: true, cancelable: true }));
    }
  },

  // upstream: _swapRegisteredOpenURIs@287a5bf51d FIREFOX_143_0_1_RELEASE
  _swapRegisteredOpenURIs(ourBrowser: XULBrowserElement, otherBrowser: XULBrowserElement) {
    const tmp = (ourBrowser as any).registeredOpenURI;
    delete (ourBrowser as any).registeredOpenURI;
    if ((otherBrowser as any).registeredOpenURI) {
      (ourBrowser as any).registeredOpenURI = (otherBrowser as any).registeredOpenURI;
      delete (otherBrowser as any).registeredOpenURI;
    }
    if (tmp) (otherBrowser as any).registeredOpenURI = tmp;
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
