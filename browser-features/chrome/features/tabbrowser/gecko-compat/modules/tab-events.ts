// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L7706~L7877
// Section: Events — "how are tab DOM events dispatched and handled?"

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { dispatch } from "../compat-helpers.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    handleEvent(event: Event): void;
    _setupEventListeners(): void;
    // Methods
    _reregisterOpenTab(tab: MozTabbrowserTab, groupId: string | null): void;
    _unregisterAndReregisterOpenTab(tab: MozTabbrowserTab, originalGroupId: string | null): void;
  }
}

export const methods = {
  // upstream: _tabAttrModified@e23effd9c4 FIREFOX_143_0_1_RELEASE
  _tabAttrModified(tab: MozTabbrowserTab, changed: string[]) {
    if ((tab as any).closing) return;
    dispatch(tab, "TabAttrModified", { changed });
  },

  // upstream: _setupEventListeners@b5081e3dce FIREFOX_143_0_1_RELEASE
  _setupEventListeners() {
    const doc = this.window.document;
    doc.addEventListener("keydown", this, { mozSystemGroup: true } as any);
    doc.addEventListener("keypress", this, { mozSystemGroup: true } as any);
    doc.addEventListener("visibilitychange", this);
    this.window.addEventListener("framefocusrequested", this);
    this.window.addEventListener("DOMAudioPlaybackStarted", this);
    this.window.addEventListener("DOMAudioPlaybackStopped", this);
    this.window.addEventListener("DOMAudioPlaybackBlockStarted", this);
    this.window.addEventListener("DOMAudioPlaybackBlockStopped", this);
    this.window.addEventListener("GloballyAutoplayBlocked", this);
    this.window.addEventListener("pagetitlechanged", this);
    this.window.addEventListener("activate", this);
    this.window.addEventListener("deactivate", this);

    // Tab group events
    const tabContainer = doc.getElementById("tabbrowser-tabs");
    if (tabContainer) {
      tabContainer.addEventListener("TabGroupCollapse", this);
      tabContainer.addEventListener("TabGroupCreateByUser", this);
      tabContainer.addEventListener("TabGrouped", this);
      tabContainer.addEventListener("TabUngrouped", this);
      tabContainer.addEventListener("TabSplitViewActivate", this);
      tabContainer.addEventListener("TabSplitViewDeactivate", this);
    }

    // Tabpanels select → updateCurrentBrowser
    const panels = doc.getElementById("tabbrowser-tabpanels");
    if (panels) {
      this._tabpanelsSelectHandler = (event: Event) => {
        if (event.target === panels) this.updateCurrentBrowser();
      };
      panels.addEventListener("select", this._tabpanelsSelectHandler);
    }
  },

  /**
   * Central DOM event dispatcher for browser-tab interaction events.
   *
   * Handles: `keydown`, `keypress`, `framefocusrequested`,
   * `activate`, `deactivate`, `sizemodechange`, `occlusionstatechange`,
   * `TabAttrModified`, `TabPinned`, `TabUnpinned`, and various media/audio events.
   */
  // upstream: handleEvent@98f83440ef FIREFOX_143_0_1_RELEASE
  handleEvent(event: Event) {
    switch (event.type) {
      case "keydown":
        this._handleKeyDownEvent(event as KeyboardEvent);
        break;
      case "keypress":
        this._handleKeyPressEvent(event as KeyboardEvent);
        break;
      case "framefocusrequested": {
        const tab = this.getTabForBrowser(event.target);
        if (!tab || tab === this.selectedTab) break;
        this.selectedTab = tab;
        this.window.focus();
        event.preventDefault();
        break;
      }
      case "visibilitychange": {
        const inactive = document.hidden;
        if (!this._switcher) {
          for (const browser of this.selectedBrowsers) {
            (browser as any).preserveLayers(inactive);
            (browser as any).docShellIsActive = !inactive;
          }
        }
        break;
      }
      case "activate":
      case "deactivate":
        (this.selectedTab as any).updateLastSeenActive();
        break;
      case "pagetitlechanged": {
        const tab = this.getTabForBrowser(event.target);
        if (tab) this.setTabTitle(tab);
        break;
      }
      case "DOMAudioPlaybackStarted":
      case "DOMAudioPlaybackStopped": {
        const t = this.getTabFromAudioEvent(event);
        if (t) {
          const playing = event.type === "DOMAudioPlaybackStarted";
          {
            if (playing) {
              clearTimeout((t as any)._soundPlayingAttrRemovalTimer);
              (t as any)._soundPlayingAttrRemovalTimer = 0;

              const modifiedAttrs: string[] = [];
              if ((t as any).hasAttribute("soundplaying-scheduledremoval")) {
                (t as any).removeAttribute("soundplaying-scheduledremoval");
                modifiedAttrs.push("soundplaying-scheduledremoval");
              }
              if (!(t as any).hasAttribute("soundplaying")) {
                (t as any).toggleAttribute("soundplaying", true);
                modifiedAttrs.push("soundplaying");
              }
              if (modifiedAttrs.length) {
                // Force style flush for opacity transition
                (this.window as any).getComputedStyle(t).opacity;
              }
              this._tabAttrModified(t, modifiedAttrs);
            } else {
              // Delayed removal of soundplaying attribute
              if ((t as any).hasAttribute("soundplaying")) {
                const removalDelay = Services.prefs.getIntPref("browser.tabs.delayHidingAudioPlayingIconMS");
                (t as any).style.setProperty("--soundplaying-removal-delay", `${removalDelay - 300}ms`);
                (t as any).toggleAttribute("soundplaying-scheduledremoval", true);
                this._tabAttrModified(t, ["soundplaying-scheduledremoval"]);
                (t as any)._soundPlayingAttrRemovalTimer = setTimeout(() => {
                  (t as any).removeAttribute("soundplaying-scheduledremoval");
                  (t as any).removeAttribute("soundplaying");
                  this._tabAttrModified(t, ["soundplaying", "soundplaying-scheduledremoval"]);
                }, removalDelay);
              }
            }
          }
        }
        break;
      }
      case "DOMAudioPlaybackBlockStarted":
      case "DOMAudioPlaybackBlockStopped": {
        const t = this.getTabFromAudioEvent(event);
        if (t) {
          const blocked = event.type === "DOMAudioPlaybackBlockStarted";
          {
            (t as any).toggleAttribute("activemedia-blocked", blocked);
            this._tabAttrModified(t, ["activemedia-blocked"]);
          }
        }
        break;
      }
      case "GloballyAutoplayBlocked": {
        // Forward to notification UI if available
        const browser = (event as any).originalTarget;
        const tab = this.getTabForBrowser(browser);
        if (tab) {
          (tab as any).toggleAttribute("activemedia-blocked", true);
          this._tabAttrModified(tab, ["activemedia-blocked"]);
        }
        break;
      }
      case "TabGroupCollapse":
        (event as any).target.tabs.forEach((tab: any) => {
          this.removeFromMultiSelectedTabs(tab);
        });
        break;
      case "TabGroupCreateByUser":
        this.tabGroupMenu.openCreateModal((event as any).target);
        break;
      case "TabGrouped": {
        const tab = (event as CustomEvent).detail;
        this._reregisterOpenTab(tab, (tab as any).group?.id ?? null);
        break;
      }
      case "TabUngrouped": {
        const tab = (event as CustomEvent).detail;
        const originalGroup = (event as any).target;
        this._unregisterAndReregisterOpenTab(tab, originalGroup.id);
        break;
      }
      case "TabSplitViewActivate":
        // Handled via state store
        break;
      case "TabSplitViewDeactivate":
        // Handled via state store
        break;
    }
  },

  _reregisterOpenTab(tab: MozTabbrowserTab, groupId: string | null) {
    const uri = (tab as any).linkedBrowser?.registeredOpenURI ?? (tab as any)._originalRegisteredOpenURI;
    if (!uri) return;
    this.UrlbarProviderOpenTabs.unregisterOpenTab(
      uri.spec, (tab as any).userContextId, null,
      PrivateBrowsingUtils.isWindowPrivate(this.window),
    );
    this.UrlbarProviderOpenTabs.registerOpenTab(
      uri.spec, (tab as any).userContextId, groupId,
      PrivateBrowsingUtils.isWindowPrivate(this.window),
    );
  },

  _unregisterAndReregisterOpenTab(tab: MozTabbrowserTab, originalGroupId: string | null) {
    const uri = (tab as any).linkedBrowser?.registeredOpenURI ?? (tab as any)._originalRegisteredOpenURI;
    if (!uri) return;
    this.UrlbarProviderOpenTabs.unregisterOpenTab(
      uri.spec, (tab as any).userContextId, originalGroupId,
      PrivateBrowsingUtils.isWindowPrivate(this.window),
    );
    this.UrlbarProviderOpenTabs.registerOpenTab(
      uri.spec, (tab as any).userContextId, null,
      PrivateBrowsingUtils.isWindowPrivate(this.window),
    );
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
