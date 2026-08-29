// SPDX-License-Identifier: MPL-2.0
/**
 * Supplemental type declarations for the noraneko tabbrowser bridge.
 *
 * Firefox's canonical `MozTabbrowserTab` is declared in
 * `noraneko-runtime/browser/components/search/types/mozTabbrowserTab.d.ts`
 * as a minimal stub (`linkedBrowser: MozBrowser`). This file augments it
 * with every property and method actually used in tabbrowser.js so that our
 * module code is fully type-safe.
 *
 * `XULBrowserElement` is NOT part of the gecko types — the real type is
 * `MozBrowser` (from `toolkit/content/widgets/browser-custom-element.mjs`).
 * We create a local alias so our code can use either name.
 *
 * @see noraneko-runtime/browser/components/search/types/mozTabbrowserTab.d.ts
 * @see noraneko-runtime/tools/@types/lib.gecko.tweaks.d.ts  (XULElementTagNameMap)
 * @see noraneko-runtime/tools/@types/lib.gecko.augmentations.d.ts  (MozBrowser)
 */


/**
 * Augmentation of the official Firefox `MozTabbrowserTab` stub.
 *
 * The canonical declaration lives in
 * `noraneko-runtime/browser/components/search/types/mozTabbrowserTab.d.ts`
 * and intentionally only declares `linkedBrowser: MozBrowser`.  Every extra
 * property below is derived from the actual `<tab>` XBL binding and
 * `tabbrowser.js` source.
 */
interface MozTabbrowserTab extends XULElement {
  // ── Core identity ─────────────────────────────────────────────────────────
  /** Internal UUID assigned by TabbrowserCompat. */
  /** Tab to select when this one closes (browser.tabs.selectOwnerOnClose). */
  owner?: MozTabbrowserTab | null;
  /** Zero-based position in the tab strip (including hidden tabs). */
  _tPos: number;
  /** `true` once the open animation has finished. */
  _fullyOpen: boolean;
  /** `true` while the tab is being removed / animated out. */
  closing: boolean;
  /** Whether the tab is pinned to the left side of the tab strip. */
  pinned: boolean;
  /** Whether the tab is hidden from the tab strip (e.g. Firefox View). */
  hidden: boolean;
  /** Whether this is the active (foreground) tab. */
  selected: boolean;
  /** Visible to the user — `!hidden && !closing`. */
  visible: boolean;
  /** Legacy property for tab selection state. */
  _selected?: boolean;

  // ── Linked content ────────────────────────────────────────────────────────
  /**
   * The `<browser>` element that renders this tab's content.
   * Typed as `MozBrowser` per the official Firefox declaration.
   */
  linkedBrowser: MozBrowser;
  /** ID of the `<tabpanel>` that contains `linkedBrowser`. */
  linkedPanel: string;
  /**
   * Session-restore permanent key — survives tab moves / swaps.
   * @see https://bugzilla.mozilla.org/show_bug.cgi?id=1716788
   */
  permanentKey: object;
  /** Tab that opened this one (for restoration). */
  openerTab?: MozTabbrowserTab | null;
  /** Tab selected before this one was opened. */
  successor?: MozTabbrowserTab | null;

  // ── Labels / titles ───────────────────────────────────────────────────────
  /** Displayed label in the tab strip (may be truncated). */
  label: string;
  /** Full, untruncated label text. */
  _fullLabel: string;
  /** `true` when the label was set from page `<title>`. */
  _labelIsContentTitle: boolean;
  /** `true` while the label is still the initial/loading title. */
  _labelIsInitialTitle: boolean;
  /** Suppress the default "New Tab" label. */
  nodefault: boolean;
  /** `true` for blank / about:newtab tabs with no content yet. */
  isEmpty: boolean;

  // ── State flags ───────────────────────────────────────────────────────────
  /** Tab is busy loading (spinner shown). */
  busy: boolean;
  /** Progress indicator is active. */
  progress: boolean;
  /** Container (contextual identity) id; `0` = default. */
  userContextId?: number;
  /** Standard DOM `isConnected` — whether the tab is in the document. */
  isConnected: boolean;

  // ── Media ─────────────────────────────────────────────────────────────────
  /** Tab is playing audible audio. */
  soundPlaying: boolean;
  /** Tab audio is muted. */
  muted: boolean;
  /** Human-readable reason for muting (e.g. `"user"`, `"extension"`). */
  muteReason: string | null;
  /** Internal `audioMuted` attribute mirror. */
  audioMuted: boolean;
  /**
   * Timer that removes the `soundplaying` attribute after sound stops.
   * In practice the code uses `setTimeout` (returns `number`), not nsITimer.
   */
  _soundPlayingAttrRemovalTimer: nsITimer | number | null;

  // ── Tab group membership ──────────────────────────────────────────────────
  /** The `<tab-group>` this tab belongs to, or `null`. */
  group: MozTabbrowserTabGroup | null;

