// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L5801~L5944, L6178~L6305

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { TabProgressListener, updateUserContextUIIndicator } from "../tabbrowser-scope.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    swapBrowsers(ourTab: MozTabbrowserTab, otherTab: MozTabbrowserTab): void;
    swapBrowsersAndCloseOther(ourTab: MozTabbrowserTab, otherTab: MozTabbrowserTab): boolean;
    _swapBrowserDocShells(ourTab: MozTabbrowserTab, otherBrowser: XULBrowserElement, stateFlags?: number): void;
    _swapRegisteredOpenURIs(browser: XULBrowserElement, otherBrowser: any): void;
    setIcon(tab: MozTabbrowserTab, iconUrl: string): void;
    _tabAttrModified(tab: MozTabbrowserTab, modifiedAttrs: string[]): void;
    setTabTitle(tab: MozTabbrowserTab): void;
    _endRemoveTab(tab: MozTabbrowserTab): void;
    shouldActivateDocShell(browser: XULBrowserElement): boolean;
    updateCurrentBrowser(forceUpdate?: boolean): void;
    getFindBar(tab: MozTabbrowserTab): Promise<any>;
  }
}

export const swapBrowserMethods = {
  // upstream: swapBrowsers@694109d5b3 FIREFOX_143_0_1_RELEASE
  swapBrowsers(ourTab: MozTabbrowserTab, otherTab: MozTabbrowserTab) {
    const otherBrowser = (otherTab as any).linkedBrowser;
    const otherTabBrowser = otherBrowser.getTabBrowser();

    // We aren't closing the other tab so, we also need to swap its tablisteners.
    let filter = otherTabBrowser._tabFilters.get(otherTab);
    let tabListener = otherTabBrowser._tabListeners.get(otherTab);
    otherBrowser.webProgress.removeProgressListener(filter);
    filter.removeProgressListener(tabListener);

    // Perform the docshell swap through the common mechanism.
    this._swapBrowserDocShells(ourTab, otherBrowser);

    // Restore the listeners for the swapped in tab.
    tabListener = new TabProgressListener(otherTabBrowser, otherTab, otherBrowser, false, false);
    otherTabBrowser._tabListeners.set(otherTab, tabListener);

    const notifyAll = Ci.nsIWebProgress.NOTIFY_ALL!;
    filter.addProgressListener(tabListener, notifyAll);
    otherBrowser.webProgress.addProgressListener(filter, notifyAll);
  },

  // upstream: swapBrowsersAndCloseOther@f28a7412fb FIREFOX_143_0_1_RELEASE
  swapBrowsersAndCloseOther(ourTab: MozTabbrowserTab, otherTab: MozTabbrowserTab) {
    // Do not allow transfering a private tab to a non-private window
    // and vice versa.
    if (
      PrivateBrowsingUtils.isWindowPrivate(this.window) !=
      PrivateBrowsingUtils.isWindowPrivate((otherTab as any).ownerGlobal)
    ) {
      return false;
    }

    // Do not allow transfering a useRemoteSubframes tab to a
    // non-useRemoteSubframes window and vice versa.
    if (gFissionBrowser != (otherTab as any).ownerGlobal.gFissionBrowser) {
      return false;
    }

    const ourBrowser = this.getBrowserForTab(ourTab) as any;
    const otherBrowser = (otherTab as any).linkedBrowser;

    // Can't swap between chrome and content processes.
    if (ourBrowser.isRemoteBrowser != otherBrowser.isRemoteBrowser) {
      return false;
    }

    // Keep the userContextId if set on other browser
    if (otherBrowser.hasAttribute("usercontextid")) {
      ourBrowser.setAttribute(
        "usercontextid",
        otherBrowser.getAttribute("usercontextid")
      );
    }

    // That's gBrowser for the other window, not the tab's browser!
    const remoteBrowser = (otherTab as any).ownerGlobal.gBrowser;
    const isPending = (otherTab as any).hasAttribute("pending");

    const otherTabListener = remoteBrowser._tabListeners.get(otherTab);
    let stateFlags = 0;
    if (otherTabListener) {
      stateFlags = otherTabListener.mStateFlags;
    }

    // Expedite the removal of the icon if it was already scheduled.
    if ((otherTab as any)._soundPlayingAttrRemovalTimer) {
      clearTimeout((otherTab as any)._soundPlayingAttrRemovalTimer);
      (otherTab as any)._soundPlayingAttrRemovalTimer = 0;
      (otherTab as any).removeAttribute("soundplaying");
      remoteBrowser._tabAttrModified(otherTab, ["soundplaying"]);
    }

    // First, start teardown of the other browser.  Make sure to not
    // fire the beforeunload event in the process.  Close the other
    // window if this was its last tab.
    if (
      !remoteBrowser._beginRemoveTab(otherTab, {
        adoptedByTab: ourTab,
        closeWindowWithLastTab: true,
      })
    ) {
      return false;
    }

    // If this is the last tab of the window, hide the window
    // immediately without animation before the docshell swap, to avoid
    // about:blank being painted.
    const [closeWindow] = (otherTab as any)._endRemoveArgs;
    if (closeWindow) {
      const win = (otherTab as any).ownerGlobal;
      win.windowUtils.suppressAnimation(true);
      // Only suppressing window animations isn't enough to avoid
      // an empty content area being painted.
      const baseWin = win.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow);
      baseWin.visibility = false;
    }

    const modifiedAttrs: string[] = [];
    if ((otherTab as any).hasAttribute("muted")) {
      (ourTab as any).toggleAttribute("muted", true);
      (ourTab as any).muteReason = (otherTab as any).muteReason;
      // For non-lazy tabs, mute() must be called.
      if ((ourTab as any).linkedPanel) {
        ourBrowser.mute();
      }
      modifiedAttrs.push("muted");
    }
    if ((otherTab as any).hasAttribute("undiscardable")) {
      (ourTab as any).toggleAttribute("undiscardable", true);
      modifiedAttrs.push("undiscardable");
    }
    if ((otherTab as any).hasAttribute("soundplaying")) {
      (ourTab as any).toggleAttribute("soundplaying", true);
      modifiedAttrs.push("soundplaying");
    }
    if ((otherTab as any).hasAttribute("usercontextid")) {
      (ourTab as any).setUserContextId((otherTab as any).getAttribute("usercontextid"));
      modifiedAttrs.push("usercontextid");
    }
    if ((otherTab as any).hasAttribute("sharing")) {
      (ourTab as any).setAttribute("sharing", (otherTab as any).getAttribute("sharing"));
      modifiedAttrs.push("sharing");
      (ourTab as any)._sharingState = (otherTab as any)._sharingState;
      webrtcUI.swapBrowserForNotification(otherBrowser, ourBrowser);
    }
    if ((otherTab as any).hasAttribute("pictureinpicture")) {
      (ourTab as any).toggleAttribute("pictureinpicture", true);
      modifiedAttrs.push("pictureinpicture");

      const event = new CustomEvent("TabSwapPictureInPicture", {
        detail: ourTab,
      });
      (otherTab as any).dispatchEvent(event);
    }

    if (otherBrowser.isDistinctProductPageVisit) {
      ourBrowser.isDistinctProductPageVisit = true;
    }

    SitePermissions.copyTemporaryPermissions(otherBrowser, ourBrowser);

    // Add a reference to the original registeredOpenURI to the closing
    // tab so that events operating on the tab before close can reference it.
    (otherTab as any)._originalRegisteredOpenURI = otherBrowser.registeredOpenURI;

    // If the other tab is pending (i.e. has not been restored, yet)
    // then do not switch docShells but retrieve the other tab's state
    // and apply it to our tab.
    if (isPending) {
      // Tag tab so that the extension framework can ignore tab events that
      // are triggered amidst the tab/browser restoration process
      // (TabHide, TabPinned, TabUnpinned, "muted" attribute changes, etc.).
      (ourTab as any).initializingTab = true;
      delete ourBrowser._cachedCurrentURI;
      SessionStore.setTabState(ourTab, SessionStore.getTabState(otherTab));
      delete (ourTab as any).initializingTab;

      // Make sure to unregister any open URIs.
      this._swapRegisteredOpenURIs(ourBrowser, otherBrowser);
    } else {
      // Workarounds for bug 458697
      // Icon might have been set on DOMLinkAdded, don't override that.
      if (!ourBrowser.mIconURL && otherBrowser.mIconURL) {
        this.setIcon(ourTab, otherBrowser.mIconURL);
      }
      const isBusy = (otherTab as any).hasAttribute("busy");
      if (isBusy) {
        (ourTab as any).setAttribute("busy", "true");
        modifiedAttrs.push("busy");
        if ((ourTab as any).selected) {
          this._isBusy = true;
        }
      }

      this._swapBrowserDocShells(ourTab, otherBrowser, stateFlags);
    }

    // Unregister the previously opened URI
    if (otherBrowser.registeredOpenURI) {
      const userContextId = otherBrowser.getAttribute("usercontextid") || 0;
      this.UrlbarProviderOpenTabs.unregisterOpenTab(
        otherBrowser.registeredOpenURI.spec,
        userContextId,
        (otherTab as any).group?.id,
        PrivateBrowsingUtils.isWindowPrivate(this.window)
      );
      delete otherBrowser.registeredOpenURI;
    }

    // Handle findbar data (if any)
    const otherFindBar = (otherTab as any)._findBar;
    if (otherFindBar && otherFindBar.findMode == otherFindBar.FIND_NORMAL) {
      const oldValue = otherFindBar._findField.value;
      const wasHidden = otherFindBar.hidden;
      const ourFindBarPromise = this.getFindBar(ourTab);
      ourFindBarPromise.then((ourFindBar: any) => {
        if (!ourFindBar) {
          return;
        }
        ourFindBar._findField.value = oldValue;
        if (!wasHidden) {
          ourFindBar.onFindCommand();
        }
      });
    }

    // Finish tearing down the tab that's going away.
    if (closeWindow) {
      (otherTab as any).ownerGlobal.close();
    } else {
      remoteBrowser._endRemoveTab(otherTab);
    }

    (ourTab as any)._labelIsInitialTitle = false;
    this.setTabTitle(ourTab);

    // If the tab was already selected (this happens in the scenario
    // of replaceTabWithWindow), notify onLocationChange, etc.
    if ((ourTab as any).selected) {
      this.updateCurrentBrowser(true);
    }

    if (modifiedAttrs.length) {
      this._tabAttrModified(ourTab, modifiedAttrs);
    }
    return true;
  },

  // upstream: _swapBrowserDocShells@853247ab91 FIREFOX_143_0_1_RELEASE
  _swapBrowserDocShells(ourTab: MozTabbrowserTab, otherBrowser: XULBrowserElement, stateFlags?: number) {
    // ourTab's browser needs to be inserted now if it hasn't already.
    this._insertBrowser(ourTab);

    // Unhook our progress listener
    const filter = this._tabFilters.get(ourTab);
    let tabListener = this._tabListeners.get(ourTab);
    const ourBrowser = this.getBrowserForTab(ourTab) as any;
    ourBrowser.webProgress.removeProgressListener(filter);
    filter.removeProgressListener(tabListener);

    // Make sure to unregister any open URIs.
    this._swapRegisteredOpenURIs(ourBrowser, otherBrowser);

    const remoteBrowser = (otherBrowser as any).ownerGlobal.gBrowser;

    // If switcher is active, it will intercept swap events and
    // react as needed.
    if (!this._switcher) {
      (otherBrowser as any).docShellIsActive = this.shouldActivateDocShell(ourBrowser);
    }

    const ourContainer = ourBrowser.ownerDocument.getElementById("browser");
    const otherContainer = (otherBrowser as any).ownerDocument.getElementById("browser");
    const ourContainerWasHidden = ourContainer.hidden;
    const otherContainerWasHidden = otherContainer.hidden;

    // #browser is hidden in Customize Mode; this breaks docshell swapping,
    // so we need to toggle 'hidden' to make swapping work in this case.
    ourContainer.hidden = otherContainer.hidden = false;

    // Swap the docshells
    ourBrowser.swapDocShells(otherBrowser);

    ourContainer.hidden = ourContainerWasHidden;
    otherContainer.hidden = otherContainerWasHidden;

    // Swap permanentKey properties.
    const ourPermanentKey = ourBrowser.permanentKey;
    ourBrowser.permanentKey = (otherBrowser as any).permanentKey;
    (otherBrowser as any).permanentKey = ourPermanentKey;
    (ourTab as any).permanentKey = ourBrowser.permanentKey;
    if (remoteBrowser) {
      const otherTab = remoteBrowser.getTabForBrowser(otherBrowser);
      if (otherTab) {
        otherTab.permanentKey = (otherBrowser as any).permanentKey;
      }
    }

    // Restore the progress listener
    tabListener = new TabProgressListener(this, ourTab, ourBrowser, false, false, stateFlags);
    this._tabListeners.set(ourTab, tabListener);

    const notifyAll = Ci.nsIWebProgress.NOTIFY_ALL!;
    filter.addProgressListener(tabListener, notifyAll);
    ourBrowser.webProgress.addProgressListener(filter, notifyAll);
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
    const newBrowser: any = this.getBrowserAtIndex(this.tabContainer.selectedIndex);
    if (this.selectedBrowser === newBrowser && !forceUpdate) return;

    const oldBrowser: any = this.selectedBrowser;
    // Once the async switcher starts, it's unpredictable when it will touch
    // the address bar, thus we store its state immediately.
    win.gURLBar?.saveSelectionStateForBrowser(oldBrowser);

    const newTab: any = this.getTabForBrowser(newBrowser);

    if (!forceUpdate) {
      if (win.gMultiProcessBrowser) {
        this._asyncTabSwitching = true;
        this._getSwitcher().requestTab(newTab);
        this._asyncTabSwitching = false;
      }
      (document as any).commandDispatcher.lock();
    }

    const oldTab: any = this.selectedTab;

    // Preview mode should not reset the owner
    if (!this._previewMode && !oldTab.selected) oldTab.owner = null;
    const lastRelatedTab = this._lastRelatedTabMap.get(oldTab);
    if (lastRelatedTab && !lastRelatedTab.selected) lastRelatedTab.owner = null;
    this._lastRelatedTabMap = new WeakMap();

    if (!win.gMultiProcessBrowser) {
      oldBrowser.removeAttribute("primary");
      oldBrowser.docShellIsActive = false;
      newBrowser.setAttribute("primary", "true");
      newBrowser.docShellIsActive = !document.hidden;
    }

    this._selectedBrowser = newBrowser;
    this._selectedTab = newTab;
    this.showTab(newTab);
    this.appendStatusPanel();
    this._updateVisibleNotificationBox(newBrowser);

    const oldBrowserPopupsBlocked = oldBrowser.popupBlocker.getBlockedPopupCount();
    const newBrowserPopupsBlocked = newBrowser.popupBlocker.getBlockedPopupCount();
    if (oldBrowserPopupsBlocked != newBrowserPopupsBlocked) {
      newBrowser.popupBlocker.updateBlockedPopupsUI();
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
    if (listener && listener.mStateFlags) {
      this._callProgressListeners(
        null as any, "onUpdateCurrentBrowser",
        [listener.mStateFlags, listener.mStatus, listener.mMessage, listener.mTotalProgress], true, false,
      );
    }

    if (!this._previewMode) {
      newTab.recordTimeFromUnloadToReload();
      newTab.updateLastAccessed();
      oldTab.updateLastAccessed();
      // if this is the foreground window, update the last-seen timestamps.
      if (BrowserWindowTracker.getTopWindow() === win) {
        newTab.updateLastSeenActive();
        oldTab.updateLastSeenActive();
      }

      const oldFindBar = oldTab._findBar;
      if (oldFindBar && oldFindBar.findMode == oldFindBar.FIND_NORMAL && !oldFindBar.hidden) {
        this._lastFindValue = oldFindBar._findField.value;
      }

      this.updateTitlebar();

      newTab.removeAttribute("titlechanged");
      newTab.attention = false;

      // The tab has been selected, it's not unselected anymore.
      newBrowser.unselectedTabHover(false);
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

      this._tabAttrModified(oldTab, ["selected"]);
      this._tabAttrModified(newTab, ["selected"]);

      this._startMultiSelectChange();
      this._multiSelectChangeSelected = true;
      this.clearMultiSelectedTabs();
      if (this._multiSelectChangeAdditions.size) {
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
        win.gURLBar.afterTabSwitchFocusChange();
      }
    }

    updateUserContextUIIndicator(win);
    win.gPermissionPanel.updateSharingIndicator();

    // Enable touch events to start a native dragging session (Windows only).
    oldTab.removeAttribute("touchdownstartsdrag");
    newTab.setAttribute("touchdownstartsdrag", "true");

    if (!win.gMultiProcessBrowser) {
      (document as any).commandDispatcher.unlock();
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
