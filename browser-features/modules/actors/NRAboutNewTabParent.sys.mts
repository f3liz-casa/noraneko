// SPDX-License-Identifier: MPL-2.0

const lazy: any = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NewTabUtils: "resource://gre/modules/NewTabUtils.sys.mjs",
});

export class NRAboutNewTabParent extends JSWindowActorParent {
  async receiveMessage(message: any) {
    if (message.name !== "NewTab:RequestData") {
      return;
    }
    try {
      const [topSites, highlights] = await Promise.all([
        lazy.NewTabUtils.activityStreamLinks.getTopSites({
          withFavicons: true,
          numItems: 16,
        }),
        lazy.NewTabUtils.activityStreamLinks.getHighlights({
          withFavicons: true,
          numItems: 16,
        }),
      ]);
      this.sendAsyncMessage("NewTab:Data", {
        topSites: topSites ?? [],
        highlights: highlights ?? [],
      });
    } catch (e) {
      console.error(
        "[noraneko] NRAboutNewTabParent: Failed to load newtab data:",
        e,
      );
      this.sendAsyncMessage("NewTab:Data", { topSites: [], highlights: [] });
    }
  }
}
