// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/preact-xul";
import type { JSX } from "preact";

// deno-lint-ignore no-namespace
export namespace ContextMenuUtils {
  const checkItems: (() => void)[] = [];
  const contextMenuObserver: MutationObserver = new MutationObserver(() => {
    contextMenuObserverFunc();
  });

  function windowModalDialogElem(): Element | null {
    return document?.querySelector("#window-modal-dialog");
  }
  function screenShotContextMenuItems(): Element | null {
    return document?.querySelector("#context-take-screenshot");
  }
  export function contentAreaContextMenu(): Element | null {
    return document?.querySelector("#contentAreaContextMenu");
  }
  export function tabContextMenu(): Element | null {
    return document?.querySelector("#tabContextMenu");
  }
  function pdfjsContextMenuSeparator(): Element | null {
    return document?.querySelector("#context-sep-pdfjs-selectall");
  }
  function contextMenuSeparators(): NodeListOf<Element> {
    return document?.querySelectorAll(
      "#contentAreaContextMenu > menuseparator",
    );
  }

  export function addContextBox(
    id: string,
    l10n: string,
    renderElementId: string,
    runFunction: () => void,
    checkID: string,
    checkedFunction: () => void,
  ) {
    const targetNode = document?.getElementById(checkID);
    const renderElement = document?.getElementById(renderElementId);

    const parent = contentAreaContextMenu();
    if (parent && renderElement) {
      // Create wrapper
      const p = parent as Element; // XULElement
      const container = document.createElement("box");
      // Depending on styling, box might be fine.
      p.insertBefore(container, renderElement);

      render(
        <ContextMenu id={id} l10n={l10n} runFunction={runFunction} />,
        container,
      );
    }

    if (targetNode) {
      contextMenuObserver.observe(targetNode, { attributes: true });
      checkItems.push(checkedFunction);
      contextMenuObserverFunc();
    }
  }

  export function addContextBoxTab(
    id: string,
    l10n: string,
    renderElementId: string,
    runFunction: (ev?: Event) => void,
    // checkID: string,
    // checkedFunction: () => void,
  ) {
    document?.getElementById(id)?.remove();
    const renderElement = document?.getElementById(renderElementId);
    const parent = tabContextMenu();

    if (parent && renderElement) {
      const container = document.createElement("box");
      parent.insertBefore(container, renderElement);
      render(
        <ContextMenu id={id} l10n={l10n} runFunction={runFunction} />,
        container,
      );
    }
  }

  function contextMenuObserverFunc() {
    for (const checkItem of checkItems) {
      checkItem();
    }
  }

  export function addToolbarContentMenuPopupSet(JSXElem: () => JSX.Element) {
    const parent = document?.body;
    const marker = windowModalDialogElem();
    if (parent) {
      const container = document.createElement("box");
      if (marker) {
        parent.insertBefore(container, marker);
      } else {
        parent.appendChild(container);
      }
      // JSXElem is a function returning Element? Or Component?
      // If usage is `() => <Comp />`...
      render(JSXElem(), container);
    }
  }

  export function onPopupShowing(type: "contentArea" | "tab") {
    if (type === "contentArea") {
      const item = screenShotContextMenuItems();
      if (item && !(item as any).hidden) {
        const sep = pdfjsContextMenuSeparator();
        if (sep) (sep as any).hidden = false;

        const nextSibling = item.nextSibling as Element;
        if (nextSibling) (nextSibling as any).hidden = false;
      }

      (async () => {
        for (const contextMenuSeparator of contextMenuSeparators()) {
          const nextSibling = contextMenuSeparator.nextSibling as Element;

          if (
            (nextSibling as any)?.hidden &&
            contextMenuSeparator.id !== "context-sep-navigation" &&
            contextMenuSeparator.id !== "context-sep-pdfjs-selectall"
          ) {
            (contextMenuSeparator as any).hidden = true;
          }
        }
      })();
    } else if (type === "tab") {
      addContextBoxTab(
        "context_renameTab",
        "rename-tab",
        "context_moveTabOptions",
        () => {
          const win = window as any;
          const tab = win.TabContextMenu?.contextTab;
          if (tab && win.gNoraShowTabRenameInput) {
            win.gNoraShowTabRenameInput(tab);
          }
        },
      );
    }
  }
}

export function ContextMenu(props: {
  id: string;
  l10n: string;
  runFunction: (ev?: Event) => void;
}) {
  return (
    <xul:menuitem
      data-l10n-id={props.l10n}
      label={props.l10n}
      id={props.id}
      onCommand={props.runFunction}
    />
  );
}