  // ── Loading / navigation state ────────────────────────────────────────────
  /** Params used when the browser was last (lazily) created. */
  _browserParams?: {
    uriIsAboutBlank: boolean;
    remoteType: string;
    usingPreloadedContent: boolean;
  };
  /** Internal browser DOM node id. */
  _browserID?: number;

  // ── Screen / camera sharing ───────────────────────────────────────────────
  /** Active WebRTC / screen-sharing state, or `null` when idle. */
  _sharingState: {
    webRTC?: any;
    screen?: any;
    paused?: boolean;
  } | null;

  // ── Miscellaneous ─────────────────────────────────────────────────────────
  /** `true` while `addTab` is still setting up the tab. */
  initializingTab: boolean;
  /** Show an attention indicator (e.g. notification badge). */
  attention: boolean;
  /** Cached FindBar instance for this tab. */
  _findBar: any;
  /** Promise that resolves to the FindBar when it is first created. */
  _pendingFindBar?: Promise<any>;
  /** The URI that was registered as an open URI, used to dedup open tabs. */
  _originalRegisteredOpenURI?: nsIURI | null;

  // ── Multi-selection ───────────────────────────────────────────────────────
  /** Whether this tab is part of the current multi-selection. */
  multiselected: boolean;

  // ── Tab strip hover state ──────────────────────────────────────────────────
  /** `true` while the pointer is over the audio-playing icon area. */
  _overPlayingIcon?: boolean;
  /** `true` while the pointer is over the mute/unmute audio button. */
  _overAudioButton?: boolean;

  // ── Activity tracking ─────────────────────────────────────────────────────
  /** Updates the last-seen-active timestamp; called on window activate/deactivate. */
  updateLastSeenActive?(): void;
}

/**
 * A `<tab-group>` custom element that visually clusters related tabs.
 *
 * Defined in `tabbrowser-tabgroup.js`; not yet in upstream gecko types.
 */
interface MozTabbrowserTabGroup extends XULElement {
  /** Unique group identifier (UUID string). */
  id: string;
  /** Accent colour token (e.g. `"blue"`, `"red"`). */
  color: string;
  /** User-visible group name shown in the tab strip. */
  label: string;
  /** Alternate name property mirrored from the group's label attribute. */
  name?: string;
  /** Whether the group's tabs are collapsed (hidden) in the strip. */
  collapsed: boolean;
  /** Live list of tabs belonging to this group. */
  tabs: MozTabbrowserTab[];
  ownerGlobal: Window;

  before(...nodes: (Node | string)[]): void;
  after(...nodes: (Node | string)[]): void;
  remove(): void;
  toggleAttribute(name: string, force?: boolean): boolean;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  dispatchEvent(event: Event): boolean;
}

/**
 * A noraneko split-view wrapper element.
 *
 * Wraps two or more tabs that are displayed side-by-side in the content area.
 */
interface MozSplitView extends XULElement {
  /** Unique split-view identifier (UUID string). */
  id: string;
  /** The tabs currently displayed inside this split view. */
  tabs: MozTabbrowserTab[];
}

// ── Global Firefox chrome-window variables not in @types/gecko ──────────────

declare const AppConstants: {
  platform: string;
  MOZ_APP_NAME: string;
  isPlatformAndVersionAtLeast(platform: string, version: string): boolean;
  [key: string]: any;
};
declare const gMultiProcessBrowser: boolean;
declare const gFissionBrowser: boolean;
declare const gNavToolbox: Element | null;
declare const gSharedTabWarning: any;
declare const gURLBar: any;
declare const SessionStore: {
  resetBrowserToLazyState(tab: MozTabbrowserTab): void;
  getTabState(tab: MozTabbrowserTab): string;
  setTabState(tab: any, state: string | object): void;
  promiseInitialized: Promise<void>;
  [key: string]: any;
};
declare const E10SUtils: any;
declare const FirefoxViewHandler: { tab: MozTabbrowserTab | null; [key: string]: any };
declare const PrivateBrowsingUtils: {
  isWindowPrivate(win: Window): boolean;
  permanentPrivateBrowsing: boolean;
  [key: string]: any;
};
declare const BrowserWindowTracker: {
  orderedWindows: Window[];
  getTopWindow(options?: any): ChromeWindow | null;
  [key: string]: any;
};
declare const StatusPanel: any;
declare const MozElements: {
  NotificationBox: new (callback: (el: Element) => void) => any;
  [key: string]: any;
};
declare const ShortcutUtils: any;
declare const SitePermissions: {
  copyTemporaryPermissions(from: MozBrowser, to: MozBrowser): void;
  [key: string]: any;
};
declare const webrtcUI: {
  forgetStreamsFromBrowserContext(ctx: any): void;
  [key: string]: any;
};
declare const SelectableProfileService: any;
declare const gPermissionPanel: any;
declare const ContextualIdentityService: any;
declare const PlacesUtils: {
  favicons: any;
  [key: string]: any;
};
declare const WebExtensionPolicy: any;
declare function isBlankPageURL(url: string): boolean;
declare const gFindBarInitialized: boolean;
declare const gFindBar: any;
declare const RTL_UI: boolean;
declare const gBrowserInit: any;
declare const gBrowserAllowScriptsToCloseInitialTabs: boolean;
declare const gBrowser: TabbrowserCompat;
declare const AsyncTabSwitcher: new (tabbrowser: TabbrowserCompat) => any;
declare const Services: any;
declare const GenAI: any;
declare const TabStateFlusher: any;
declare const UrlbarProviderOpenTabs: any;

