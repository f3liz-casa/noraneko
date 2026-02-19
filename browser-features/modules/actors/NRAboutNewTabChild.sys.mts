// SPDX-License-Identifier: MPL-2.0

export class NRAboutNewTabChild extends JSWindowActorChild {
  handleEvent(event: Event) {
    if (event.type === "DOMContentLoaded") {
      this.sendAsyncMessage("NewTab:RequestData", {});
    }
  }

  receiveMessage(message: { name: string; data: any }) {
    if (message.name === "NewTab:Data") {
      const win = this.contentWindow;
      if (win) {
        win.dispatchEvent(
          new win.CustomEvent("noranekoNewtabData", { detail: message.data }),
        );
      }
    }
  }
}
