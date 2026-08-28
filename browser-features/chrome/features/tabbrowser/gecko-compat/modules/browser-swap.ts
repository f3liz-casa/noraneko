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
    _switcher: any;
    _tabFilters: Map<any, any>;
    _tabListeners: Map<any, any>;
    swapBrowsers(ourTab: MozTabbrowserTab, otherTab: MozTabbrowserTab): void;
    swapBrowsersAndCloseOther(ourTab: MozTabbrowserTab, otherTab: MozTabbrowserTab): void;
    _swapBrowserDocShells(browser: XULBrowserElement, otherBrowser: any): void;
    _swapRegisteredOpenURIs(browser: XULBrowserElement, otherBrowser: any): void;
    getBrowserForTab(tab: MozTabbrowserTab): XULBrowserElement | null;
    getTabForBrowser(browser: XULBrowserElement): MozTabbrowserTab | null;
    selectedBrowser: XULBrowserElement;
    selectedTab: MozTabbrowserTab | null;
    setIcon(tab: MozTabbrowserTab, iconUrl: string): void;
    _tabAttrModified(tab: MozTabbrowserTab, modifiedAttrs: string[]): void;
    setTabTitle(tab: MozTabbrowserTab): void;
    _endRemoveTab(tab: MozTabbrowserTab): void;
    window: any;
    shouldActivateDocShell(browser: XULBrowserElement): boolean;
    updateCurrentBrowser(forceUpdate?: boolean): void;
    getFindBar(tab: MozTabbrowserTab): Promise<any>;
  }
}

export const swapBrowserMethods = {
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
      otherTab._soundPlayingAttrRemovalTimer.cancel?.();
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

    if (ourContainer) ourContainer.hidden = ourWasHidden;
    if (otherContainer) otherContainer.hidden = otherWasHidden;

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
