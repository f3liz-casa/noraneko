// SPDX-License-Identifier: MPL-2.0

import { assertRejects } from "@jsr/std__assert";
import { onModuleLoaded } from "#bridge-loader-features/loader/mod.ts";

await assertRejects(() => onModuleLoaded("module-that-could-not-be-found"));
await onModuleLoaded("__init_all__");
await assertRejects(() => onModuleLoaded("module-that-could-not-be-found"));
