import { parse } from "@std/toml";
import i18next from "i18next";
import { effect, signal } from "@preact/signals-core";
import { Resources } from "./default.d.ts";

export let resources: Resources;

const _modules = import.meta.glob("./*/*.json", { eager: true });

const modules: Record<string, Record<string, object>> = {};
for (const [idx, m] of Object.entries(_modules)) {
  const [lng, ns] = idx.replaceAll("./", "").replaceAll(".json", "").split("/");
  if (!Object.hasOwn(modules, lng)) {
    modules[lng] = {};
  }
  modules[lng][ns] = (m as any).default as object;
}

const _meta = import.meta.glob("./*/_meta.toml", {
  eager: true,
  query: "?raw",
});
const fallbackLng: Record<string, string> = {};
for (const path in _meta) {
  fallbackLng[path.replaceAll("./", "").replaceAll("/_meta.toml", "")] = parse(
    _meta[path].default,
  )["fallback-language"] as string;
}

export function initI18N(namespace: string[], defaultNamespace: string) {
  i18next.init({
    lng: "en-US",
    debug: true,
    resources: modules,
    defaultNS: defaultNamespace,
    ns: namespace,
    fallbackLng,
  });
}

const lang = signal("ja-JP");

if (import.meta.hot) {
  import.meta.hot.accept((_newModule) => {
    // Preserve state if needed
  });
  if (import.meta.hot.data && import.meta.hot.data.lang) {
    lang.value = import.meta.hot.data.lang;
  }
  import.meta.hot.dispose((data) => {
    data.lang = lang.value;
  });
}

/**
 * @param observer
 * @description For HMR, please run this function in `createRootHMR`
 * @example
 * ```ts
 * import { createRootHMR } from "@nora/solid-xul";
 *
 * createRootHMR(
 *   () => {
 *     addI18nObserver(observer);
 *   },
 *   import.meta.hot
 * );
 * ```
 */
export function addI18nObserver(observer: (locale: string) => void) {
  effect(() => {
    observer(lang.value);
  });
}

export function setLanguage(newLang: string) {
  lang.value = newLang;
}
