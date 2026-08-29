# tabbrowser の引き継ぎメモ(2026-08-29)

`gBrowser` を TypeScript で置き換える層(`gecko-compat/`)の、いまの形と、次に手が要る場所。
書いた: シロ(Claude、@nyanrus と一緒に)。読むのは、次に触る人 ── たぶん ひなた か、次のシロ。

## 一文で

**DOM は Firefox と共有している DB。列ごとに書き手は一人。読むのは名前のついたクエリ。変化はイベントで聞く。**

`<tab>` 要素が一行、属性と expando が列。tabbrowser.js・tabs.js・SessionStore・拡張が同じ要素を同期で読み書きするので、真実を別の場所(store)に置くと必ず書き戻しが漏れる。だから compat は本家 tabbrowser.js を一行ずつ写した形で DOM だけを触り、`state/store.ts` は DOM のイベントを聞いて作る**読み取り専用の鏡**。

## いまどうなっているか

- 本家 143.0.1 の `Tabbrowser` 263 メンバーは全部 compat にある(`#private` は `_` 名)。
- 中身は本家どおり: `TabProgressListener`・`URILoadingWrapper`(`tabbrowser-scope.ts`、tabbrowser.js のブロック内から写した)、`_insertBrowser`、lazy browser、`updateBrowserRemoteness`、挿入/移動/pin/hide、グループ/マルチ選択/succession、閉じる経路。
- `initCompat` は本家インスタンスから**引き取る**: `mProgressListeners` の配列を共有、初期タブの filter に自分の listener を差し替え、本家が自分を handler にして登録したリスナーを外す。
- `ui/` の帯は鏡から Preact で描き、鏡が変わると描き直す。描いたタブを押すと本物が選ばれる(`mirror.js` の `drawnFollows`・`clickSelects`)。
- 走らせて確かめた: `deno task check` 0、headless の六 suite 緑(下の「動かし方」)。
- 刻印 273/382。154 に対する drift は最後に測ったとき 186。

### 列の持ち主(この表に無い列を触るときは、まず持ち主を探す)

| 列 | 書き手 |
|---|---|
| `_tPos`, `selected`, `_selected`, tab の並び | tabs.js / tabbox、`_updateTabsAfterInsert` |
| `busy`, `progress`, `image`, `label`, `bursting`, `soundplaying`(消す側) | `TabProgressListener`(tabbrowser-scope.ts) |
| `pending`, `image`(復元時), lazy tab の値 | SessionStore |
| `linkedPanel`, `linkedBrowser`, `_browserParams` | `_createBrowserForTab` → `_insertBrowser` |
| `closing`, `_endRemoveArgs` | `_beginRemoveTab` |
| `pinned`, `hidden` | `pinTab`/`unpinTab`, `hideTab`/`showTab` |
| `multiselected`, `_multiSelectedTabsSet` | tab-groups.ts のマルチ選択 |
| `successor`, `predecessors`, `owner` | `setSuccessor`, `_insertTabAtIndex` |
| `_selectedTab`, `_selectedBrowser` | `updateCurrentBrowser`(browser-swap.ts)、`_adoptExistingTabs` |
| `docShellIsActive` | AsyncTabSwitcher(本家のまま) |

## 地図

```
gecko-compat/
  TabbrowserCompat.ts   class 本体: フィールド(本家順)、_insertBrowser、initCompat(乗っ取り)
  tabbrowser-scope.ts   tabbrowser.js のブロック内に居るもの: TabProgressListener, URILoadingWrapper, FAVICON_DEFAULTS, updateUserContextUIIndicator
  compat-helpers.ts     dispatch だけ
  gecko-types.d.ts      うち側の型。skipLibCheck なので中の矛盾は報告されない
  modules/*.ts          本家のセクションごと。各モジュールは header(declare module)+ methods で、prototype に defineProperties される
state/store.ts          鏡。attachMirror(gBrowser)、appState/orderedTabs/selectedTab、tabById
types/TabState.ts       鏡が言えること(全部 <tab> から読む)
ui/                     鏡を読む Preact。操作は gBrowser を呼ぶ。XUL の箱に描く(下の石)
upstream-diff.ts        本家との差分をメンバー単位で。UPSTREAM = 最後に照合した tag
tests/headless/         Marionette で叩く試験(下)
```

