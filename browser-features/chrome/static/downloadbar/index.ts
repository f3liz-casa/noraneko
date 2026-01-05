// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/preact-xul";
import { DonwloadBar } from "./downloadbar.tsx";
import { DownloadBarManager } from "./downloadbar-manager.tsx";

export let manager: DownloadBarManager;

export function init() {
  manager = new DownloadBarManager();

  manager.init();
  // console.log(manager.showDownloadBar());
  if (!manager.showDownloadBar()) {
    return;
  }
  document.getElementById("downloadsPanel")?.remove();
  render(DonwloadBar, document.getElementById("appcontent")!);
  console.log("init download bar");
  window.DownloadsPanel.hidePanel = () => {
    return;
  };
  delete window.DownloadsView.contextMenu;
  delete window.DownloadsPanel.panel;
  delete window.DownloadsPanel.richListBox;
  window.DownloadsPanel.panel = document.getElementById("downloadsPanel");
  window.DownloadsPanel.richListBox =
    document.getElementById("downloadsListBox");
  window.DownloadsView.contextMenu = document.getElementById(
    "downloadsContextMenu",
  );
  window.DownloadsPanel._initialized = false;
  window.DownloadsPanel.initialize();
  window.DownloadsView.onDownloadAdded = (download) => {
    document.getElementById("downloadsListBox").scrollLeft = 0;
    DownloadsView.onDownloadAdded_hook(download);
  };
  const scrollElem = document.getElementById("downloadsListBox");
  scrollElem?.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) {
      return;
    }
    e.preventDefault();
    scrollElem.scrollLeft += e.deltaY * 10;
  });
}

export function _metadata() {
  return {
    moduleName: "downloadbar",
    dependencies: [],
    softDependencies: [],
  };
}
