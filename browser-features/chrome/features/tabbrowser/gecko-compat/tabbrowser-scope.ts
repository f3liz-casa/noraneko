// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js: what lives in its private block scope, outside
// the Tabbrowser class. A compat instance cannot reach those originals, so
// it carries its own — FAVICON_DEFAULTS (L14), updateUserContextUIIndicator
// (L39), TabProgressListener (L7971), URILoadingWrapper (L8558).

import type { TabbrowserCompat } from "./TabbrowserCompat.ts";

// The typelib types every interface constant as `number | undefined`.
const WPL = Ci.nsIWebProgressListener as Required<typeof Ci.nsIWebProgressListener>;
const WNAV = Ci.nsIWebNavigation as Required<typeof Ci.nsIWebNavigation>;
const FIXUP = Ci.nsIURIFixup as Required<typeof Ci.nsIURIFixup>;

/**
 * A set of known icons to use for internal pages. These are hardcoded so we can
 * start loading them faster than FaviconLoader would normally find them.
 */
export const FAVICON_DEFAULTS: Record<string, string> = {
  "about:newtab": "chrome://branding/content/icon32.png",
  "about:home": "chrome://branding/content/icon32.png",
  "about:welcome": "chrome://branding/content/icon32.png",
  "about:privatebrowsing": "chrome://browser/skin/privatebrowsing/favicon.svg",
};

/**
 * Updates the User Context UI indicators if the browser is in a non-default context
 */
export function updateUserContextUIIndicator(window: any) {
  function replaceContainerClass(classType: string, element: Element, value: string) {
    const prefix = "identity-" + classType + "-";
    if (value && element.classList.contains(prefix + value)) {
      return;
    }
    for (const className of element.classList) {
      if (className.startsWith(prefix)) {
        element.classList.remove(className);
      }
    }
    if (value) {
      element.classList.add(prefix + value);
    }
  }

  const document = window.document;
  const gBrowser = window.gBrowser;
  const hbox = document.getElementById("userContext-icons");

  const userContextId = gBrowser.selectedBrowser.getAttribute("usercontextid");
  if (!userContextId) {
    replaceContainerClass("color", hbox, "");
    hbox.hidden = true;
    return;
  }

  const identity = ContextualIdentityService.getPublicIdentityFromId(userContextId);
  if (!identity) {
    replaceContainerClass("color", hbox, "");
    hbox.hidden = true;
    return;
  }

  replaceContainerClass("color", hbox, identity.color);

  const label = ContextualIdentityService.getUserContextLabel(userContextId);
  document.getElementById("userContext-label").textContent = label;
  // Also set the container label as the tooltip so we can only show the icon
  // in small windows.
  hbox.setAttribute("tooltiptext", label);

  const indicator = document.getElementById("userContext-indicator");
  replaceContainerClass("icon", indicator, identity.icon);

  hbox.hidden = false;
}

/**
 * A web progress listener object definition for a given tab.
 *
 * tabbrowser.js reaches its Tabbrowser through the window's `gBrowser`;
 * here the owner is handed in, so the listener works whichever instance
 * the window currently points at.
 */
export class TabProgressListener {
  mTabBrowser: TabbrowserCompat;
  mTab: any;
  mBrowser: any;
  mBlank: boolean;
  mStateFlags: number;
  mStatus = 0;
  mMessage = "";
  mTotalProgress = 0;
  mRequestCount: number;

