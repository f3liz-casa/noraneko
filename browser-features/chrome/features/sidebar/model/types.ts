/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { v } from "../../../../utils/std/index.ts";

/* Valibot schemas */
export const zPanel = v.object({
  // Required fields
  id: v.string(),
  type: v.picklist(["web", "static", "extension"]), // v.union of literals can be v.picklist
  width: v.number(),

  // Optional fields (formerly t.partial)
  url: v.optional(v.nullable(v.string())),
  icon: v.optional(v.nullable(v.string())),
  userContextId: v.optional(v.nullable(v.number())),
  zoomLevel: v.optional(v.nullable(v.number())),
  userAgent: v.optional(v.nullable(v.boolean())),
  extensionId: v.optional(v.nullable(v.string())),
});

export const zPanels = v.array(zPanel);

export const zWindowPanelSidebarState = v.object({
  panels: zPanels,
  currentPanelId: v.nullable(v.string()),
});

export const zPanelSidebarConfig = v.object({
  // Required
  globalWidth: v.number(),
  autoUnload: v.boolean(),
  position_start: v.boolean(),
  displayed: v.boolean(),
  webExtensionRunningEnabled: v.boolean(),

  // Optional
  floatingWidth: v.optional(v.number()),
  floatingHeight: v.optional(v.number()),
  floatingPositionLeft: v.optional(v.number()),
  floatingPositionTop: v.optional(v.number()),
});

export const zPanelSidebarData = v.object({
  data: zPanels,
});

/* Export as types */
export type Panel = v.InferOutput<typeof zPanel>;
export type Panels = v.InferOutput<typeof zPanels>;
export type WindowPanelSidebarState = v.InferOutput<
  typeof zWindowPanelSidebarState
>;
export type PanelSidebarConfig = v.InferOutput<typeof zPanelSidebarConfig>;
export type PanelSidebarData = v.InferOutput<typeof zPanelSidebarData>;

export type Sidebar = {
  title: string;
  extensionId: string;
  url: string;
  menuId: string;
  keyId: string;
  menuL10nId: string;
  revampL10nId: string;
  iconUrl: string;
  disabled: boolean;
};

export type MapSidebars = [string, Sidebar][];
