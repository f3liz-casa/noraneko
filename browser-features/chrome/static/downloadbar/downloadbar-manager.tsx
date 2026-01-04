// SPDX-License-Identifier: MPL-2.0

import { effect, signal } from "@preact/signals";

export class DownloadBarManager {
  _showDownloadBar = signal(
    Services.prefs.getBoolPref("noraneko.downloadbar.enable", false),
  );
  showDownloadBar = () => this._showDownloadBar.value;
  setShowDownloadBar = (v: boolean | ((prev: boolean) => boolean)) => {
    if (typeof v === "function") {
      this._showDownloadBar.value = (v as (prev: boolean) => boolean)(
        this._showDownloadBar.value,
      );
    } else {
      this._showDownloadBar.value = v;
    }
  };
  constructor() {
    //? this effect will not called when pref is changed to same value.
    Services.prefs.addObserver(
      "noraneko.downloadbar.enable",
      this.observerDownloadbarPref,
    );
    if (!window.gFloorp) {
      window.gFloorp = {};
    }
    window.gFloorp.downloadBar = {
      setShow: this.setShowDownloadBar,
    };
  }

  init() {
    effect(() => {
      Services.prefs.setBoolPref(
        "noraneko.downloadbar.enable",
        this._showDownloadBar.value,
      );
    });
    //move elem to bottom of window
    document
      .querySelector("#tabbrowser-tabbox")
      ?.appendChild(document.getElementById("downloadsPanel")!);
  }

  //if we use just method, `this` will be broken
  private observerDownloadbarPref = () => {
    this.setShowDownloadBar((_prev) => {
      return Services.prefs.getBoolPref("noraneko.downloadbar.enable");
    });
  };
}