  constructor(
    tabbrowser: TabbrowserCompat,
    aTab: any,
    aBrowser: any,
    aStartsBlank: boolean,
    aWasPreloadedBrowser: boolean,
    aOrigStateFlags?: number,
    aOrigRequestCount?: number,
  ) {
    let stateFlags = aOrigStateFlags || 0;
    // Initialize mStateFlags to non-zero e.g. when creating a progress
    // listener for preloaded browsers as there was no progress listener
    // around when the content started loading. If the content didn't
    // quite finish loading yet, mStateFlags will very soon be overridden
    // with the correct value and end up at STATE_STOP again.
    if (aWasPreloadedBrowser) {
      stateFlags =
        WPL.STATE_STOP |
        WPL.STATE_IS_REQUEST;
    }

    this.mTabBrowser = tabbrowser;
    this.mTab = aTab;
    this.mBrowser = aBrowser;
    this.mBlank = aStartsBlank;

    // cache flags for correct status UI update after tab switching
    this.mStateFlags = stateFlags;

    // count of open requests (should always be 0 or 1)
    this.mRequestCount = aOrigRequestCount || 0;
  }

  /** The browser window's globals (gURLBar, gInitialPages, ...). */
  get win(): any {
    return this.mTabBrowser.window;
  }

  destroy() {
    this.mTab = undefined;
    this.mBrowser = undefined;
  }

  _callProgressListeners(...args: any[]) {
    args.unshift(this.mBrowser);
    return (this.mTabBrowser._callProgressListeners as any).apply(this.mTabBrowser, args);
  }

  _shouldShowProgress(aRequest: any) {
    if (this.mBlank) {
      return false;
    }

    // Don't show progress indicators in tabs for about: URIs
    // pointing to local resources.
    if (aRequest instanceof Ci.nsIChannel && aRequest.originalURI.schemeIs("about")) {
      return false;
    }

    return true;
  }

  _isForInitialAboutBlank(aWebProgress: any, aStateFlags: number, aLocation: any) {
    if (!this.mBlank || !aWebProgress.isTopLevel) {
      return false;
    }

    // If the state has STATE_STOP, and no requests were in flight, then this
    // must be the initial "stop" for the initial about:blank document.
    if (
      aStateFlags & WPL.STATE_STOP &&
      this.mRequestCount == 0 &&
      !aLocation
    ) {
      return true;
    }

    const location = aLocation ? aLocation.spec : "";
    return location == "about:blank";
  }

  onProgressChange(
    aWebProgress: any,
    aRequest: any,
    aCurSelfProgress: number,
    aMaxSelfProgress: number,
    aCurTotalProgress: number,
    aMaxTotalProgress: number,
  ) {
    this.mTotalProgress = aMaxTotalProgress ? aCurTotalProgress / aMaxTotalProgress : 0;

    if (!this._shouldShowProgress(aRequest)) {
      return;
    }

    if (this.mTotalProgress && this.mTab.hasAttribute("busy")) {
      this.mTab.setAttribute("progress", "true");
      this.mTabBrowser._tabAttrModified(this.mTab, ["progress"]);
    }

    this._callProgressListeners("onProgressChange", [
      aWebProgress,
      aRequest,
      aCurSelfProgress,
      aMaxSelfProgress,
      aCurTotalProgress,
      aMaxTotalProgress,
    ]);
  }

  onProgressChange64(
    aWebProgress: any,
    aRequest: any,
    aCurSelfProgress: number,
    aMaxSelfProgress: number,
    aCurTotalProgress: number,
    aMaxTotalProgress: number,
  ) {
    return this.onProgressChange(
      aWebProgress,
      aRequest,
      aCurSelfProgress,
      aMaxSelfProgress,
      aCurTotalProgress,
      aMaxTotalProgress,
    );
  }