刻印: 各メンバーの直上の `// upstream: name@hash TAG` は「その tag の本家と照合した」印。**手で書かない**。`deno task upstream-diff --stamp` が本物のハッシュを入れる。照合し直したら `--stamp TAG --only name`。

## 動かし方

書くのは Mac、走らせるのは krun VM(Linux、runtime `noraneko-runtime passed-20250917` = Firefox 143.0.1)。

```sh
# Mac(deno は mise 経由で入る)
cd browser-features/chrome
mise exec deno@2 -- deno task check                       # 0 であること
mise exec deno@2 -- deno task upstream-diff --to FIREFOX_154_0_RELEASE [--diff --only addTab]

# VM へ写して建てる
rsync -a --delete -e "ssh -F /Volumes/Lima/lima-home/krun/ssh.config" \
  browser-features/chrome/features/tabbrowser/ lima-krun:~/noraneko/browser-features/chrome/features/tabbrowser/
limactl shell krun   # 以下 VM
cd ~/noraneko/browser-features/chrome && deno run -A vite build --base chrome://noraneko/content

# headless(profile は /tmp なので VM 再起動で消える → 作り直す)
mkdir -p /tmp/nora-profile && cat > /tmp/nora-profile/user.js <<'EOF'
user_pref("marionette.port", 2829);
user_pref("devtools.console.stdout.chrome", true);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.aboutwelcome.enabled", false);
EOF
cd ~/noraneko && rm -rf /tmp/nora-profile/startupCache && \
MOZ_HEADLESS=1 MOZ_MARIONETTE=1 nohup ./_dist/bin/noraneko/noraneko --profile /tmp/nora-profile --remote-allow-system-access > /tmp/nora.log 2>&1 &
sleep 16
MPORT=2829 python3 tests/headless/marionette-eval.py < tests/headless/listener.js
grep -a -i "error\|JavaScript" /tmp/nora.log | grep -v GFX1     # 空であること
```

止めるとき: `for p in $(pgrep -f "_dist/bin/noraneko/noraneko"); do [ "$p" != "$$" ] && kill -9 $p; done`(`pkill -f` は自分の shell を巻き込む)。

試験(それぞれ**起動し直した**プロファイルで一つずつ。前の試験のタブが残ると数が合わない):

| ファイル | 見ていること |
|---|---|
| `marionette-select.py` | 選択が API/tabbox/クリックの三経路で一致、TabSelect が一回、閉じると隣へ、favicon |
| `listener.js` | XULBrowserWindow が compat 側に居る、両タブの listener が compat 製、busy、ラベル/窓タイトル、URL バー、閉じて listener 0 |
| `lazy-remoteness.js` | lazy タブが deck 外で `pending`、選択で挿入、remoteness 切替、about:robots が web タブに描ける |
| `insert-move-pin-hide.js` | tabIndex 挿入、move 五種、pin の clamp、hide/show + hiddenBy、キーボード移動、複製、browsers proxy |
| `groups-multiselect.js` | 範囲選択/解除/全選択、`<tab-group>` 作成/移動/解体、collapsed、successor 経由の blur |
| `mirror.js` | 鏡が追随する、`tabById`、鏡から描いた帯のクリックで本物が選ばれる |

`SHOT=/tmp/x.png` を付けるとスクショも撮れる。chrome script では top-level await が使えないので `return (async () => …)()`。

## 手の要るところ(お願い)

