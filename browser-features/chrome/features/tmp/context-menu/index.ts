// SPDX-License-Identifier: MPL-2.0

import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { ContextMenuUtils } from "#features-chrome/utils/context-menu.tsx";
import { onCleanup } from "solid-js";

@noraComponent(import.meta.hot)
export default class ContextMenu extends NoraComponentBase {
  init() {
    const onContentAreaPopupShowing = () =>
      ContextMenuUtils.onPopupShowing("contentArea");
    const onTabPopupShowing = () => ContextMenuUtils.onPopupShowing("tab");
    this.logger.debug("init");
    ContextMenuUtils.contentAreaContextMenu()?.addEventListener(
      "popupshowing",
      onContentAreaPopupShowing,
    );
    ContextMenuUtils.tabContextMenu()?.addEventListener(
      "popupshowing",
      onTabPopupShowing,
    );
    onCleanup(() => {
      this.logger.debug("onCleanup");
      ContextMenuUtils.contentAreaContextMenu()?.removeEventListener(
        "popupshowing",
        onContentAreaPopupShowing,
      );
      ContextMenuUtils.tabContextMenu()?.removeEventListener(
        "popupshowing",
        onTabPopupShowing,
      );
    });
  }

  static _metadata() {
    return {
      moduleName: "context-menu",
      dependencies: [],
      softDependencies: [],
    };
  }
}