/**
 * Tabbrowser-specific extras on the typelib's `XULBrowserElement` (which
 * `MozBrowser` aliases). Declaration merging, not a new type: everything a
 * <browser> already has (docShell, webNavigation, currentURI, ...) comes from
 * XULFrameElement, so only what tabbrowser.js bolts on is listed here.
 */
interface XULBrowserElement {
  permanentKey?: object;
  mIconURL?: string;
  isDistinctProductPageVisit?: boolean;
  registeredOpenURI?: nsIURI;
  _cachedCurrentURI?: nsIURI | null;
  contentTitle?: string;
  /** Per-browser lazy `NotificationBox` instance (created by `getNotificationBox`). */
  _notificationBox?: any;
  /** Whether the browser's audio output is muted. */
  audioMuted?: boolean;
  mute?(): void;
  swapDocShells?(other: XULBrowserElement): void;
  /** Preserve compositor layers while the window is hidden or occluded. */
  preserveLayers?(inactive: boolean): void;
  /** Send a message to a JSWindowActor running in this browser's process. */
  sendMessageToActor?(messageName: string, data?: any, actorName?: string): void;
  /** Create an about:blank document viewer with the specified principals. */
  createAboutBlankDocumentViewer?(principal: any, storagePrincipal: any): void;
  webProgress?: any;
  sessionHistory?: any;
  contentPrincipal?: any;
  userTypedValue?: string;
  isNavigating?: boolean;
  fixupAndLoadURIString?(uriString: string, options?: any): void;
  permitUnload?(action?: any): { permitUnload: boolean };
  asyncPermitUnload?(action?: any): Promise<{ permitUnload: boolean }>;
  reload?(): void;
  resumeMedia?(): void;
  destroy?(): void;
}

// Chrome-only bits of DOM interfaces that the webidl-generated types leave out.
interface Event {
  readonly defaultCancelled: boolean;
  readonly defaultPreventedByChrome: boolean;
}
interface BrowsingContext {
  isCaptivePortalTab: boolean;
}

// ── Document augmentation (Firefox Fluent l10n) ───────────────────────────────
/**
 * Firefox `DOMLocalization` API attached to every chrome document.
 *
 * NOTE: `document.l10n` is a Firefox-only extension to the Document interface
 * with no upstream @types declarations. Only the methods used in the
 * tabbrowser bridge are stubbed here.
 */
interface Document {
  l10n?: {
    setAttributes(element: Element, id: string, args?: Record<string, unknown>): void;
    translateFragment(fragment: Node | null): Promise<void>;
    formatValueSync?(id: string, args?: Record<string, unknown>): string | null;
    [key: string]: unknown;
  };
}

// ── Notes on unavoidable (as any) casts ──────────────────────────────────────
//
// NOTE: `(this.window as any).arguments` — Firefox chrome windows receive an
//   `nsIArray`-like `arguments` object passed through `window.open()`; there
//   are no upstream @types for it.
//
// NOTE: `(event as any).originalTarget` — Gecko-specific `originalTarget`
//   property on DOM events (distinct from `target`); not in the standard
//   EventTarget types.
//
// NOTE: `(event as any).target?.tabs` / `(event as any).target?.id` in
//   TabGroupCollapse, TabGrouped, TabUngrouped handlers — the event target is
//   a `MozTabbrowserTabGroup`, but EventTarget.target is typed as
//   `EventTarget | null`. Proper fix requires typed CustomEvent<T> generics.
//
// NOTE: `(this.window as any).UserInteraction` — internal Firefox telemetry
//   helper; not exposed via @types/gecko.
//
// NOTE: `(this.window as any).NewTabPagePreloading` — internal Firefox
//   new-tab preloading service; not in @types/gecko.
//
// NOTE: `(this.window as any).doGetProtocolFlags` — internal chrome-window
//   helper; not exposed via @types/gecko.
//
// NOTE: `(this.window as any).BrowserCommands` — browser chrome global;
//   not in @types/gecko.
//
// NOTE: `(this.window as any).gDialogBox` — per-window dialog coordinator;
//   not in @types/gecko.
//
// NOTE: `(browser as any).parentNode?.insertAdjacentElement?.(...)` —
//   `Node.parentNode` is typed as `Node | null`; `insertAdjacentElement` is
//   only on `Element`. Use `parentElement` for a properly typed alternative.
//
// NOTE: `(this as any).showPidAndActiveness`, `(this as any)._isFirstOrLastInTabGroup`,
//   `(this as any)._showTabCardPreview`, `(this as any)._allowTransparentBrowser` —
//   internal TabbrowserCompat fields declared in feature modules; cannot be
//   added here without importing TabbrowserCompat.

