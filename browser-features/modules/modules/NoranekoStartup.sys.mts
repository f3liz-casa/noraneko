// SPDX-License-Identifier: MPL-2.0



/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export const env = Services.env;
export const isMainBrowser = env.get("MOZ_BROWSER_TOOLBOX_PORT") === "";

const executedFunctions = new Set<string>();

export function executeOnce(id: string, callback: () => void): boolean {
  if (executedFunctions.has(id)) {
    return false;
  }

  callback();

  executedFunctions.add(id);
  return true;
}

/**
 * App-level entry point, registered in chrome.manifest as
 *
 *   category browser-before-ui-startup
 *     resource://noraneko/modules/NoranekoStartup.sys.mjs NoranekoStartup.init
 *
 * BrowserGlue calls this from _beforeUIStartup (final-ui-startup), before the
 * first browser window opens. No patch to BrowserGlue.sys.mjs is needed.
 */
export const NoranekoStartup = {
  init(): void {
    executeOnce("NoranekoStartup.init", () => {
      setupNoranekoNewTab().catch(console.error);
      registerCustomAboutPages().catch(console.error);
      if (!isMainBrowser) return;

      createDefaultUserChromeFiles().catch((error) => {
        console.error("Failed to create default userChrome files:", error);
      });

      // built-in の actor を登録してから、drops(手元の xpi)で置き換える。NORANEKO_DROP_UUID=<uuid> があれば落として入れる(Drops.sys.mts)
      registerBuiltinWebExtActors()
        .catch((error) => {
          console.error("Failed to register builtin WebExtension actors:", error);
        })
        .then(() => ChromeUtils.importESModule("resource://noraneko/modules/Drops.sys.mjs").restoreDropsAtStartup())
        .catch((error: unknown) => {
          console.error("[noraneko-drops] startup install failed:", error);
        });
      // registry の xpi へのリンクは、add-on のインストールでなく drops の「見る」へ(DropLinks.sys.mts)
      try {
        ChromeUtils.importESModule("resource://noraneko/modules/DropLinks.sys.mjs").registerDropLinks();
      } catch (error) {
        console.error("[noraneko-drops] link handler failed:", error);
      }
      // drop がしたことを受ける場所(singleton)。窓ごとに居る actor の一行が、
      // ここ一箇所に届く(DropBus.sys.mts)。誰も見ていなくても、投げた側は壊れない
      try {
        ChromeUtils.importESModule("resource://noraneko/modules/DropBus.sys.mjs").startDropBus();
      } catch (error) {
        console.error("[noraneko-dropbus] startup failed:", error);
      }
      // sigstore の verifier(library)がブラウザの中で動くかの自己確認。ログ一行だけ
      ChromeUtils.importESModule("resource://noraneko/modules/sigstore/Sigstore.sys.mjs")
        .selfCheck()
        .then((msg: string) => console.log(`[noraneko-sigstore] ${msg}`))
        .catch((error: unknown) => {
          console.error("[noraneko-sigstore] self check failed:", error);
        });
    });
  },
};

/**
 * noraneko の built-in actor(webext-actors の xpi)を入れて、その JSWindowActor を登録する。
 *
 * 一覧は webext-actors の build が書く resource://noraneko-builtin/builtins.json。
 * pref(noraneko.webext-actors.<name>.enabled)で一つずつ opt-in。on のものは BrowserGlue が
 * 古い JSActor を外す(二者択一)。
 *
 * AddonManager への install は about:debugging に見せるためと、upstream と同じ入れ物にするため
 * (flat dev では実行時、omni では injector が built_in_addons.json に足す。maybeInstallBuiltinAddon は
 * 何度呼んでもいい)。ページに届く道は AddonManager ではなく JSWindowActor(NoraActors.sys.mts)。
 */
interface BuiltinActorEntry {
  id: string;
  version: string;
  pref: string;
  res_url: string;
  actor: import("./NoraActors.sys.mjs").ActorRegistration;
}

