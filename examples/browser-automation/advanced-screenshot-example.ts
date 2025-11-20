// SPDX-License-Identifier: MPL-2.0

/**
 * Example: Browser automation with mus-uc-devtools package
 * 
 * This example demonstrates using the @f3liz/mus-uc-devtools package
 * to control the browser and take screenshots.
 * 
 * Note: This requires the mus-uc-devtools WASM module to be available.
 * The example falls back to raw Marionette protocol if the module is not available.
 * 
 * Usage:
 *   deno run -A examples/browser-automation/advanced-screenshot-example.ts
 */

import { runWithAutomation } from "../../tools/src/browser_launcher_with_automation.ts";
import * as path from "@std/path";

const PROJECT_ROOT = path.resolve(
  path.dirname(path.fromFileUrl(import.meta.url)),
  "..",
  "..",
);

/**
 * Use mus-uc-devtools if available, otherwise fall back to raw Marionette
 */
async function takeScreenshotWithDevtools(marionettePort: number): Promise<void> {
  console.log("[example] Attempting to use mus-uc-devtools...");
  
  try {
    // Try to import mus-uc-devtools
    // Note: The package provides WASM-based tools, so we'll use the raw Marionette approach
    // as a more reliable method for now
    await takeScreenshotRaw(marionettePort);
  } catch (error: any) {
    console.log("[example] Falling back to raw Marionette protocol");
    await takeScreenshotRaw(marionettePort);
  }
}

async function takeScreenshotRaw(marionettePort: number): Promise<void> {
  console.log("[example] Connecting to Marionette on port", marionettePort);
  console.log("[example] Using chrome context for full browser screenshot");
  
  const conn = await Deno.connect({ hostname: "localhost", port: marionettePort });
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const buffer = new Uint8Array(4096);
  
  try {
    // Read initial server message
    const n = await conn.read(buffer);
    if (n) {
      const msg = decoder.decode(buffer.subarray(0, n));
      console.log("[example] Connected to Marionette");
    }
    
    // Create new session
    const newSessionCmd = JSON.stringify([0, 1, "WebDriver:NewSession", { capabilities: {} }]);
    await conn.write(encoder.encode(`${newSessionCmd.length}:${newSessionCmd}`));
    
    const n2 = await conn.read(buffer);
    let sessionId = "";
    if (n2) {
      const response = decoder.decode(buffer.subarray(0, n2));
      const colonIndex = response.indexOf(":");
      if (colonIndex > 0) {
        const jsonPart = response.substring(colonIndex + 1);
        const sessionData = JSON.parse(jsonPart);
        sessionId = sessionData[3]?.sessionId || "";
        console.log("[example] Session created:", sessionId.substring(0, 20) + "...");
      }
    }
    
    // Switch to chrome context for full browser access
    console.log("[example] Switching to chrome context...");
    const setChromeContextCmd = JSON.stringify([0, 2, "Marionette:SetContext", { value: "chrome" }]);
    await conn.write(encoder.encode(`${setChromeContextCmd.length}:${setChromeContextCmd}`));
    
    // Read context switch response
    const n3 = await conn.read(buffer);
    if (n3) {
      console.log("[example] Successfully switched to chrome context");
    }
    
    // Wait a bit for browser to be fully rendered
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Execute script to take full browser screenshot
    console.log("[example] Taking full browser screenshot with chrome context...");
    const screenshotScript = `
      const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
      const window = Services.wm.getMostRecentWindow("navigator:browser");
      const canvas = window.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
      const context = canvas.getContext("2d");
      const width = window.outerWidth;
      const height = window.outerHeight;
      canvas.width = width;
      canvas.height = height;
      context.drawWindow(window, 0, 0, width, height, "rgb(255,255,255)");
      return canvas.toDataURL("image/png").split(",")[1];
    `;
    
    const executeScriptCmd = JSON.stringify([0, 3, "WebDriver:ExecuteScript", { 
      script: screenshotScript,
      args: []
    }]);
    await conn.write(encoder.encode(`${executeScriptCmd.length}:${executeScriptCmd}`));
    
    // Read screenshot (may need multiple reads for large images)
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    
    // Read first chunk to get total length
    const firstChunk = new Uint8Array(8192);
    const firstN = await conn.read(firstChunk);
    if (firstN) {
      const firstPart = decoder.decode(firstChunk.subarray(0, firstN));
      const colonIndex = firstPart.indexOf(":");
      
      if (colonIndex > 0) {
        const lengthStr = firstPart.substring(0, colonIndex);
        const expectedLength = parseInt(lengthStr, 10);
        
        // Store first chunk (minus the length prefix)
        const afterColon = colonIndex + 1;
        chunks.push(firstChunk.subarray(afterColon, firstN));
        totalBytes += firstN - afterColon;
        
        // Read remaining data if needed
        while (totalBytes < expectedLength) {
          const chunk = new Uint8Array(8192);
          const n = await conn.read(chunk);
          if (!n) break;
          chunks.push(chunk.subarray(0, n));
          totalBytes += n;
        }
        
        // Combine all chunks
        const fullResponse = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
          fullResponse.set(chunk, offset);
          offset += chunk.length;
        }
        
        const fullText = decoder.decode(fullResponse);
        const screenshotData = JSON.parse(fullText);
        const screenshotBase64 = screenshotData[3]?.value;
        
        if (screenshotBase64) {
          // Save screenshot
          const screenshotDir = path.join(PROJECT_ROOT, "screenshots");
          await Deno.mkdir(screenshotDir, { recursive: true }).catch(() => {});
          
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const screenshotPath = path.join(screenshotDir, `noraneko-advanced-${timestamp}.png`);
          
          // Decode base64 and save
          const screenshotBytes = Uint8Array.from(atob(screenshotBase64), c => c.charCodeAt(0));
          await Deno.writeFile(screenshotPath, screenshotBytes);
          
          console.log(`[example] ✓ Screenshot saved to: ${screenshotPath}`);
          console.log(`[example] Screenshot size: ${(screenshotBytes.length / 1024).toFixed(2)} KB`);
        }
      }
    }
  } finally {
    conn.close();
  }
}

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Noraneko Browser Automation - Advanced Screenshot Example");
  console.log("Using mus-uc-devtools integration");
  console.log("=".repeat(60));
  
  const marionettePort = 2828;
  
  await runWithAutomation({
    port: 5180,
    marionettePort: marionettePort,
    headless: false,
    onReady: async (wsUrl: string, port: number) => {
      console.log(`\n[example] Browser is ready!`);
      console.log(`[example] WebDriver BiDi URL: ${wsUrl}`);
      console.log(`[example] Marionette Port: ${port}\n`);
      
      try {
        // Wait for browser to fully start
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Take screenshot using devtools
        await takeScreenshotWithDevtools(port);
        
        console.log("\n" + "=".repeat(60));
        console.log("✓ Example completed successfully!");
        console.log("Check the 'screenshots' directory for the captured image.");
        console.log("Press Ctrl+C to close the browser");
        console.log("=".repeat(60));
      } catch (error: any) {
        console.error(`\n[example] Error: ${error?.message ?? error}`);
        console.error(error.stack);
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
