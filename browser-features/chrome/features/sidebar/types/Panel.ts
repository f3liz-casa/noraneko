// SPDX-License-Identifier: MPL-2.0
// Panel type definitions

import { v } from "@lib/std";

// ============================================================================
// Valibot Schemas
// ============================================================================

export const PanelSchema = v.object({
  // Required fields
  id: v.string(),
  type: v.picklist(["web", "static", "extension"]),
  width: v.number(),

  // Optional fields
  url: v.optional(v.nullable(v.string())),
  icon: v.optional(v.nullable(v.string())),
  userContextId: v.optional(v.nullable(v.number())),
  zoomLevel: v.optional(v.nullable(v.number())),
  userAgent: v.optional(v.nullable(v.boolean())),
  extensionId: v.optional(v.nullable(v.string())),
});

export const PanelsSchema = v.array(PanelSchema);

// ============================================================================
// Types (inferred from schemas)
// ============================================================================

export type Panel = v.InferOutput<typeof PanelSchema>;
export type Panels = v.InferOutput<typeof PanelsSchema>;
