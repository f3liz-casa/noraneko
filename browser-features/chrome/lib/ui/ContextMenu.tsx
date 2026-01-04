// SPDX-License-Identifier: MPL-2.0
// Context menu utilities

import { render } from "@nora/preact-xul";
import type { JSX, ComponentChildren } from "preact";

// ============================================================================
// DOM Selectors
// ============================================================================

function getWindowModalDialog(): Element | null {
  return document?.querySelector("#window-modal-dialog");
}

function getScreenshotMenuItem(): Element | null {
  return document?.querySelector("#context-take-screenshot");
}

export function getContentAreaContextMenu(): Element | null {
  return document?.querySelector("#contentAreaContextMenu");
}

export function getTabContextMenu(): Element | null {
  return document?.querySelector("#tabContextMenu");
}

function getPdfjsSeparator(): Element | null {
  return document?.querySelector("#context-sep-pdfjs-selectall");
}

function getContextMenuSeparators(): NodeListOf<Element> {
  return document?.querySelectorAll("#contentAreaContextMenu > menuseparator");
}

// ============================================================================
// State
// ============================================================================

const checkItems: (() => void)[] = [];
const contextMenuObserver = new MutationObserver(() => {
  runCheckItems();
});

function runCheckItems(): void {
  for (const checkItem of checkItems) {
    checkItem();
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Add a context menu item to the content area context menu
 */
export function addContentAreaMenuItem(
  id: string,
  l10n: string,
  beforeElementId: string,
  onCommand: () => void,
  checkId: string,
  checkFunction: () => void,
): void {
  const targetNode = document?.getElementById(checkId);
  const beforeElement = document?.getElementById(beforeElementId);
  const parent = getContentAreaContextMenu();

  if (parent && beforeElement) {
    const container = document.createElement("box");
    parent.insertBefore(container, beforeElement);
    render(<MenuItem id={id} l10n={l10n} onCommand={onCommand} />, container);
  }

  if (targetNode) {
    contextMenuObserver.observe(targetNode, { attributes: true });
    checkItems.push(checkFunction);
    runCheckItems();
  }
}

/**
 * Add a context menu item to the tab context menu
 */
export function addTabContextMenuItem(
  id: string,
  l10n: string,
  beforeElementId: string,
  onCommand: (ev?: Event) => void,
): void {
  document?.getElementById(id)?.remove();
  const beforeElement = document?.getElementById(beforeElementId);
  const parent = getTabContextMenu();

  if (parent && beforeElement) {
    const container = document.createElement("box");
    parent.insertBefore(container, beforeElement);
    render(<MenuItem id={id} l10n={l10n} onCommand={onCommand} />, container);
  }
}

/**
 * Add a popup set element to the toolbar area
 */
export function addPopupSet(element: () => JSX.Element): void {
  const parent = document?.body;
  const marker = getWindowModalDialog();

  if (parent) {
    const container = document.createElement("box");
    if (marker) {
      parent.insertBefore(container, marker);
    } else {
      parent.appendChild(container);
    }
    render(element(), container);
  }
}

/**
 * Handle popup showing events
 */
export function onPopupShowing(type: "contentArea" | "tab"): void {
  if (type === "contentArea") {
    const item = getScreenshotMenuItem();
    if (item && !(item as HTMLElement & { hidden?: boolean }).hidden) {
      const sep = getPdfjsSeparator();
      if (sep) (sep as HTMLElement & { hidden?: boolean }).hidden = false;

      const nextSibling = item.nextSibling as Element & { hidden?: boolean };
      if (nextSibling) nextSibling.hidden = false;
    }

    for (const separator of getContextMenuSeparators()) {
      const nextSibling = separator.nextSibling as Element & {
        hidden?: boolean;
      };
      if (
        nextSibling?.hidden &&
        separator.id !== "context-sep-navigation" &&
        separator.id !== "context-sep-pdfjs-selectall"
      ) {
        (separator as HTMLElement & { hidden?: boolean }).hidden = true;
      }
    }
  } else if (type === "tab") {
    addTabContextMenuItem(
      "context_renameTab",
      "rename-tab",
      "context_moveTabOptions",
      () => {
        const win = window as Window & {
          TabContextMenu?: { contextTab?: unknown };
          gNoraShowTabRenameInput?: (tab: unknown) => void;
        };
        const tab = win.TabContextMenu?.contextTab;
        if (tab && win.gNoraShowTabRenameInput) {
          win.gNoraShowTabRenameInput(tab);
        }
      },
    );
  }
}

// ============================================================================
// Components
// ============================================================================

interface MenuItemProps {
  id: string;
  l10n: string;
  onCommand: (ev?: Event) => void;
}

export function MenuItem(props: MenuItemProps): JSX.Element {
  return (
    <xul:menuitem
      data-l10n-id={props.l10n}
      label={props.l10n}
      id={props.id}
      onCommand={props.onCommand}
    />
  );
}
