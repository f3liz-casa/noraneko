// SPDX-License-Identifier: MPL-2.0
// Pure codec operations for sidebar data

import { decode, tryDo, runCatching } from "@lib/std";
import type { Try } from "@lib/std";
import {
  PanelsSchema,
  ConfigSchema,
  type Panels,
  type Config,
} from "../types/mod.ts";
import { DEFAULT_DATA_JSON, DEFAULT_CONFIG_JSON } from "../data/mod.ts";

// ============================================================================
// Panels Codec
// ============================================================================

/**
 * Parse raw JSON string to Panels array
 */
export function parsePanels(raw: string): Panels {
  const result = tryDo(function* () {
    // 1. Safe JSON parsing
    const parsed = yield runCatching(() => JSON.parse(raw));

    // 2. Extract data field
    const data = (parsed as { data?: unknown })?.data ?? [];

    // 3. Decode validation
    return yield decode(PanelsSchema, data);
  });

  if (result.isSuccess) {
    return result.value;
  }

  // Fallback to defaults
  console.error("Failed to parse panels:", result.error);
  const defaultRes = decode(PanelsSchema, JSON.parse(DEFAULT_DATA_JSON).data);
  return defaultRes.isSuccess ? defaultRes.value : [];
}

/**
 * Serialize Panels array to JSON string (wrapped in { data: ... })
 */
export function serializePanels(panels: Panels): string {
  return JSON.stringify({ data: panels });
}

// ============================================================================
// Config Codec
// ============================================================================

/**
 * Parse raw JSON string to Config object
 */
export function parseConfig(raw: string): Config {
  const result = tryDo(function* () {
    const parsed = yield runCatching(() => JSON.parse(raw));
    return yield decode(ConfigSchema, parsed);
  });

  if (result.isSuccess) {
    return result.value;
  }

  // Fallback to defaults
  console.error("Failed to parse config:", result.error);
  const defaultRes = decode(ConfigSchema, JSON.parse(DEFAULT_CONFIG_JSON));
  return defaultRes.isSuccess ? defaultRes.value : ({} as Config);
}

/**
 * Serialize Config object to JSON string
 */
export function serializeConfig(config: Config): string {
  return JSON.stringify(config);
}

// ============================================================================
// Safe Decode (returns Try for explicit error handling)
// ============================================================================

/**
 * Try to parse panels, returning explicit Try for error handling
 */
export function tryParsePanels(raw: string): Try<Panels, Error> {
  return tryDo(function* () {
    const parsed = yield runCatching(() => JSON.parse(raw));
    const data = (parsed as { data?: unknown })?.data ?? [];
    return yield decode(PanelsSchema, data);
  });
}

/**
 * Try to parse config, returning explicit Try for error handling
 */
export function tryParseConfig(raw: string): Try<Config, Error> {
  return tryDo(function* () {
    const parsed = yield runCatching(() => JSON.parse(raw));
    return yield decode(ConfigSchema, parsed);
  });
}
