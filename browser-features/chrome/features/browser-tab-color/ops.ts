// SPDX-License-Identifier: MPL-2.0

import chroma from "chroma-js";

const CSS_VARS = {
  TAB_PANEL_BG_COLOR: "--floorp-tab-panel-bg-color",
  TAB_PANEL_FG_COLOR: "--floorp-tab-panel-fg-color",
  NAVIGATOR_TOOLBOX_BG_COLOR: "--floorp-navigator-toolbox-bg-color",
  TAB_LABEL_FG_COLOR: "--floorp-tab-label-fg-color",
  TABS_ICONS_FG_COLOR: "--floorp-tabs-icons-fg-color",
} as const;

export function getTextColor(bg: string): "black" | "white" {
  if (!chroma.valid(bg)) throw new Error(`Invalid color: ${bg}`);
  return chroma(bg).luminance() >= 0.5 ? "black" : "white";
}

export function generateTabColorStyles(themeColor: string): string {
  const textColor = getTextColor(themeColor);
  return `
    :root {
        ${CSS_VARS.TAB_PANEL_BG_COLOR}: ${themeColor};
        ${CSS_VARS.TAB_PANEL_FG_COLOR}: ${textColor};
        ${CSS_VARS.NAVIGATOR_TOOLBOX_BG_COLOR}: var(${CSS_VARS.TAB_PANEL_BG_COLOR});
        ${CSS_VARS.TAB_LABEL_FG_COLOR}: var(${CSS_VARS.TAB_PANEL_FG_COLOR});
        ${CSS_VARS.TABS_ICONS_FG_COLOR}: var(${CSS_VARS.TAB_PANEL_FG_COLOR});
    }
    #browser #TabsToolbar,
    :root:is(:not([lwtheme]), :not(:-moz-lwtheme)) #navigator-toolbox[id],
    #navigator-toolbox[id] {
      background-color: var(${CSS_VARS.NAVIGATOR_TOOLBOX_BG_COLOR}) !important;
    }
    .tab-label:not([selected]) {
      color: var(${CSS_VARS.TAB_LABEL_FG_COLOR}) !important;
    }
    .tab-icon-stack > *, #TabsToolbar-customization-target > *, #tabs-newtab-button, .titlebar-color > * {
      color: var(${CSS_VARS.TABS_ICONS_FG_COLOR}) !important;
      fill: var(${CSS_VARS.TABS_ICONS_FG_COLOR}) !important;
    }
  `;
}