  onStateChange(aWebProgress: any, aRequest: any, aStateFlags: number, aStatus: number) {
    if (!aRequest) {
      return;
    }

    const gBrowser = this.mTabBrowser;
    const win = this.win;

    let location: any, originalLocation: any;
    try {
      aRequest.QueryInterface(Ci.nsIChannel);
      location = aRequest.URI;
      originalLocation = aRequest.originalURI;
    } catch (_ex) { /* not a channel */ }

    const ignoreBlank = this._isForInitialAboutBlank(aWebProgress, aStateFlags, location);

    const { STATE_START, STATE_STOP, STATE_IS_NETWORK } = WPL;

    // If we were ignoring some messages about the initial about:blank, and we
    // got the STATE_STOP for it, we'll want to pay attention to those messages
    // from here forward. Similarly, if we conclude that this state change
    // is one that we shouldn't be ignoring, then stop ignoring.
    if (
      (ignoreBlank && aStateFlags & STATE_STOP && aStateFlags & STATE_IS_NETWORK) ||
      (!ignoreBlank && this.mBlank)
    ) {
      this.mBlank = false;
    }

    if (aStateFlags & STATE_START && aStateFlags & STATE_IS_NETWORK) {
      this.mRequestCount++;

      if (aWebProgress.isTopLevel) {
        // Need to use originalLocation rather than location because things
        // like about:home and about:privatebrowsing arrive with nsIRequest
        // pointing to their resolved jar: or file: URIs.
        if (
          !(
            originalLocation &&
            win.gInitialPages.includes(originalLocation.spec) &&
            originalLocation != "about:blank" &&
            this.mBrowser.initialPageLoadedFromUserAction != originalLocation.spec &&
            this.mBrowser.currentURI &&
            this.mBrowser.currentURI.spec == "about:blank"
          )
        ) {
          // Indicating that we started a load will allow the location
          // bar to be cleared when the load finishes.
          // In order to not overwrite user-typed content, we avoid it
          // (see if condition above) in a very specific case:
          // If the load is of an 'initial' page (e.g. about:privatebrowsing,
          // about:newtab, etc.), was not explicitly typed in the location
          // bar by the user, is not about:blank (because about:blank can be
          // loaded by websites under their principal), and the current
          // page in the browser is about:blank (indicating it is a newly
          // created or re-created browser, e.g. because it just switched
          // remoteness or is a new tab/window).
          this.mBrowser.urlbarChangeTracker.startedLoad();

          // To improve the user experience and perceived performance when
          // opening links in new tabs, we show the url and tab title sooner,
          // but only if it's safe (from a phishing point of view) to do so,
          // thus there's no session history and the load starts from a
          // non-web-controlled blank page.
          if (
            this.mBrowser.browsingContext.sessionHistory?.count === 0 &&
            win.BrowserUIUtils.checkEmptyPageOrigin(this.mBrowser, originalLocation)
          ) {
            gBrowser.setInitialTabTitle(this.mTab, originalLocation.spec, {
              isURL: true,
            });

            this.mBrowser.browsingContext.nonWebControlledBlankURI = originalLocation;
            if (this.mTab.selected && !gBrowser.userTypedValue) {
              win.gURLBar.setURI();
            }
          }
        }
        delete this.mBrowser.initialPageLoadedFromUserAction;
        // If the browser is loading it must not be crashed anymore
        this.mTab.removeAttribute("crashed");
      }

      if (this._shouldShowProgress(aRequest)) {
        if (
          !(aStateFlags & WPL.STATE_RESTORING) &&
          aWebProgress &&
          aWebProgress.isTopLevel
        ) {
          this.mTab.setAttribute("busy", "true");
          gBrowser._tabAttrModified(this.mTab, ["busy"]);
          this.mTab._notselectedsinceload = !this.mTab.selected;
        }

        if (this.mTab.selected) {
          gBrowser._isBusy = true;
        }
      }
    } else if (aStateFlags & STATE_STOP && aStateFlags & STATE_IS_NETWORK) {
      // since we (try to) only handle STATE_STOP of the last request,
      // the count of open requests should now be 0
      this.mRequestCount = 0;

      const modifiedAttrs: string[] = [];
      if (this.mTab.hasAttribute("busy")) {
        this.mTab.removeAttribute("busy");
        modifiedAttrs.push("busy");

        // Only animate the "burst" indicating the page has loaded if
        // the top-level page is the one that finished loading.
        if (
          aWebProgress.isTopLevel &&
          !aWebProgress.isLoadingDocument &&
          Components.isSuccessCode(aStatus) &&
          !gBrowser.tabAnimationsInProgress &&
          !win.gReduceMotion
        ) {
          if (this.mTab._notselectedsinceload) {
            this.mTab.setAttribute("notselectedsinceload", "true");
          } else {
            this.mTab.removeAttribute("notselectedsinceload");
          }

          this.mTab.setAttribute("bursting", "true");
        }
      }

      if (this.mTab.hasAttribute("progress")) {
        this.mTab.removeAttribute("progress");
        modifiedAttrs.push("progress");
      }

      if (modifiedAttrs.length) {
        gBrowser._tabAttrModified(this.mTab, modifiedAttrs);
      }

      if (aWebProgress.isTopLevel) {
        const isSuccessful = Components.isSuccessCode(aStatus);
        if (!isSuccessful && !this.mTab.isEmpty) {
          // Restore the current document's location in case the
          // request was stopped (possibly from a content script)
          // before the location changed.

          this.mBrowser.userTypedValue = null;
          // When browser.tabs.documentchannel.parent-controlled pref and SHIP
          // are enabled and a load gets cancelled due to another one
          // starting, the error is NS_BINDING_CANCELLED_OLD_LOAD.
          // When these prefs are not enabled, the error is different and
          // that's why we still want to look at the isNavigating flag.
          // We could add a workaround and make sure that in the alternative
          // codepaths we would also omit the same error, but considering
          // how we will be enabling fission by default soon, we can keep
          // using isNavigating for now, and remove it when the
          // parent-controlled pref and SHIP are enabled by default.
          // Bug 1725716 has been filed to consider removing isNavigating
          // field alltogether.
          const isNavigating = this.mBrowser.isNavigating;
          if (
            this.mTab.selected &&
            aStatus != Cr.NS_BINDING_CANCELLED_OLD_LOAD &&
            !isNavigating
          ) {
            win.gURLBar.setURI();
          }
        } else if (isSuccessful) {
          this.mBrowser.urlbarChangeTracker.finishedLoad();
        }
      }

      // If we don't already have an icon for this tab then clear the tab's
      // icon. Don't do this on the initial about:blank load to prevent
      // flickering. Don't clear the icon if we already set it from one of the
      // known defaults. Note we use the original URL since about:newtab
      // redirects to a prerendered page.
      if (
        !this.mBrowser.mIconURL &&
        !ignoreBlank &&
        !(originalLocation.spec in FAVICON_DEFAULTS)
      ) {
        this.mTab.removeAttribute("image");
      } else {
        // Bug 1804166: Allow new tabs to set the favicon correctly if the
        // new tabs behavior is set to open a blank page
        // This is a no-op unless this.mBrowser._documentURI is in
        // FAVICON_DEFAULTS.
        gBrowser.setDefaultIcon(this.mTab, this.mBrowser._documentURI);
      }

      // For keyword URIs clear the user typed value since they will be changed into real URIs
      if (location.scheme == "keyword") {
        this.mBrowser.userTypedValue = null;
      }

      if (this.mTab.selected) {
        gBrowser._isBusy = false;
      }
    }

    if (ignoreBlank) {
      this._callProgressListeners(
        "onUpdateCurrentBrowser",
        [aStateFlags, aStatus, "", 0],
        true,
        false,
      );
    } else {
      this._callProgressListeners(
        "onStateChange",
        [aWebProgress, aRequest, aStateFlags, aStatus],
        true,
        false,
      );
    }

    this._callProgressListeners(
      "onStateChange",
      [aWebProgress, aRequest, aStateFlags, aStatus],
      false,
    );

    if (aStateFlags & (STATE_START | STATE_STOP)) {
      // reset cached temporary values at beginning and end
      this.mMessage = "";
      this.mTotalProgress = 0;
    }
    this.mStateFlags = aStateFlags;
    this.mStatus = aStatus;
  }

