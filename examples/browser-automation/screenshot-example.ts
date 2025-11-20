// SPDX-License-Identifier: MPL-2.0

/**
 * Example: Browser automation with mus-uc-devtools
 * 
 * This example demonstrates:
 * 1. Launching Noraneko browser with Marionette enabled
 * 2. Waiting for the browser to be fully loaded
 * 3. Taking a screenshot using mus-uc-devtools
 * 
 * Usage:
 *   deno run -A examples/browser-automation/screenshot-example.ts
 */

import { runWithAutomation } from "../../tools/src/browser_launcher_with_automation.ts";
import * as path from "@std/path";

const PROJECT_ROOT = path.resolve(
  path.dirname(path.fromFileUrl(import.meta.url)),
  "..",
  "..",
);

async function waitForBrowserReady(marionettePort: number): Promise<void> {
  console.log("[example] Waiting for browser to be fully loaded...");
  
  // Wait a bit for the browser to stabilize
  await new Promise((resolve) => setTimeout(resolve, 3000));
  
  // Try to connect to Marionette
  const maxRetries = 30;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const conn = await Deno.connect({ hostname: "localhost", port: marionettePort });
      conn.close();
      console.log("[example] Browser is ready!");
      return;
    } catch {
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
  
  throw new Error("Browser did not become ready in time");
}

async function takeScreenshot(marionettePort: number): Promise<void> {
  console.log("[example] Taking screenshot...");
  
  try {
    // Connect to Marionette
    const conn = await Deno.connect({ hostname: "localhost", port: marionettePort });
    
    // Marionette uses a simple text protocol
    // Read the initial server message
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const buffer = new Uint8Array(4096);
    
    const n = await conn.read(buffer);
    if (n) {
      const msg = decoder.decode(buffer.subarray(0, n));
      console.log("[example] Marionette connected:", msg.substring(0, 100) + "...");
    }
    
    // Send new session command
    const newSessionCmd = JSON.stringify([0, 1, "WebDriver:NewSession", { capabilities: {} }]);
    await conn.write(encoder.encode(`${newSessionCmd.length}:${newSessionCmd}`));
    
    // Read response
    const n2 = await conn.read(buffer);
    if (n2) {
      const response = decoder.decode(buffer.subarray(0, n2));
      console.log("[example] Session created");
      
      // Parse the session ID from the response
      // Response format: length:json
      const colonIndex = response.indexOf(":");
      if (colonIndex > 0) {
        const jsonPart = response.substring(colonIndex + 1);
        const sessionData = JSON.parse(jsonPart);
        console.log("[example] Session ID:", sessionData[3]?.sessionId || "unknown");
      }
    }
    
    // Take screenshot command
    const screenshotCmd = JSON.stringify([0, 2, "WebDriver:TakeScreenshot", {}]);
    await conn.write(encoder.encode(`${screenshotCmd.length}:${screenshotCmd}`));
    
    // Read screenshot response
    const screenshotBuffer = new Uint8Array(1024 * 1024 * 5); // 5MB buffer for screenshot
    const n3 = await conn.read(screenshotBuffer);
    if (n3) {
      const response = decoder.decode(screenshotBuffer.subarray(0, n3));
      const colonIndex = response.indexOf(":");
      if (colonIndex > 0) {
        const jsonPart = response.substring(colonIndex + 1);
        try {
          const screenshotData = JSON.parse(jsonPart);
          const screenshotBase64 = screenshotData[3]?.value;
          
          if (screenshotBase64) {
            // Save screenshot to file
            const screenshotDir = path.join(PROJECT_ROOT, "screenshots");
            try {
              await Deno.mkdir(screenshotDir, { recursive: true });
            } catch {
              // Directory might already exist
            }
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const screenshotPath = path.join(screenshotDir, `noraneko-${timestamp}.png`);
            
            // Decode base64 and save
            const screenshotBytes = Uint8Array.from(atob(screenshotBase64), c => c.charCodeAt(0));
            await Deno.writeFile(screenshotPath, screenshotBytes);
            
            console.log(`[example] ✓ Screenshot saved to: ${screenshotPath}`);
          }
        } catch (e) {
          console.error("[example] Error parsing screenshot response:", e);
        }
      }
    }
    
    conn.close();
  } catch (error: any) {
    console.error(`[example] Error taking screenshot: ${error?.message ?? error}`);
    throw error;
  }
}

async function main(): Promise<void> {
  console.log("[example] Starting Noraneko browser automation example");
  console.log("[example] This will launch the browser, wait for it to load, and take a screenshot");
  
  const marionettePort = 2828;
  
  // Launch browser with automation support
  await runWithAutomation({
    port: 5180,
    marionettePort: marionettePort,
    headless: false, // Set to true for headless mode
    onReady: async (wsUrl: string, port: number) => {
      console.log(`[example] Browser ready! WebDriver BiDi: ${wsUrl}`);
      
      try {
        // Wait for browser to be fully loaded
        await waitForBrowserReady(port);
        
        // Take screenshot
        await takeScreenshot(port);
        
        console.log("[example] ✓ Example completed successfully!");
        console.log("[example] Press Ctrl+C to close the browser");
      } catch (error: any) {
        console.error(`[example] Error: ${error?.message ?? error}`);
      }
    },
  });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    Deno.exit(1);
  });
}
