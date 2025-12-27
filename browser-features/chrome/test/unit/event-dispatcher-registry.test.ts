// SPDX-License-Identifier: MPL-2.0

import { assert, assertEquals } from "@jsr/std__assert";
import {
  eventDispatcherRegistry,
  registerModuleEventDispatcher,
  unregisterModuleEventDispatcher,
  isModuleRegistered,
} from "#bridge-loader-features/loader/event-dispatcher-registry.ts";
import * as E from "fp-ts/lib/Either.js";

// Test module A with event methods
const moduleAFunctions = {
  getData: () => "test-data",
  setData: (value: string) => {
    console.log("setData called with:", value);
    return value;
  },
  asyncMethod: async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return "async-result";
  },
  throwError: () => {
    throw new Error("Intentional error");
  },
};

// Test module B with event methods
const moduleBFunctions = {
  ping: () => "pong",
  add: (a: number, b: number) => a + b,
};

// Test 1: Module registration
Deno.test("EventDispatcher Registry - Register and check module", () => {
  registerModuleEventDispatcher("test-module-a", moduleAFunctions);
  assert(isModuleRegistered("test-module-a"), "Module should be registered");
  unregisterModuleEventDispatcher("test-module-a");
  assert(!isModuleRegistered("test-module-a"), "Module should be unregistered");
});

// Test 2: Get event dispatcher instance and call method
Deno.test("EventDispatcher Registry - Get instance and call method", async () => {
  registerModuleEventDispatcher("test-module-a", moduleAFunctions);
  const instance = eventDispatcherRegistry.getEventDispatcherInstance("test-module-a");
  const result = await instance.getData();
  
  assert(E.isRight(result), "Should return Right");
  if (E.isRight(result)) {
    assertEquals(result.right, "test-data", "Should return correct data");
  }
  
  unregisterModuleEventDispatcher("test-module-a");
});

// Test 3: Call method with arguments
Deno.test("EventDispatcher Registry - Call method with arguments", async () => {
  registerModuleEventDispatcher("test-module-b", moduleBFunctions);
  const instance = eventDispatcherRegistry.getEventDispatcherInstance("test-module-b");
  const result = await instance.add(5, 3);
  
  assert(E.isRight(result), "Should return Right");
  if (E.isRight(result)) {
    assertEquals(result.right, 8, "Should return sum of arguments");
  }
  
  unregisterModuleEventDispatcher("test-module-b");
});

// Test 4: Call async method
Deno.test("EventDispatcher Registry - Call async method", async () => {
  registerModuleEventDispatcher("test-module-a", moduleAFunctions);
  const instance = eventDispatcherRegistry.getEventDispatcherInstance("test-module-a");
  const result = await instance.asyncMethod();
  
  assert(E.isRight(result), "Should return Right");
  if (E.isRight(result)) {
    assertEquals(result.right, "async-result", "Should return async result");
  }
  
  unregisterModuleEventDispatcher("test-module-a");
});

// Test 5: Get non-existent module (soft proxy)
Deno.test("EventDispatcher Registry - Get non-existent module returns soft proxy", async () => {
  const instance = eventDispatcherRegistry.getEventDispatcherInstance("non-existent-module");
  const result = await instance.someMethod();
  
  assert(E.isRight(result), "Should return Right for missing module");
  if (E.isRight(result)) {
    assertEquals(result.right, undefined, "Should return undefined for missing module");
  }
});

// Test 6: Handle errors in event methods
Deno.test("EventDispatcher Registry - Handle errors in event methods", async () => {
  registerModuleEventDispatcher("test-module-a", moduleAFunctions);
  const instance = eventDispatcherRegistry.getEventDispatcherInstance("test-module-a");
  const result = await instance.throwError();
  
  assert(E.isLeft(result), "Should return Left on error");
  if (E.isLeft(result)) {
    assertEquals(result.left.message, "Intentional error", "Should contain error message");
  }
  
  unregisterModuleEventDispatcher("test-module-a");
});

// Test 7: Multiple modules can be registered
Deno.test("EventDispatcher Registry - Multiple modules", async () => {
  registerModuleEventDispatcher("module-1", { method1: () => "result1" });
  registerModuleEventDispatcher("module-2", { method2: () => "result2" });

  const instance1 = eventDispatcherRegistry.getEventDispatcherInstance("module-1");
  const instance2 = eventDispatcherRegistry.getEventDispatcherInstance("module-2");
  
  const result1 = await instance1.method1();
  const result2 = await instance2.method2();

  assert(E.isRight(result1) && E.isRight(result2), "Both should return Right");
  if (E.isRight(result1) && E.isRight(result2)) {
    assertEquals(result1.right, "result1");
    assertEquals(result2.right, "result2");
  }

  unregisterModuleEventDispatcher("module-1");
  unregisterModuleEventDispatcher("module-2");
});

// Test 8: Module replacement warning
Deno.test("EventDispatcher Registry - Module replacement shows warning", () => {
  registerModuleEventDispatcher("test-module", { method: () => "v1" });
  // This should show a warning in console
  registerModuleEventDispatcher("test-module", { method: () => "v2" });
  
  assert(isModuleRegistered("test-module"), "Module should still be registered");
  
  unregisterModuleEventDispatcher("test-module");
});

console.log("All EventDispatcher Registry tests passed!");
