import { decode, tryDo } from "../../../utils/std/index.ts";
import * as Try from "../../../utils/std/try.ts";
import {
  zPanels,
  zPanelSidebarConfig,
  type Panels,
  type PanelSidebarConfig,
} from "../model/types.ts";
import { strDefaultData, strDefaultConfig } from "../model/defaults.ts";

/* Pure functions for data transformation */

export function parsePanelSidebarData(raw: string): Panels {
  const result = tryDo(function* () {
    // 1. Safe JSON parsing (monadic)
    const parsed = yield Try.runCatching(() => JSON.parse(raw));

    // 2. Extract data field (manual step, but keeps flow clean)
    const data = (parsed as any)?.data ?? [];

    // 3. Decode validation (monadic)
    return yield decode(zPanels, data);
  });

  if (result.isSuccess === true) {
    return result.value;
  } else {
    // Failure case: Log and fallback
    console.error("Failed to parse panels:", result.error);
    const defaultRes = decode(zPanels, JSON.parse(strDefaultData).data);
    return defaultRes.isSuccess === true ? defaultRes.value : [];
  }
}

export function serializePanelSidebarData(value: Panels): string {
  return JSON.stringify({ data: value });
}

export function parsePanelSidebarConfig(raw: string): PanelSidebarConfig {
  const result = tryDo(function* () {
    // 1. Safe parsing
    const parsed = yield Try.runCatching(() => JSON.parse(raw));

    // 2. Decode
    return yield decode(zPanelSidebarConfig, parsed);
  });

  if (result.isSuccess === true) {
    return result.value;
  } else {
    console.error("Failed to parse config:", result.error);
    // Fallback logic
    const defaultRes = decode(
      zPanelSidebarConfig,
      JSON.parse(strDefaultConfig),
    );
    return defaultRes.isSuccess === true
      ? defaultRes.value
      : ({} as PanelSidebarConfig);
  }
}

export function serializePanelSidebarConfig(value: PanelSidebarConfig): string {
  return JSON.stringify(value);
}
