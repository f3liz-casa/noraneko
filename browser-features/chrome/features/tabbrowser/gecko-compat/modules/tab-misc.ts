// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L4163~L4632, L7706~L7960
// Section: Misc Tab Utilities — remaining utility functions from the events/utility section

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { dispatch } from "../compat-helpers.ts";
import { TabProgressListener } from "../tabbrowser-scope.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    updateBrowserRemotenessByURL(browser: XULBrowserElement, url: string, options?: any): boolean;
    updateBrowserRemoteness(browser: XULBrowserElement, options: any): boolean;
    // Methods
    clearRelatedTabs(): void;
    refreshBlocked(actor: any, browser: XULBrowserElement, data: any): void;
  }
}

export const methods = {
  /**
   * Opens a new tab on middle-click of a new-tab button, unless the button
   * is disabled.
   */
  // upstream: handleNewTabMiddleClick@3684d91de0 FIREFOX_143_0_1_RELEASE
  handleNewTabMiddleClick(node: any, event: Event) {
    if (node.getAttribute("disabled") === "true") {
      return;
    }

    if ((event as MouseEvent).button === 1) {
      (this.window as any).BrowserCommands.openTab({ event });
      event.stopPropagation();
      event.preventDefault();
    }
  },

  /**
   * Resets the map that tracks opener relationships between tabs, clearing
   * all "last related tab" associations.
   */
  // upstream: clearRelatedTabs@b59671927f FIREFOX_143_0_1_RELEASE
  clearRelatedTabs() {
    this._lastRelatedTabMap = new WeakMap();
  },

  /**
   * Fires a `TabRefreshBlocked` event on the tab associated with `browser`
   * when a page refresh has been blocked.
   */
  // upstream: refreshBlocked@d30b4df956 FIREFOX_143_0_1_RELEASE
  refreshBlocked(actor: any, browser: XULBrowserElement, data: any) {
    // Handle blocked refreshes
    const tab = this.getTabForBrowser(browser);
    if (tab) {
      dispatch(tab, "TabRefreshBlocked", data);
    }
  },

  // upstream: _hasBeforeUnload@a5da1c67f3 FIREFOX_143_0_1_RELEASE
  _hasBeforeUnload(tab: MozTabbrowserTab): boolean {
    const browser = (tab as any).linkedBrowser;
    return browser.permitUnload().permitUnload === false;
  },

  // upstream: _getTriggeringPrincipalFromHistory@1eb1276cf5 FIREFOX_143_0_1_RELEASE
  _getTriggeringPrincipalFromHistory(browser: XULBrowserElement): any {
    const sessionHistory = (browser as any)?.browsingContext?.sessionHistory;
    if (!sessionHistory || !sessionHistory.index || sessionHistory.count == 0) {
      return undefined;
    }
    const currentEntry = sessionHistory.getEntryAtIndex(sessionHistory.index);
    return currentEntry?.triggeringPrincipal;
  },

  /**
   * Move `aBrowser` to another process (or a fresh frameloader): tear the
   * browser down, flip its remote attributes, changeRemoteness, build it
   * back up, and hang a new TabProgressListener on it. Returns false when
   * nothing had to change.
   */
  // upstream: updateBrowserRemoteness@196c81f673 FIREFOX_143_0_1_RELEASE
  updateBrowserRemoteness(aBrowser: XULBrowserElement, { newFrameloader, remoteType }: any = {}): boolean {
    const win = this.window as any;
    const browser = aBrowser as any;
    const isRemote = browser.getAttribute("remote") == "true";

    // We have to be careful with this here, as the "no remote type" is null,
    // not a string. Make sure to check only for undefined, since null is
    // allowed.
    if (remoteType === undefined) {
      throw new Error("Remote type must be set!");
    }

    const shouldBeRemote = remoteType !== E10SUtils.NOT_REMOTE;

    if (!win.gMultiProcessBrowser && shouldBeRemote) {
      throw new Error(
        "Cannot switch to remote browser in a window " +
          "without the remote tabs load context.",
      );
    }

    // Abort if we're not going to change anything
    const oldRemoteType = browser.remoteType;
    if (
      isRemote == shouldBeRemote &&
      !newFrameloader &&
      (!isRemote || oldRemoteType == remoteType)
    ) {
      return false;
    }

    const tab = this.getTabForBrowser(browser) as any;
    // aBrowser needs to be inserted now if it hasn't been already.
    this._insertBrowser(tab);

    let evt = win.document.createEvent("Events");
    evt.initEvent("BeforeTabRemotenessChange", true, false);
    tab.dispatchEvent(evt);

    // Unhook our progress listener.
    let filter = this._tabFilters.get(tab);
    let listener = this._tabListeners.get(tab);
    // We should always have a filter, but if we fail to create a content
    // process when creating a new tab, we can end up here trying to switch
    // remoteness to load about:tabcrashed, without a filter/listener.
    if (filter) {
      browser.webProgress.removeProgressListener(filter);
      filter.removeProgressListener(listener);
    }

    // We'll be creating a new listener, so destroy the old one.
    listener?.destroy();

    const oldDroppedLinkHandler = browser.droppedLinkHandler;
    const oldUserTypedValue = browser.userTypedValue;
    const hadStartedLoad = browser.didStartLoadSinceLastUserTyping();

    // Change the "remote" attribute.

    // Make sure the browser is destroyed so it unregisters from observer notifications
    browser.destroy();

    if (shouldBeRemote) {
      browser.setAttribute("remote", "true");
      browser.setAttribute("remoteType", remoteType);
    } else {
      browser.setAttribute("remote", "false");
      browser.removeAttribute("remoteType");
    }

    // This call actually switches out our frameloaders. Do this as late as
    // possible before rebuilding the browser, as we'll need the new browser
    // state set up completely first.
    browser.changeRemoteness({
      remoteType,
    });

    // Once we have new frameloaders, this call sets the browser back up.
    browser.construct();

    browser.userTypedValue = oldUserTypedValue;
    if (hadStartedLoad) {
      browser.urlbarChangeTracker.startedLoad();
    }

    browser.droppedLinkHandler = oldDroppedLinkHandler;

    // This shouldn't really be necessary, however, this has the side effect
    // of sending MozLayerTreeReady / MozLayerTreeCleared events for remote
    // frames, which the tab switcher depends on.
    //
    // eslint-disable-next-line no-self-assign
    browser.docShellIsActive = browser.docShellIsActive;

    // Create a new tab progress listener for the new browser we just injected,
    // since tab progress listeners have logic for handling the initial about:blank
    // load
    listener = new TabProgressListener(this, tab, browser, true, false);
    this._tabListeners.set(tab, listener);
    if (!filter) {
      filter = Cc["@mozilla.org/appshell/component/browser-status-filter;1"]
        .createInstance(Ci.nsIWebProgress);
      this._tabFilters.set(tab, filter);
    }
    filter.addProgressListener(listener, Ci.nsIWebProgress.NOTIFY_ALL!);

    // Restore the progress listener.
    browser.webProgress.addProgressListener(filter, Ci.nsIWebProgress.NOTIFY_ALL!);

    // Restore the securityUI state.
    const securityUI = browser.securityUI;
    const state = securityUI
      ? securityUI.state
      : Ci.nsIWebProgressListener.STATE_IS_INSECURE;
    this._callProgressListeners(
      browser,
      "onSecurityChange",
      [browser.webProgress, null, state],
      true,
      false,
    );
    const event = browser.getContentBlockingEvents();
    // Include the true final argument to indicate that this event is
    // simulated (instead of being observed by the webProgressListener).
    this._callProgressListeners(
      browser,
      "onContentBlockingEvent",
      [browser.webProgress, null, event, true],
      true,
      false,
    );

    if (shouldBeRemote) {
      // Switching the browser to be remote will connect to a new child
      // process so the browser can no longer be considered to be
      // crashed.
      tab.removeAttribute("crashed");
    }

    // If the findbar has been initialised, reset its browser reference.
    if (this.isFindBarInitialized(tab)) {
      this.getCachedFindBar(tab).browser = browser;
    }

    evt = win.document.createEvent("Events");
    evt.initEvent("TabRemotenessChange", true, false);
    tab.dispatchEvent(evt);

    return true;
  },

  /**
   * Switches `browser` to the remote type required to load `url`, returning
   * `true` when the remoteness was changed.
   *
   * @returns `false` when the browser already has the correct remote type or on error.
   */
  // upstream: updateBrowserRemotenessByURL@8d7f7ea78f FIREFOX_143_0_1_RELEASE
  updateBrowserRemotenessByURL(browser: XULBrowserElement, url: string, options: any = {}): boolean {
    const currentRemoteType = browser.remoteType;
    const userContextId = browser.getAttribute("usercontextid") || 0;
    const oa = E10SUtils.predictOriginAttributes({ window: this.window, userContextId });
    const remoteType = E10SUtils.getRemoteTypeForURI(
      url,
      gMultiProcessBrowser,
      gFissionBrowser,
      options.remoteType ?? E10SUtils.DEFAULT_REMOTE_TYPE,
      null,
      oa
    );

    if (currentRemoteType === remoteType) {
      return false;
    }

    return this.updateBrowserRemoteness(browser, { remoteType, ...options });
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
