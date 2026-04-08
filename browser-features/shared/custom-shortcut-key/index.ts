// SPDX-License-Identifier: MPL-2.0

import { commands } from "./commands";
import { type CSKData, CSKCommandsCodec, CSKDataCodec } from "./defines";
import { checkIsSystemShortcut } from "./utils";
import { pipe } from '@mobily/ts-belt';

export class CustomShortcutKey {
  private static instance: CustomShortcutKey;
  private static windows: Window[] = [];

  //? this boolean disable shortcut of csk
  //? useful for registering
  disable_csk = false;
  static getInstance() {
    if (!CustomShortcutKey.instance) {
      CustomShortcutKey.instance = new CustomShortcutKey();
    }
    if (!CustomShortcutKey.windows.includes(window)) {
      CustomShortcutKey.instance.startHandleShortcut(window);
      CustomShortcutKey.windows.push(window);
    }
    Services.obs.addObserver(CustomShortcutKey.instance, "nora-csk");
    return CustomShortcutKey.instance;
  }


  observe(_subj:unknown, _topic:unknown, data: string) {
    const decoded = CSKCommandsCodec.decode(JSON.parse(data));
    
    pipe(
      decoded,
      (either) => {
        if (either._tag === 'Left') {
          console.error('Failed to decode CSK command:', either.left);
          return;
        }
        const d = either.right;
        switch (d.type) {
          case 'disable-csk':
            this.disable_csk = d.data;
            break;
          case 'update-pref':
            this.initCSKData();
            break;
        }
      }
    );
  }

  cskData: CSKData = {};
  private constructor() {
    this.initCSKData();

    console.debug("CSK Init Completed");
  }

  private initCSKData() {
    try {
      const prefData = JSON.parse(
        Services.prefs.getStringPref("floorp.browser.nora.csk.data", "{}"),
      );

      this.cskData = pipe(
        CSKDataCodec.decode(prefData),
        (either) => {
          if (either._tag === 'Right') return either.right;
          throw new Error(`CSKData validation failed: ${JSON.stringify(either.left)}`);
        }
      );
    } catch (e) {
      console.error("Could not initialize CSKData, falling back to empty config.", e);
      this.cskData = {};
    }
  }
  private startHandleShortcut(_window: Window) {
    _window.addEventListener("keydown", (ev: KeyboardEvent) => {
      if (this.disable_csk) {
        return;
      }
      if (
        ["Control", "Alt", "Meta", "Shift"].filter((k) => ev.key.includes(k))
          .length === 0
      ) {
        if (checkIsSystemShortcut(ev)) {
          //console.warn(`This Event is registered in System: ${ev}`);
          return;
        }

        for (const [_key, shortcutDatum] of Object.entries(this.cskData)) {
          const key = _key as keyof CSKData;
          const { alt, ctrl, meta, shift } = shortcutDatum!.modifiers;
          if (
            ev.altKey === alt &&
            ev.ctrlKey === ctrl &&
            ev.metaKey === meta &&
            ev.shiftKey === shift &&
            ev.key === shortcutDatum!.key
          ) {
            commands[key].command(ev);
          }
        }
      }
    });
  }
}

// Re-export public APIs for convenience
export { commands } from "./commands";
export { 
  type CSKData, 
  type CSKCommands,
  type FloorpCSKData,
  CSKDataCodec, 
  CSKCommandsCodec,
  FloorpCSKData as FloorpCSKDataCodec,
  floorpCSKToNora,
  keyCodesList 
} from "./defines";
export { checkIsSystemShortcut } from "./utils";
export * from "./i18n";
