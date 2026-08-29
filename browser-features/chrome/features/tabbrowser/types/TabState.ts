// SPDX-License-Identifier: MPL-2.0

/**
 * TabState — what the read-only mirror (state/store.ts) reports about the
 * tab strip. Every field here is read off the <tab> elements; nothing is
 * stored anywhere else.
 */

export type TabId = string;
export type GroupId = string;
export type SplitViewId = string;

export interface TabData {
  readonly id: TabId;
  readonly index: number;
  readonly uri: string;
  readonly title: string;
  readonly label: string;
  readonly iconUrl?: string;

  // State flags (attributes on the tab)
  readonly isPinned: boolean;
  readonly isHidden: boolean;
  readonly isSelected: boolean;
  readonly isMultiSelected: boolean;
  readonly isBusy: boolean;
  readonly isMuted: boolean;
  readonly isCrashed: boolean;
  /** No browser in the deck yet: lazy, or discarded. */
  readonly isDiscarded: boolean;
  readonly isClosing: boolean;

  // Audio state
  readonly soundPlaying: boolean;
  readonly soundPlayingScheduledRemoval: boolean;
  readonly activeMediaBlocked: boolean;

  // Context and grouping
  readonly userContextId: number;
  readonly groupId?: GroupId;
  readonly splitViewId?: SplitViewId;

  // Relationships
  readonly ownerTabId?: TabId;
  readonly openerTabId?: TabId;
  readonly successorTabId?: TabId;

  // Metadata
  readonly lastAccessed: number;
  readonly lastSeenActive: number;
  readonly labelIsContentTitle: boolean;
  readonly sharingState: {
    readonly camera: boolean;
    readonly microphone: boolean;
    readonly screen: boolean;
  };
}

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

export interface AppState {
  readonly tabs: Record<TabId, TabData>;
  readonly groups: Record<GroupId, TabGroupData>;
  readonly splitViews: Record<SplitViewId, SplitViewData>;
  readonly tabOrder: TabId[];
  readonly selectedTabId: TabId | null;
  readonly activeSplitViewId: SplitViewId | null;
}
