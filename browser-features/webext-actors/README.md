<!-- SPDX-License-Identifier: MPL-2.0 -->

# webext-actors

JSActor の代替として、**特権 built-in WebExtension** で content ↔ 親プロセスの橋を
作る基盤。Firefox 本体が内部機能を built-in 拡張 + experiment API に寄せているのと
同じやり方を、noraneko の機能に適用する（upstream 整合）。JSActor を消すのではなく、
プレフで opt-in する**並行する選択肢**。

## authoring：1 アクター = 1 ファイル

各アクターは `<name>/actor.ts` ひとつに宣言する。`parent`（メインプロセスで動く特権
メソッド）と `content`（content script で動くページ側）を書くだけ。manifest /
schema / api.js / background.js / content.js / actor.mjs は `build.ts` が生成する。

```ts
// settings-bridge/actor.ts
import { defineContent, defineParent, type ActorMeta } from "../_shared/defineActor.ts";

export const meta: ActorMeta = {
  id: "settings-bridge@noraneko.app",
  version: "1.0.0",
  namespace: "noraSettings",            // experiment-API 名 ＝ メッセージ channel
  matches: ["*://localhost/*", "chrome://noraneko-settings/*"],
  runAt: "document_start",
};

export const parent = defineParent({    // メインプロセス・Services 使える
  getBoolPref: (n: string) => /* ... Services.prefs ... */,
});

export const content = defineContent<typeof parent>((parent, ctx) => {
  // parent.getBoolPref(...) は content -> background -> 親プロセス を往復する Promise
  ctx.expose({ /* ページ window に生やす関数 */ });
});
```

ルール：**モジュール top-level は純粋に**保つ。`Services` / `ChromeUtils` /
`window` などの Firefox グローバルはメソッド/フック本体の中だけで使う（`build.ts` が
メタ情報を読むために Deno で import するため）。

## 3 つの形、同じ宣言

| アクター | parent | content | 形 |
|---|---|---|---|
| `settings-bridge` | pref get/set | birpc を張ってページに `NRS*` を export | 双方向 RPC |
| `about-preferences` | `openSettings()`（gBrowser.addTab） | about:preferences に項目追加 + クリックで親呼び出し | DOM + 特権 1 発 |
| `newtab` | `getData()`（NewTabUtils） | 読み込み時に取得 → `noranekoNewtabData` を dispatch | 特権データ → DOM イベント |

## 仕組み（content script はサンドボックス）

JSActor の child は content プロセスで chrome 特権だったが、WebExtension の content
script は `Services` に触れない。experiment API も content script には注入されない。
そのため background を一段挟む：

```
page  ←exportFunction→  content.js  ←runtime.sendMessage→  background.js  ←browser.<ns>.*→  api.js (experiment parent, main process)
```

`api.js` は `resource://noraneko-builtin/<name>/actor.mjs` を importESModule して、その
`parent` をそのまま experiment API として返すだけ（薄いグルー）。

## ビルド

`deno task build`（= `build.ts`）：

1. 各 `actor.ts` を Deno で import し、`meta` と `parent` のメソッド名を読む。
2. `_dist/<name>/` に manifest.json / schema.json / api.js / background.js を生成。
3. tsdown を 2 パスで実行（アクター毎・1 エントリ）：
   - `actor.mjs`（ESM）… `parent` だけ（content/birpc は tree-shake）。
   - `content.js`（IIFE）… content フック + 共有ランタイム + birpc。
4. `_dist/builtins.json` と `jar.mn` / `moz.build` を生成。

`defineParent` / `defineContent` はラッパだが、`treeshake.manualPureFunctions` に
登録してあるので未使用側（parent バンドル内の content など）は中身ごと落ちる。

## 登録

- **omni レイアウト（本番に近い dev）**：`tools/src/injector.ts` が omni.ja 内の
  `built_in_addons.json` に `_dist/builtins.json` の各拡張を追記（Firefox と同じ
  **build 時登録**。about:newtab の起動競合を避けられる）。
- **flat レイアウト**：`NoranekoStartup.sys.mts` が `final-ui-startup` で
  `AddonManager.maybeInstallBuiltinAddon(...)` を呼ぶ（実行時・idempotent な fallback）。
- どちらもプレフ `noraneko.webext-actors.<name>.enabled`（既定 false）で opt-in。
- プレフが on のとき、`BrowserGlue.sys.mts` は対応する JSActor 登録を外す（二者択一）。

built-in は署名なしでも特権（`Extension.sys.mjs` `getIsPrivileged` が `builtIn` を見る）
ので、未署名の dev artifact でも experiment_apis / mozillaAddons が通る。

## 動かし方・検証

`noraneko.webext-actors.settings-bridge.enabled` を true にして、いつもの dev 起動。

1. `about:debugging` →「この Firefox」に対象拡張が built-in/特権で出る。
2. 対象ページ（chrome://noraneko-settings、about:preferences、about:newtab）で
   従来 JSActor と同じ挙動になる（JSActor は同 pref で自動的に外れる）。

### 実機で要確認（content script の限界）

- `about-preferences`：content script が about:preferences に差さるか、`MozXULElement`
  がサンドボックス越しに触れるか。ダメなら about-preferences は JSActor 側に戻す。
- `newtab`：flat レイアウトの実行時 install では最初の 1 枚に間に合わない可能性。
  omni レイアウトの build 時登録なら回避できる。

## 新しいアクターの足し方

`<name>/actor.ts` を 1 つ足すだけ。`build.ts` が自動で拾う。`NoranekoStartup` も
`BrowserGlue` の二者択一も `builtins.json` / pref 名規約で動くので、配線の追記は不要。
（pref `noraneko.webext-actors.<name>.enabled` と JSActor 名の対応だけ、置き換える
場合は `BrowserGlue` の `WEBEXT_REPLACED_ACTORS` に 1 行足す。）
