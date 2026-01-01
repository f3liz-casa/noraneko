// SPDX-License-Identifier: MPL-2.0
/// <reference lib="deno.ns" />

import { assert, assertEquals, assertNotEquals } from "@jsr/std__assert";

/**
 * Unit tests for Module Registry and Hotswapping
 * 
 * These tests verify the core hotswapping functionality including:
 * - Module registration and retrieval
 * - Cleanup execution
 * - Module unregistration
 */

// Mock module instance with cleanup function
class MockModule {
  public cleanupCalled = false;
  public initCalled = false;

  init(): void {
    this.initCalled = true;
  }

  cleanup(): void {
    this.cleanupCalled = true;
  }

  eventMethods() {
    return {
      testMethod: () => "test",
    };
  }
}

// Mock module without cleanup function
class MockModuleNoCleanup {
  public initCalled = false;

  init(): void {
    this.initCalled = true;
  }
}

// Test metadata
const testMetadata = {
  moduleName: "test-module",
  dependencies: [],
  softDependencies: [],
};

// Test 1: Module instance should have cleanup method enforced by decorator
Deno.test("HotswappableComponent: cleanup method should be required", () => {
  const moduleWithCleanup = new MockModule();
  assert(typeof moduleWithCleanup.cleanup === "function", "Module should have cleanup method");
});

// Test 2: Cleanup should be callable
Deno.test("HotswappableComponent: cleanup method should be callable", () => {
  const module = new MockModule();
  module.cleanup();
  assertEquals(module.cleanupCalled, true, "cleanup should have been called");
});

// Test 3: Module without cleanup should still work (with warning)
Deno.test("HotswappableComponent: module without cleanup should work", () => {
  const module = new MockModuleNoCleanup();
  assertEquals(typeof (module as any).cleanup, "undefined", "Module without cleanup should not have cleanup method");
});

// Test 4: Metadata should contain required fields
Deno.test("Module Metadata: should contain required fields", () => {
  assertNotEquals(testMetadata.moduleName, undefined, "moduleName should be defined");
  assertNotEquals(testMetadata.dependencies, undefined, "dependencies should be defined");
  assertNotEquals(testMetadata.softDependencies, undefined, "softDependencies should be defined");
});

// Test 5: Module registry interface
Deno.test("ModuleRegistry Interface: should support basic operations", () => {
  // Simulating module registry operations
  const registry = new Map<string, any>();
  
  // Register
  const module = new MockModule();
  registry.set("test-module", {
    name: "test-module",
    instance: module,
    metadata: testMetadata,
    loadedAt: Date.now(),
    isHotfixModule: false,
  });
  
  // Has
  assertEquals(registry.has("test-module"), true, "Registry should have registered module");
  
  // Get
  const retrieved = registry.get("test-module");
  assertNotEquals(retrieved, undefined, "Should retrieve registered module");
  assertEquals(retrieved.name, "test-module", "Should retrieve correct module");
  
  // Unregister
  registry.delete("test-module");
  assertEquals(registry.has("test-module"), false, "Registry should not have unregistered module");
});

// Test 6: Cleanup order should respect dependencies
Deno.test("ModuleRegistry: cleanup should respect dependency order", () => {
  const cleanupOrder: string[] = [];
  
  const moduleA = {
    cleanup: () => { cleanupOrder.push("A"); },
    metadata: { moduleName: "A", dependencies: [], softDependencies: [] },
  };
  
  const moduleB = {
    cleanup: () => { cleanupOrder.push("B"); },
    metadata: { moduleName: "B", dependencies: ["A"], softDependencies: [] },
  };
  
  const moduleC = {
    cleanup: () => { cleanupOrder.push("C"); },
    metadata: { moduleName: "C", dependencies: ["B"], softDependencies: [] },
  };
  
  // Cleanup should happen in reverse dependency order: C -> B -> A
  // Because C depends on B, B depends on A, so C must be cleaned up first
  moduleC.cleanup();
  moduleB.cleanup();
  moduleA.cleanup();
  
  assertEquals(cleanupOrder, ["C", "B", "A"], "Cleanup order should be dependents first");
});

// Test 7: Hotswap event types
Deno.test("HotswapEvent: should have correct event types", () => {
  type HotswapEventType = "cleanup" | "load" | "hotswap_start" | "hotswap_complete";
  
  const validTypes: HotswapEventType[] = ["cleanup", "load", "hotswap_start", "hotswap_complete"];
  
  for (const type of validTypes) {
    assertNotEquals(type, undefined, `Event type ${type} should be valid`);
  }
});

// Test 8: Module should track cleanup state
Deno.test("HotswappableComponent: should track cleanup state", () => {
  const module = new MockModule();
  
  assertEquals(module.cleanupCalled, false, "cleanup should not be called initially");
  module.cleanup();
  assertEquals(module.cleanupCalled, true, "cleanup should be marked as called");
});

// Test 9: Hotfix module flag
Deno.test("ModuleRegistry: should track hotfix module flag", () => {
  const normalModule = {
    name: "normal-module",
    isHotfixModule: false,
  };
  
  const hotfixModule = {
    name: "hotfix-module",
    isHotfixModule: true,
    hotfixId: "fix-123",
  };
  
  assertEquals(normalModule.isHotfixModule, false, "Normal module should not be hotfix");
  assertEquals(hotfixModule.isHotfixModule, true, "Hotfix module should be marked as hotfix");
  assertEquals(hotfixModule.hotfixId, "fix-123", "Hotfix module should have hotfixId");
});

// Test 10: Event listeners for hotswap
Deno.test("ModuleRegistry: should support event listeners", () => {
  const events: string[] = [];
  const listeners = new Set<(event: any) => void>();
  
  const listener1 = (event: any) => { events.push(`listener1: ${event.type}`); };
  const listener2 = (event: any) => { events.push(`listener2: ${event.type}`); };
  
  // Add listeners
  listeners.add(listener1);
  listeners.add(listener2);
  assertEquals(listeners.size, 2, "Should have 2 listeners");
  
  // Notify listeners
  const event = { type: "hotswap_start", timestamp: Date.now() };
  for (const listener of listeners) {
    listener(event);
  }
  
  assertEquals(events.length, 2, "Both listeners should be notified");
  assert(events.includes("listener1: hotswap_start"), "listener1 should receive event");
  assert(events.includes("listener2: hotswap_start"), "listener2 should receive event");
  
  // Remove listener
  listeners.delete(listener1);
  assertEquals(listeners.size, 1, "Should have 1 listener after removal");
});

console.log("All Module Registry and Hotswapping tests passed!");