  onLocationChange(aWebProgress: any, aRequest: any, aLocation: any, aFlags: number) {
    const gBrowser = this.mTabBrowser;
    const win = this.win;

    // OnLocationChange is called for both the top-level content
    // and the subframes.
    const topLevel = aWebProgress.isTopLevel;

    const isSameDocument = !!(aFlags & WPL.LOCATION_CHANGE_SAME_DOCUMENT);
    if (topLevel) {
      const isReload = !!(aFlags & WPL.LOCATION_CHANGE_RELOAD);
      const isErrorPage = !!(aFlags & WPL.LOCATION_CHANGE_ERROR_PAGE);

      // We need to clear the typed value
      // if the document failed to load, to make sure the urlbar reflects the
      // failed URI (particularly for SSL errors). However, don't clear the value
      // if the error page's URI is about:blank, because that causes complete
      // loss of urlbar contents for invalid URI errors (see bug 867957).
      // Another reason to clear the userTypedValue is if this was an anchor
      // navigation initiated by the user.
      // Finally, we do insert the URL if this is a same-document navigation
      // and the user cleared the URL manually.
      if (
        this.mBrowser.didStartLoadSinceLastUserTyping() ||
        (isErrorPage && aLocation.spec != "about:blank") ||
        (isSameDocument && this.mBrowser.isNavigating) ||
        (isSameDocument && !this.mBrowser.userTypedValue)
      ) {
        this.mBrowser.userTypedValue = null;
      }

      // If the tab has been set to "busy" outside the stateChange
      // handler below (e.g. by sessionStore.navigateAndRestore), and
      // the load results in an error page, it's possible that there
      // isn't any (STATE_IS_NETWORK & STATE_STOP) state to cause busy
      // attribute being removed. In this case we should remove the
      // attribute here.
      if (isErrorPage && this.mTab.hasAttribute("busy")) {
        this.mTab.removeAttribute("busy");
        gBrowser._tabAttrModified(this.mTab, ["busy"]);
      }

      if (!isSameDocument) {
        // If the browser was playing audio, we should remove the playing state.
        if (this.mTab.hasAttribute("soundplaying")) {
          clearTimeout(this.mTab._soundPlayingAttrRemovalTimer);
          this.mTab._soundPlayingAttrRemovalTimer = 0;
          this.mTab.removeAttribute("soundplaying");
          gBrowser._tabAttrModified(this.mTab, ["soundplaying"]);
        }

        // If the browser was previously muted, we should restore the muted state.
        if (this.mTab.hasAttribute("muted")) {
          this.mTab.linkedBrowser.mute();
        }

        if (gBrowser.isFindBarInitialized(this.mTab)) {
          const findBar = gBrowser.getCachedFindBar(this.mTab);

          // Close the Find toolbar if we're in old-style TAF mode
          if (findBar.findMode != findBar.FIND_NORMAL) {
            findBar.close();
          }
        }

        // Note that we're not updating for same-document loads, despite
        // the `title` argument to `history.pushState/replaceState`. For
        // context, see https://bugzilla.mozilla.org/show_bug.cgi?id=585653
        // and https://github.com/whatwg/html/issues/2174
        if (!isReload) {
          gBrowser.setTabTitle(this.mTab);
        }

        // Don't clear the favicon if this tab is in the pending
        // state, as SessionStore will have set the icon for us even
        // though we're pointed at an about:blank. Also don't clear it
        // if the tab is in customize mode, to keep the one set by
        // gCustomizeMode.setTab (bug 1551239). Also don't clear it
        // if onLocationChange was triggered by a pushState or a
        // replaceState (bug 550565) or a hash change (bug 408415).
        if (
          !this.mTab.hasAttribute("pending") &&
          !this.mTab.hasAttribute("customizemode") &&
          aWebProgress.isLoadingDocument
        ) {
          // Removing the tab's image here causes flickering, wait until the
          // load is complete.
          this.mBrowser.mIconURL = null;
        }

        if (!isReload && aWebProgress.isLoadingDocument) {
          const triggerer = gBrowser._getTriggeringPrincipalFromHistory(this.mBrowser);
          // Typing a url, searching or clicking a bookmark will load a new
          // document that is no longer tied to a navigation from the previous
          // content and will have a system principal as the triggerer.
          if (triggerer && triggerer.isSystemPrincipal) {
            // Reset the related tab map so that the next tab opened will be related
            // to this new document and not to tabs opened by the previous one.
            gBrowser.clearRelatedTabs();
          }
        }

        if (aRequest instanceof Ci.nsIChannel && !win.isBlankPageURL(aRequest.originalURI.spec)) {
          this.mBrowser.originalURI = aRequest.originalURI;
        }
      }

      const userContextId = this.mBrowser.getAttribute("usercontextid") || 0;
      if (this.mBrowser.registeredOpenURI) {
        const uri = this.mBrowser.registeredOpenURI;
        gBrowser.UrlbarProviderOpenTabs.unregisterOpenTab(
          uri.spec,
          userContextId,
          this.mTab.group?.id,
          win.PrivateBrowsingUtils.isWindowPrivate(win),
        );
        delete this.mBrowser.registeredOpenURI;
      }
      if (!win.isBlankPageURL(aLocation.spec)) {
        gBrowser.UrlbarProviderOpenTabs.registerOpenTab(
          aLocation.spec,
          userContextId,
          this.mTab.group?.id,
          win.PrivateBrowsingUtils.isWindowPrivate(win),
        );
        this.mBrowser.registeredOpenURI = aLocation;
      }

      if (this.mTab != gBrowser.selectedTab) {
        const tabCacheIndex = gBrowser._tabLayerCache.indexOf(this.mTab);
        if (tabCacheIndex != -1) {
          gBrowser._tabLayerCache.splice(tabCacheIndex, 1);
          gBrowser._getSwitcher().cleanUpTabAfterEviction(this.mTab);
        }
      }
    }

    if (!this.mBlank || this.mBrowser.hasContentOpener) {
      this._callProgressListeners("onLocationChange", [
        aWebProgress,
        aRequest,
        aLocation,
        aFlags,
      ]);
      if (topLevel && !isSameDocument) {
        // Include the true final argument to indicate that this event is
        // simulated (instead of being observed by the webProgressListener).
        this._callProgressListeners("onContentBlockingEvent", [
          aWebProgress,
          null,
          0,
          true,
        ]);
      }
    }

    if (topLevel) {
      this.mBrowser.lastURI = aLocation;
      this.mBrowser.lastLocationChange = Date.now();
    }
  }

