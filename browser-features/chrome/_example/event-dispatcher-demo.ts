// SPDX-License-Identifier: MPL-2.0
// This file demonstrates the EventDispatcher system with DOP patterns

import { defineModule, type ModuleContext } from "#features-chrome/utils/base";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";

// ============================================================================
// Module A State - Provider
// ============================================================================

const moduleAState = {
  data: "initial value",
};

// ============================================================================
// Module A Event Methods
// ============================================================================

const createModuleAEventMethods = (ctx: ModuleContext) => ({
  getData(): string {
    ctx.log.debug("getData called");
    return moduleAState.data;
  },

  setData(value: string): void {
    ctx.log.debug("setData called with", value);
    moduleAState.data = value;
  },

  async performAction(action: string): Promise<string> {
    ctx.log.debug("performAction called with", action);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return `Performed: ${action}`;
  },
});

// ============================================================================
// Module A Definition
// ============================================================================

export const ModuleA = defineModule({
  name: "module-a",
  hot: import.meta.hot,
}, {
  init(ctx) {
    ctx.log.debug("ModuleA initialized");
  },

  cleanup(ctx) {
    ctx.log.debug("ModuleA cleanup");
    moduleAState.data = "initial value";
  },

  eventMethods: createModuleAEventMethods,
});

// ============================================================================
// Module B - Consumer
// ============================================================================

const demonstrateEventDispatcherCalls = async (ctx: ModuleContext): Promise<void> => {
  ctx.log.debug("=== EventDispatcher with Either ===");

  // All calls return Either<Error, T | undefined>
  const dataResult = await ctx.events["module-a"].getData();

  pipe(
    dataResult,
    E.fold(
      (error) => ctx.log.error("Failed to get data:", error),
      (data) => {
        if (data === undefined) {
          ctx.log.debug("ModuleA not available");
        } else {
          ctx.log.debug("Received data from ModuleA:", data);
        }
      },
    ),
  );

  // Set data
  const setResult = await ctx.events["module-a"].setData("new value");
  pipe(
    setResult,
    E.fold(
      (error) => ctx.log.error("Failed to set data:", error),
      () => ctx.log.debug("Data set successfully"),
    ),
  );

  // Perform action
  const actionResult = await ctx.events["module-a"].performAction("test");
  pipe(
    actionResult,
    E.fold(
      (error) => ctx.log.error("Failed to perform action:", error),
      (result) => ctx.log.debug("Action result:", result || "No result"),
    ),
  );
};

export const ModuleB = defineModule({
  name: "module-b",
  softDependencies: ["module-a"],
  hot: import.meta.hot,
}, {
  init(ctx) {
    ctx.log.debug("ModuleB initialized");
    demonstrateEventDispatcherCalls(ctx);
  },

  cleanup(ctx) {
    ctx.log.debug("ModuleB cleanup");
  },

  eventMethods(ctx) {
    return {
      notifyModuleB(message: string): void {
        ctx.log.debug("Received notification:", message);
      },
    };
  },
});

/**
 * Benefits of EventDispatcher with DOP:
 *
 * 1. ✅ **Pure Functions**: No class boilerplate
 * 2. ✅ **Module State**: Plain data objects
 * 3. ✅ **Context Injection**: ctx.events, ctx.log
 * 4. ✅ **Error Safety**: Either<Error, T | undefined>
 * 5. ✅ **Simple**: No decorators, no inheritance
 */
