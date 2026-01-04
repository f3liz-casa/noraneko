// SPDX-License-Identifier: MPL-2.0
// Config type definitions

import { v } from "@lib/std";

// ============================================================================
// Valibot Schemas
// ============================================================================

export const ConfigSchema = v.object({
  // Required
  globalWidth: v.number(),
  autoUnload: v.boolean(),
  position_start: v.boolean(),
  displayed: v.boolean(),
  webExtensionRunningEnabled: v.boolean(),

  // Optional
  floatingWidth: v.optional(v.number()),
  floatingHeight: v.optional(v.number()),
  floatingPositionLeft: v.optional(v.number()),
  floatingPositionTop: v.optional(v.number()),
});

// ============================================================================
// Types (inferred from schemas)
// ============================================================================

export type Config = v.InferOutput<typeof ConfigSchema>;