1. **154 との照合。** `deno task upstream-diff --to FIREFOX_154_0_RELEASE` で 186 メンバーが drift。`--diff --only name` で一つずつ見て、直したら `--stamp FIREFOX_154_0_RELEASE --only name`。runtime を 154 に上げるときにまとめてやるのが自然。`UrlbarProviderOpenTabs` の path が 143/154 で違う(両方試す getter が `TabbrowserCompat.ts` にある)、`TabNotes` は 143 に無い。
2. **split view** は 154 の `<tab-split-view-wrapper>` を前提にしていて、143 には要素が無く、呼び元も無い。154 で初めて動かせる。
3. **compat にしか無いもの**(本家に無い): `clearSelection`・`reloadAllTabs`・`showFullScreenViewContextMenuItems`・`createUserContextMenu`・`moveTabRelative`・`addRangeToSelection`・`discardTab`・`moveTabToExistingGroup`・`moveTabsToGroup`・`ungroupTabs`・`contextTab`。誰が呼んでいるか確かめて、要らなければ消す。
4. **防御の霧**: `?.` と `catch (_) {}` が古い移植に残っている(`grep -c "?\." gecko-compat -r`)。本家がそう書いていない所は外す。落ちたらそこが穴(今日 `_tPos` と `disableTRR` がそうやって見つかった)。
5. `tabbrowser-scope.ts` の `TabProgressListener` は本家をそのまま写したので、`gInitialPages`・`gReduceMotion`・`BrowserUIUtils`・`gURLBar` を `this.mTabBrowser.window` 経由で読む。window global が無い場所(別 window の browser)で使うときは注意。

## 転んだ石(踏まないで)

- `ThisType` は object literal の method の**引数の既定値**には届かない。`this.x` を既定値に書くと `this` が any になる → 本体で `??=`。
- グループは `#tabbrowser-tabs` 直下でなく arrowscrollbox の中(tabs.js が `insertBefore` を差し替えている)。`advanceSelectedTab` は tabbox.js の `<tabs>` が元から持っている。
- `findNextTab` は 143 の tabs.js に文字列として無いが、本家 tabbrowser.js が呼んでいるので存在する。
- `SessionStore.setTabState` は `_tPos` の無いタブを拒む → `_updateTabsAfterInsert()` を挿入のたびに。
- `addTab` の `inBackground` の既定は本家では **true**(選ぶなら `inBackground: false` を渡す)。
- limactl の `cd` 警告を `grep -v "No such file"` で消すと、本物の "No such file" も消える。
- `/tmp/nora-profile` は VM 再起動で消える。SSD が抜けると VM ごと消える(`limactl stop -f && start` で戻る)。
- gecko の型は `Ci.nsIX.CONST` を `number | undefined` にする → `as Required<typeof Ci.nsIX>` で一度受ける。
- **preact が二つ束ねられる**: `libs/preact-xul/node_modules/preact` は deno が張った symlink(実体は root と同じ)だが、vite の `preserveSymlinks: true` では別モジュール。`resolve.dedupe: ["preact"]` で一本に。数えるのは `_dist/core.js.map` の `sources` に `preact` が何回出るか。
- **preact-xul は親の namespace を継ぐ**(preact ≥10.16 は `render(vnode, parent)` を `parent.namespaceURI` から始める)。`xul:` は接頭辞を剥がすだけ。だから帯は XUL の箱に描く。HTML 要素として作ってから ref で XUL に差し替える古い形は、preact が捨てた要素を覚えたままになって二回目から描けなかった。XUL の中の `<div>` は XUL の div になる(downloadbar にそれがある、未対応)。
- **描いた帯は custom element を借りない**: `<tab>` を document に付けると MozTab が目を覚まし、自分の中身を組み立てて `.tab-text` の `value` を `label` 属性から継承させる(手で描いたラベルが消える)。だから `ui/` は `<hbox class="tabbrowser-tab">` で描く。class は CSS のために借りるだけ。
- `XULElement.click()` は document に付いていない要素では鳴らない。試験で押すなら先に `appendChild`。`dispatchEvent(new MouseEvent("click"))` なら detached でも届く。

## 正本

経緯の全部は `~/.shiro/noraneko-analysis-2026-08-28.md`(nyanrus の Mac)。ブランチは `shiro/rewire-loader`、upstream の base は `8129c5f`。
