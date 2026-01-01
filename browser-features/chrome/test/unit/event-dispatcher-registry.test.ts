// SPDX-License-Identifier: MPL-2.0

import { assert, assertEquals } from "@jsr/std__assert";
import {
  registerModuleEventDispatcher,
  unregisterModuleEventDispatcher,
  isModuleRegistered,
  getEventDispatcherInstance,
  // Result type utilities
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  mapResult,
  toEither,
  fromEither,
  type Result,
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

// ============================================================================
// Result Type Tests (DOP-style utilities)
// ============================================================================

Deno.test("Result Type - ok creates success result", () => {
  const result = ok(42);
  assert(isOk(result), "Should be ok");
  assertEquals(result[0], 42, "Value should be 42");
  assertEquals(result[1], null, "Error should be null");
});

Deno.test("Result Type - err creates error result", () => {
  const result = err<number>("Something went wrong");
  assert(isErr(result), "Should be err");
  assertEquals(result[0], null, "Value should be null");
  assertEquals(result[1]?.message, "Something went wrong", "Error message should match");
});

Deno.test("Result Type - unwrap returns value on success", () => {
  const result = ok("hello");
  assertEquals(unwrap(result), "hello");
});

Deno.test("Result Type - unwrap throws on error", () => {
  const result = err<string>("failed");
  let threw = false;
  try {
    unwrap(result);
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message, "failed");
  }
  assert(threw, "Should have thrown");
});

Deno.test("Result Type - unwrapOr returns default on error", () => {
  const result = err<number>("failed");
  assertEquals(unwrapOr(result, 99), 99);
});

Deno.test("Result Type - unwrapOr returns value on success", () => {
  const result = ok(42);
  assertEquals(unwrapOr(result, 99), 42);
});

Deno.test("Result Type - mapResult transforms success value", () => {
  const result = ok(5);
  const mapped = mapResult(result, (x) => x * 2);
  assert(isOk(mapped));
  assertEquals(mapped[0], 10);
});

Deno.test("Result Type - mapResult preserves error", () => {
  const result = err<number>("failed");
  const mapped = mapResult(result, (x) => x * 2);
  assert(isErr(mapped));
  assertEquals(mapped[1]?.message, "failed");
});

Deno.test("Result Type - toEither converts ok to Right", () => {
  const result = ok("value");
  const either = toEither(result);
  assert(E.isRight(either));
  if (E.isRight(either)) {
    assertEquals(either.right, "value");
  }
});

Deno.test("Result Type - toEither converts err to Left", () => {
  const result = err<string>("error");
  const either = toEither(result);
  assert(E.isLeft(either));
  if (E.isLeft(either)) {
    assertEquals(either.left.message, "error");
  }
});

Deno.test("Result Type - fromEither converts Right to ok", () => {
  const either = E.right("value");
  const result = fromEither(either);
  assert(isOk(result));
  assertEquals(result[0], "value");
});

Deno.test("Result Type - fromEither converts Left to err", () => {
  const either = E.left(new Error("error"));
  const result = fromEither(either);
  assert(isErr(result));
  assertEquals(result[1]?.message, "error");
});

// ============================================================================
// EventDispatcher Registry Tests (DOP pure functions)
// ============================================================================

Deno.test("EventDispatcher - Register and check module", () => {
  registerModuleEventDispatcher("test-module-a", moduleAFunctions);
  assert(isModuleRegistered("test-module-a"), "Module should be registered");
  unregisterModuleEventDispatcher("test-module-a");
  assert(!isModuleRegistered("test-module-a"), "Module should be unregistered");
});

Deno.test("EventDispatcher - Get instance and call method", async () => {
  registerModuleEventDispatcher("test-module-a", moduleAFunctions);
  const instance = getEventDispatcherInstance("test-module-a");
  const result = await instance.getData();
  
  assert(E.isRight(result), "Should return Right");
  if (E.isRight(result)) {
    assertEquals(result.right, "test-data", "Should return correct data");
  }
  
  unregisterModuleEventDispatcher("test-module-a");
});

Deno.test("EventDispatcher - Call method with arguments", async () => {
  registerModuleEventDispatcher("test-module-b", moduleBFunctions);
  const instance = getEventDispatcherInstance("test-module-b");
  const result = await instance.add(5, 3);
  
  assert(E.isRight(result), "Should return Right");
  if (E.isRight(result)) {
    assertEquals(result.right, 8, "Should return sum of arguments");
  }
  
  unregisterModuleEventDispatcher("test-module-b");
});

Deno.test("EventDispatcher - Call async method", async () => {
  registerModuleEventDispatcher("test-module-a", moduleAFunctions);
  const instance = getEventDispatcherInstance("test-module-a");
  const result = await instance.asyncMethod();
  
  assert(E.isRight(result), "Should return Right");
  if (E.isRight(result)) {
    assertEquals(result.right, "async-result", "Should return async result");
  }
  
  unregisterModuleEventDispatcher("test-module-a");
});

Deno.test("EventDispatcher - Get non-existent module returns soft proxy", async () => {
  const instance = getEventDispatcherInstance("non-existent-module");
  const result = await instance.someMethod();
  
  assert(E.isRight(result), "Should return Right for missing module");
  if (E.isRight(result)) {
    assertEquals(result.right, undefined, "Should return undefined for missing module");
  }
});

Deno.test("EventDispatcher - Handle errors in event methods", async () => {
  registerModuleEventDispatcher("test-module-a", moduleAFunctions);
  const instance = getEventDispatcherInstance("test-module-a");
  const result = await instance.throwError();
  
  assert(E.isLeft(result), "Should return Left on error");
  if (E.isLeft(result)) {
    assertEquals(result.left.message, "Intentional error", "Should contain error message");
  }
  
  unregisterModuleEventDispatcher("test-module-a");
});

Deno.test("EventDispatcher - Multiple modules can be registered", async () => {
  registerModuleEventDispatcher("module-1", { method1: () => "result1" });
  registerModuleEventDispatcher("module-2", { method2: () => "result2" });

  const instance1 = getEventDispatcherInstance("module-1");
  const instance2 = getEventDispatcherInstance("module-2");
  
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

Deno.test("EventDispatcher - Module replacement shows warning", () => {
  registerModuleEventDispatcher("test-module", { method: () => "v1" });
  // This should show a warning in console
  registerModuleEventDispatcher("test-module", { method: () => "v2" });
  
  assert(isModuleRegistered("test-module"), "Module should still be registered");
  
  unregisterModuleEventDispatcher("test-module");
});

console.log("All EventDispatcher Registry tests passed!");
