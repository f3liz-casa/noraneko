// SPDX-License-Identifier: MPL-2.0
/**
 * DropBus: drop がしたことを、窓を跨いで受ける場所。
 *
 * 殻(drop の std-actor)は effect を carry out するたび、一行を投げている:
 *
 *   Services.obs.notifyObservers(null, "nora-drop-did", JSON.stringify(line))
 *   { drop, uuid, at, did, about, value?, permission? }
 *
 * 投げっぱなしで、**前は受ける人が居なかった**。drop の actor は **窓ごと**に
 * 居るので、窓を跨いで溜まる場所はここにしか作れない — モジュールはプロセスに
 * 一つで、窓とは別に生きる。
 *
 * ここは **singleton の受け手**。drop は drop のままでいられる(記録のために本体の
 * 何かを import しない)し、誰も subscribe していなくても、投げた側は何も壊れない。
 * 止めるためではなく分かるため — 信頼して入れるとは「見ないことにする」ではなく
 * 「あとで見られるから安心して入れられる」ということだと思う。監視ではなく家計簿。
 *
 * 何を残すか:
 *   - メモリだけ(profile には残さない)。窓を閉じても、この process が生きる間は
 *     溜まる。ブラウザを閉じれば消える。
 *   - 直近 N 件(既定 500)。drop ごとではない — 一つの時系列として見たいので。
 *
 * 「置いた」ことも、effect と同じ一行で来る(did に effect の名前が入っている)。
 * 値は宣言した pref の中身なので、いまは入れている。記録を人に見せるものにするなら、
 * そこはもう一度考える(docs/NEXT.md)。
 */

/** 殻が投げる一行。drop はこの形をそのまま JSON で渡してくる */
export interface DropDid {
  /** drop の札(manifest の name) */
  drop: string;
  /** drop の正体 */
  uuid: string;
  /** ms since epoch */
  at: number;
  /** 何をしたか(effect の名前。宣言の外に出たときは "outside") */
  did: string;
  /** 何について(その名指し) */
  about: string;
  /** 書いた値(あれば) */
  value?: string;
  /** 宣言の外に出たとき、要った permission */
  permission?: string;
}

const TOPIC = "nora-drop-did";
const PREF_SIZE = "noraneko.drops.log.size";
const DEFAULT_SIZE = 500;

/** 直近の一行。drop ごとではなく、時系列として並べる */
const log: DropDid[] = [];
/** これから来る一行の購読者。about:nora:drops の一枚がここにぶら下がる */
const listeners = new Set<(line: DropDid) => void>();
let started = false;

/** 何件残すか。0 以下なら、この記録は切る(pref 一つで消せる) */
function limit(): number {
  try {
    const n = Services.prefs.getIntPref(PREF_SIZE, DEFAULT_SIZE);
    return n > 0 ? n : 0;
  } catch {
    return DEFAULT_SIZE;
  }
}

/**
 * 受け取った一行。**形が違うものは捨てる** — 投げる側は誰でもありうるので、
 * 記録が壊れた一行で一杯にならないように、入口で見る。
 */
function accept(raw: string): void {
  if (limit() === 0) return;
  let line: DropDid;
  try {
    const parsed = JSON.parse(raw) as Partial<DropDid>;
    if (typeof parsed.drop !== "string" || typeof parsed.uuid !== "string") return;
    if (typeof parsed.did !== "string") return;
    line = {
      drop: parsed.drop,
      uuid: parsed.uuid,
      at: typeof parsed.at === "number" ? parsed.at : Date.now(),
      did: parsed.did,
      about: typeof parsed.about === "string" ? parsed.about : "",
      ...(typeof parsed.value === "string" ? { value: parsed.value } : {}),
      ...(typeof parsed.permission === "string" ? { permission: parsed.permission } : {}),
    };
  } catch {
    return; // 字にならないものは、記録ではない
  }
  log.push(line);
  const max = limit();
  while (log.length > max) log.shift();
  for (const fn of listeners) {
    try {
      fn(line);
    } catch (e) {
      console.warn("[noraneko-dropbus] listener failed:", e);
    }
  }
}

const observer = {
  observe(_subject: unknown, topic: string, data: string): void {
    if (topic === TOPIC) accept(data);
  },
};

/**
 * 受け手を立てる(NoranekoStartup から一度)。
 *
 * `Services.obs` に observer を一つ。窓ごとの actor が投げても、ここ一箇所に
 * 届く — これが「singleton を通じた通信」の芯。
 */
export function startDropBus(): void {
  if (started) return;
  started = true;
  Services.obs.addObserver(observer, TOPIC);
  Services.prefs.addObserver(PREF_SIZE, observer);
  console.log(`[noraneko-dropbus] listening on ${TOPIC}`);
}

/** 直近の一行(古い順)。UI が読む */
export function recentDrops(): DropDid[] {
  return [...log];
}

/**
 * これから来る一行を購読する。返した関数で外れる。
 * `about:nora:drops` の一枚が、開いている間だけここにぶら下がる。
 */
export function subscribeDrops(fn: (line: DropDid) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 家計簿を空にする(「消す」) */
export function clearDrops(): void {
  log.length = 0;
}