/** drop を外したあと built-in に戻すときにも呼ぶ */
export async function registerBuiltinWebExtActors(): Promise<void> {
  let entries: BuiltinActorEntry[];
  try {
    const response = await fetch("resource://noraneko-builtin/builtins.json");
    if (!response.ok) {
      return;
    }
    // gecko types give Response.json() as Promise<JSON>; the file is ours.
    entries = (await response.json()) as unknown as BuiltinActorEntry[];
  } catch (error) {
    console.error("[noraneko] Failed to read builtins.json:", error);
    return;
  }

  const enabled = entries.filter((entry) =>
    Services.prefs.getBoolPref(entry.pref, false),
  );
  if (enabled.length === 0) {
    return;
  }

  const { AddonManager } = ChromeUtils.importESModule(
    "resource://gre/modules/AddonManager.sys.mjs",
  );

  const NoraActors = ChromeUtils.importESModule("resource://noraneko/modules/NoraActors.sys.mjs");
  for (const entry of enabled) {
    try {
      await AddonManager.maybeInstallBuiltinAddon(
        entry.id,
        entry.version,
        entry.res_url,
      );
    } catch (error) {
      console.error(`Failed to install builtin addon ${entry.id}:`, error);
    }
    // drop が同じ名前を先に登録していたら、そちらを残す(drop が built-in より優先)
    const root = NoraActors.registeredRoot(entry.actor.name);
    if (root && root !== entry.res_url) continue;
    try {
      NoraActors.register(entry.res_url, entry.actor);
    } catch (error) {
      console.error(`Failed to register actor ${entry.actor.name}:`, error);
    }
  }
}

async function createDefaultUserChromeFiles(): Promise<void> {
  const chromeDir = PathUtils.join(
    Services.dirsvc.get("ProfD", Ci.nsIFile).path,
    "chrome",
  );
  const chromeExists = await IOUtils.exists(chromeDir);

  if (!chromeExists) {
    const userChromeCssPath = PathUtils.join(chromeDir, "userChrome.css");
    const userContentCssPath = PathUtils.join(chromeDir, "userContent.css");

    await IOUtils.writeUTF8(
      userChromeCssPath,
      `
/*************************************************************************************************************************************************************************************************************************************************************

"userChrome.css" is a custom CSS file that can be used to specify CSS style rules for Floorp's interface (NOT internal site) using "chrome" privileges.
For instance, if you want to hide the tab bar, you can use the following CSS rule:

**************************************
#TabsToolbar {                       *
    display: none !important;        *
}                                    *
**************************************

NOTE: You can use the userChrome.css file without change preferences (about:config)

Quote: https://userChrome.org | https://github.com/topics/userchrome 

************************************************************************************************************************************************************************************************************************************************************/

@charset "UTF-8";
@-moz-document url(chrome://browser/content/browser.xhtml) {
/* Please write your custom CSS under this line*/


}
`,
    );

    await IOUtils.writeUTF8(
      userContentCssPath,
      `
/*************************************************************************************************************************************************************************************************************************************************************

"userContent.css" is a custom CSS file that can be used to specify CSS style rules for Floorp's internal site using "chrome" privileges.
For instance, if you want to apply CSS at "about:newtab" and "about:home", you can use the following CSS rule:

***********************************************************************
@-moz-document url-prefix("about:newtab"), url-prefix("about:home") { *
                                                                      *
* Write your css *                                                    *
                                                                      *
}                                                                     *
***********************************************************************

NOTE: You can use the userContent.css file without change preferences (about:config)

************************************************************************************************************************************************************************************************************************************************************/

@charset "UTF-8";
/* Please write your custom CSS under this line*/
`,
    );
  }
}