  onStatusChange(aWebProgress: any, aRequest: any, aStatus: number, aMessage: string) {
    if (this.mBlank) {
      return;
    }

    this._callProgressListeners("onStatusChange", [
      aWebProgress,
      aRequest,
      aStatus,
      aMessage,
    ]);

    this.mMessage = aMessage;
  }

  onSecurityChange(aWebProgress: any, aRequest: any, aState: number) {
    this._callProgressListeners("onSecurityChange", [
      aWebProgress,
      aRequest,
      aState,
    ]);
  }

  onContentBlockingEvent(aWebProgress: any, aRequest: any, aEvent: number) {
    this._callProgressListeners("onContentBlockingEvent", [
      aWebProgress,
      aRequest,
      aEvent,
    ]);
  }

  onRefreshAttempted(aWebProgress: any, aURI: any, aDelay: number, aSameURI: boolean) {
    return this._callProgressListeners("onRefreshAttempted", [
      aWebProgress,
      aURI,
      aDelay,
      aSameURI,
    ]);
  }
}
(TabProgressListener.prototype as any).QueryInterface = ChromeUtils.generateQI([
  "nsIWebProgressListener",
  "nsIWebProgressListener2",
  "nsISupportsWeakReference",
]);

/**
 * Bound onto every inserted <browser> as its loadURI / fixupAndLoadURIString,
 * so loads started through the browser go through fixup and chrome handling.
 */
