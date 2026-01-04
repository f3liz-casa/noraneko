// SPDX-License-Identifier: MPL-2.0
// Window panel sidebar state type

import { v } from "@lib/std";
import { PanelsSchema } from "./Panel.ts";

// ============================================================================
// Valibot Schemas
// ============================================================================

export const WindowStateSchema = v.object({
  panels: PanelsSchema,
  currentPanelId: v.nullable(v.string()),
});

export const DataSchema = v.object({
  data: PanelsSchema,
});

// ============================================================================
// Types (inferred from schemas)
// ============================================================================

export type WindowState = v.InferOutput<typeof WindowStateSchema>;
export type Data = v.InferOutput<typeof DataSchema>;
