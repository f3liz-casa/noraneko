// SPDX-License-Identifier: MPL-2.0
// DockBar component - renders the vertical sidebar dock with icons

import type { Signal } from "@preact/signals";
import type { IconRegistration } from "../types/mod.ts";

interface DockBarProps {
  icons: Signal<IconRegistration[]>;
  onIconClick: (iconName: string) => void;
}

/**
 * DockBar component - renders the vertical sidebar dock with icons
 */
export function DockBar(props: DockBarProps) {
  return (
    <div class="sidebar-dock-bar">
      {props.icons.value.map((icon) => (
        <DockIcon
          key={icon.name}
          icon={icon}
          onClick={() => props.onIconClick(icon.name)}
        />
      ))}
    </div>
  );
}

interface DockIconProps {
  icon: IconRegistration;
  onClick: () => void;
}

/**
 * DockIcon component - renders a single icon in the dock bar
 */
function DockIcon(props: DockIconProps) {
  return (
    <button
      class="sidebar-dock-icon"
      title={props.icon.i18nName}
      onClick={props.onClick}
      data-icon-name={props.icon.name}
    >
      <img
        src={props.icon.iconUrl}
        alt={props.icon.i18nName}
        width="16"
        height="16"
      />
    </button>
  );
}
