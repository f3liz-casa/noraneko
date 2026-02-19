// SPDX-License-Identifier: MPL-2.0

/**
 * TabState - Data Model
 */

export type TabId = string;
export type WindowId = number;
export type ProcessId = number;
export type GroupId = string;
export type SplitViewId = string;
export type RemoteType = string;

export interface TabData {
  id: TabId;
  index: number;
  uri: string;
  title: string;
  label: string;
  iconUrl?: string;
  description?: string;
  
  // State flags
  isPinned: boolean;
  isHidden: boolean;
  isSelected: boolean;
  isMultiSelected: boolean;
  isBusy: boolean;
  isMuted: boolean;
  isCrashed: boolean;
  isLazy: boolean;
  isDiscarded: boolean;
  isClosing: boolean;
  
  // Audio state (Lines 8250-8350)
  soundPlaying: boolean;
  soundPlayingScheduledRemoval: boolean;
  activeMediaBlocked: boolean;
  
  // Context and grouping
  userContextId: number;
  groupId?: GroupId;
  splitViewId?: SplitViewId;
  permanentKey: any;
  
  // Relationships
  ownerTabId?: TabId;
  openerTabId?: TabId;
  successorTabId?: TabId;
  predecessorTabIds: TabId[]; // New: for succession tracking
  
  // Metadata
  lastAccessed: number;
  createdTime: number;
  lastSeenActive: number;

  labelIsContentTitle: boolean;
  labelDirection: "ltr" | "rtl";
  sharingState: {
    camera: boolean;
    microphone: boolean;
    screen: boolean;
  };
}

// ... (Rest of existing AppState and other interfaces) ...

export interface TabGroupData {
  readonly id: GroupId;
  readonly title: string;
  readonly color: string;
  readonly isCollapsed: boolean;
  readonly tabs: TabId[];
}

export interface SplitViewData {
  readonly id: SplitViewId;
  readonly tabs: TabId[];
}

export interface BrowserEngineState {
  readonly remoteType: RemoteType;
  readonly processId: ProcessId;
  readonly isWarming: boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
}

export interface AppState {
  readonly tabs: Record<TabId, TabData>;
  readonly groups: Record<GroupId, TabGroupData>;
  readonly splitViews: Record<SplitViewId, SplitViewData>;
  readonly engineStates: Record<TabId, BrowserEngineState>;

  readonly tabOrder: TabId[];
  readonly selectedTabId: TabId | null;
  
  readonly activeSplitViewId: SplitViewId | null;
  
  readonly config: {
    readonly shouldExposeContentTitle: boolean;
    readonly shouldExposeContentTitlePbm: boolean;
    readonly showTabCardPreview: boolean;
    readonly allowTransparentBrowser: boolean;
    readonly tabGroupsEnabled: boolean;
    readonly tabNotesEnabled: boolean;
    readonly showPidAndActiveness: boolean;
    readonly unloadTabInContextMenu: boolean;
    readonly notificationEnableDelay: number;
    readonly tabMinWidth: number;
    readonly tabClipWidth: number;
  };
}