export const URILoadingWrapper = {
  _normalizeLoadURIOptions(browser: any, loadURIOptions: any) {
    if (!loadURIOptions.triggeringPrincipal) {
      throw new Error("Must load with a triggering Principal");
    }

    if (
      loadURIOptions.userContextId &&
      loadURIOptions.userContextId != browser.getAttribute("usercontextid")
    ) {
      throw new Error("Cannot load with mismatched userContextId");
    }

    loadURIOptions.loadFlags |= loadURIOptions.flags | WNAV.LOAD_FLAGS_NONE;
    delete loadURIOptions.flags;
    loadURIOptions.hasValidUserGestureActivation ??=
      browser.ownerDocument.hasValidTransientUserGestureActivation;
  },

  _loadFlagsToFixupFlags(browser: any, loadFlags: number) {
    // Attempt to perform URI fixup to see if we can handle this URI in chrome.
    let fixupFlags: number = FIXUP.FIXUP_FLAG_NONE;
    if (loadFlags & WNAV.LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP) {
      fixupFlags |= FIXUP.FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP;
    }
    if (loadFlags & WNAV.LOAD_FLAGS_FIXUP_SCHEME_TYPOS) {
      fixupFlags |= FIXUP.FIXUP_FLAG_FIX_SCHEME_TYPOS;
    }
    if (browser.ownerGlobal.PrivateBrowsingUtils.isBrowserPrivate(browser)) {
      fixupFlags |= FIXUP.FIXUP_FLAG_PRIVATE_CONTEXT;
    }
    return fixupFlags;
  },

  _fixupURIString(browser: any, uriString: string, loadURIOptions: any) {
    const fixupFlags = this._loadFlagsToFixupFlags(browser, loadURIOptions.loadFlags);

    // XXXgijs: If we switch to loading the URI we return from this method,
    // rather than redoing fixup in docshell (see bug 1815509), we need to
    // ensure that the loadURIOptions have the fixup flag removed here for
    // loads where `uriString` already parses if just passed immediately
    // to `newURI`.
    // Right now this happens in nsDocShellLoadState code.
    try {
      const fixupInfo = Services.uriFixup.getFixupURIInfo(uriString, fixupFlags);
      return fixupInfo.preferredURI;
    } catch (_e) {
      // getFixupURIInfo may throw. Just return null, our caller will deal.
    }
    return null;
  },

  /**
   * Handles URIs when we want to deal with them in chrome code rather than pass
   * them down to a content browser. This can avoid unnecessary process switching
   * for the browser.
   * @param aBrowser the browser that is attempting to load the URI
   * @param aUri the nsIURI that is being loaded
   * @returns true if the URI is handled, otherwise false
   */
  _handleUriInChrome(aBrowser: any, aUri: any) {
    if (aUri.scheme == "file") {
      try {
        const mimeType = Cc["@mozilla.org/mime;1"]
          .getService(Ci.nsIMIMEService)
          .getTypeFromURI(aUri);
        if (mimeType == "application/x-xpinstall") {
          const systemPrincipal = Services.scriptSecurityManager.getSystemPrincipal();
          const AddonManager = aBrowser.ownerGlobal.AddonManager;
          AddonManager.getInstallForURL(aUri.spec, {
            telemetryInfo: { source: "file-url" },
          }).then((install: any) => {
            AddonManager.installAddonFromWebpage(mimeType, aBrowser, systemPrincipal, install);
          });
          return true;
        }
      } catch (_e) {
        return false;
      }
    }

    return false;
  },

  _updateTriggerMetadataForLoad(
    browser: any,
    uriString: string,
    { loadFlags, globalHistoryOptions }: any,
  ) {
    const gBrowser = browser.ownerGlobal.gBrowser;
    if (globalHistoryOptions?.triggeringSponsoredURL) {
      if (globalHistoryOptions.triggeringSource == "newtab") {
        gBrowser.SponsorProtection.addProtectedBrowser(browser);
      }

      try {
        // Browser may access URL after fixing it up, then store the URL into DB.
        // To match with it, fix the link up explicitly.
        const triggeringSponsoredURL = Services.uriFixup.getFixupURIInfo(
          globalHistoryOptions.triggeringSponsoredURL,
          this._loadFlagsToFixupFlags(browser, loadFlags),
        ).fixedURI.spec;
        browser.setAttribute("triggeringSponsoredURL", triggeringSponsoredURL);
        const time = globalHistoryOptions.triggeringSponsoredURLVisitTimeMS || Date.now();
        browser.setAttribute("triggeringSponsoredURLVisitTimeMS", time);
        browser.setAttribute("triggeringSource", globalHistoryOptions.triggeringSource);
      } catch (_e) { /* */ }
    } else {
      gBrowser.SponsorProtection.removeProtectedBrowser(browser);
    }

    if (globalHistoryOptions?.triggeringSearchEngine) {
      browser.setAttribute("triggeringSearchEngine", globalHistoryOptions.triggeringSearchEngine);
      browser.setAttribute("triggeringSearchEngineURL", uriString);
    } else {
      browser.removeAttribute("triggeringSearchEngine");
      browser.removeAttribute("triggeringSearchEngineURL");
    }
  },

  // Both of these are used to override functions on browser-custom-element.
  fixupAndLoadURIString(browser: any, uriString: string, loadURIOptions: any = {}) {
    this._internalMaybeFixupLoadURI(browser, uriString, null, loadURIOptions);
  },
  loadURI(browser: any, uri: any, loadURIOptions: any = {}) {
    this._internalMaybeFixupLoadURI(browser, "", uri, loadURIOptions);
  },

  // A shared function used by both remote and non-remote browsers to
  // load a string URI or redirect it to the correct process.
  _internalMaybeFixupLoadURI(browser: any, uriString: string, uri: any, loadURIOptions: any) {
    this._normalizeLoadURIOptions(browser, loadURIOptions);
    // Some callers pass undefined/null when calling
    // loadURI/fixupAndLoadURIString. Just load about:blank instead:
    if (!uriString && !uri) {
      uri = Services.io.newURI("about:blank");
    }

    // We need a URI in frontend code for checking various things. Ideally
    // we would then also pass that URI to webnav/browsingcontext code
    // for loading, but we historically haven't. Changing this would alter
    // fixup scenarios in some non-obvious cases.
    const startedWithURI = !!uri;
    if (!uri) {
      // Note: this may return null if we can't make a URI out of the input.
      uri = this._fixupURIString(browser, uriString, loadURIOptions);
    }

    if (uri && this._handleUriInChrome(browser, uri)) {
      // If we've handled the URI in chrome, then just return here.
      return;
    }

    this._updateTriggerMetadataForLoad(browser, uriString || uri.spec, loadURIOptions);

    // XXX(nika): Is `browser.isNavigating` necessary anymore?
    // XXX(gijs): Unsure. But it mirrors docShell.isNavigating, but in the parent process
    // (and therefore imperfectly so).
    browser.isNavigating = true;

    try {
      // Should more generally prefer loadURI here - see bug 1815509.
      if (startedWithURI) {
        browser.webNavigation.loadURI(uri, loadURIOptions);
      } else {
        browser.webNavigation.fixupAndLoadURIString(uriString, loadURIOptions);
      }
    } finally {
      browser.isNavigating = false;
    }
  },
};
