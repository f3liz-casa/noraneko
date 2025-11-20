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

async function takeFullBrowserScreenshot(marionettePort: number): Promise<void> {
  console.log("[example] Taking full browser screenshot using chrome context...");
  
  try {
    // Connect to Marionette
    const conn = await Deno.connect({ hostname: "localhost", port: marionettePort });
    
    // Marionette uses a simple text protocol
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
    }
    
    // Switch to chrome context to access full browser
    console.log("[example] Switching to chrome context for full browser access...");
    const setChromeContextCmd = JSON.stringify([0, 2, "Marionette:SetContext", { value: "chrome" }]);
    await conn.write(encoder.encode(`${setChromeContextCmd.length}:${setChromeContextCmd}`));
    
    // Read context switch response
    const n3 = await conn.read(buffer);
    if (n3) {
      console.log("[example] Switched to chrome context");
    }
    
    // Execute script to take full browser screenshot using Firefox APIs
    console.log("[example] Executing screenshot script in chrome context...");
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
    
    // Read screenshot response (may be large)
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    
    // Read first chunk
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
        
        // Read remaining data
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
          const screenshotPath = path.join(screenshotDir, `noraneko-fullbrowser-${timestamp}.png`);
          
          // Decode base64 and save
          const screenshotBytes = Uint8Array.from(atob(screenshotBase64), c => c.charCodeAt(0));
          await Deno.writeFile(screenshotPath, screenshotBytes);
          
          console.log(`[example] ✓ Full browser screenshot saved to: ${screenshotPath}`);
          console.log(`[example] Screenshot size: ${(screenshotBytes.length / 1024).toFixed(2)} KB`);
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
        await takeFullBrowserScreenshot(port);
        
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
