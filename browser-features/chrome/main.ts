// SPDX-License-Identifier: MPL-2.0

// Feature modules - included in the Vite build.
// Loaded at runtime by the tsdown-built loader-features.
export const features = import.meta.glob("./features/*/mod.ts");
export const featuresLegacy = import.meta.glob("./features/*/index.ts");
export const staticFeatures = import.meta.glob("./static/*/index.ts");