// Only for dev build
async function setupNoranekoNewTab(): Promise<void> {
  const { AboutNewTab } = ChromeUtils.importESModule(
    "resource:///modules/AboutNewTab.sys.mjs",
  );

  if ((await isNewTabFileAvailable()) === false) {
    // Fallback for dev build about:newtab if file doesn't exist
    AboutNewTab.newTabURL = "http://localhost:5186/";
  }
}

async function isNewTabFileAvailable(): Promise<boolean> {
  try {
    const response = await fetch("chrome://noraneko-newtab/content/index.html");
    return response.ok;
  } catch (error) {
    console.error("[noraneko] Failed to check newtab file:", error);
    return false;
  }
}

async function checkNewtabUserPreference(): Promise<boolean> {
  if ((await isNewTabFileAvailable()) === false) {
    return false;
  }

  return true;
}

/* Register Custom About Pages
 *
 * Credits: angelbruni/Geckium on GitHub
 * This code is the TypeScript version of the original JavaScript code.
 *
 * File referred: https://github.com/angelbruni/Geckium/blob/main/Profile%20Folder/chrome/JS/Geckium_aboutPageRegisterer.uc.js
 */

const getCustomAboutPages = async (): Promise<Record<string, string>> => {
  const customAboutPages: Record<string, string> = {
    hub: "chrome://noraneko-settings/content/index.html",
    welcome: "chrome://noraneko-welcome/content/index.html",
    // about-module names may contain a colon (NS_GetAboutModuleName only
    // strips at #/?), so "about:nora:settings" keeps the nora: branding while
    // going through about:'s fully-supported load path (a raw nora: scheme is
    // blocked by content security; see firefox-custom-url-scheme memo).
    "nora:settings": "chrome://noraneko-settings/content/index.html",
    // 同じ束から出る二つ目の頁(settings/src/main.tsx が URL で分ける)。
    // drops は settings の一節に収まらなくなった — 棚、一枚、registry が
    // それぞれ自分のパネルを欲しがる
    "nora:drops": "chrome://noraneko-settings/content/index.html",
  };

  if (await checkNewtabUserPreference()) {
    customAboutPages["newtab"] = "chrome://noraneko-newtab/content/index.html";
    customAboutPages["home"] = "chrome://noraneko-newtab/content/index.html";
  }

  return customAboutPages;
};

class CustomAboutPage {
  private _uri: nsIURI;

  constructor(urlString: string) {
    this._uri = Services.io.newURI(urlString);
  }

  get uri(): nsIURI {
    return this._uri;
  }

  newChannel(_uri: nsIURI, loadInfo: nsILoadInfo): nsIChannel {
    const new_ch = Services.io.newChannelFromURIWithLoadInfo(
      this.uri,
      loadInfo,
    );
    new_ch.owner = Services.scriptSecurityManager.getSystemPrincipal();
    return new_ch;
  }

  getURIFlags(_uri: nsIURI): number {
    return (
      Ci.nsIAboutModule.ALLOW_SCRIPT! | Ci.nsIAboutModule.IS_SECURE_CHROME_UI!
    );
  }

  getChromeURI(_uri: nsIURI): nsIURI {
    return this.uri;
  }

  QueryInterface = ChromeUtils.generateQI(["nsIAboutModule"]);
}

async function registerCustomAboutPages(): Promise<void> {
  const customAboutPages = await getCustomAboutPages();

  for (const aboutKey in customAboutPages) {
    const AboutModuleFactory: nsIFactory = {
      createInstance(aIID: nsIID): any {
        return new CustomAboutPage(customAboutPages[aboutKey]).QueryInterface(
          aIID,
        );
      },
    };

    const registrar = Components.manager.QueryInterface!(
      Ci.nsIComponentRegistrar,
    );
    if (!registrar) {
      console.error("Failed to get nsIComponentRegistrar");
      continue;
    }
    registrar.registerFactory(
      Services.uuid.generateUUID(),
      `about:${aboutKey}`,
      `@mozilla.org/network/protocol/about;1?what=${aboutKey}`,
      AboutModuleFactory,
    );
  }
}

