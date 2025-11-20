// SPDX-License-Identifier: MPL-2.0

/**
 * Example script demonstrating browser automation with mus-uc-devtools
 * This script connects to a running Noraneko browser instance via Marionette protocol
 * and captures a fullscreen screenshot using Chrome context APIs.
 */

import * as path from "@std/path";
import * as fs from "@std/fs";

/**
 * Marionette client for connecting to Firefox/Noraneko
 */
class MarionetteClient {
  private socket: Deno.TcpConn | null = null;
  private messageId = 0;
  private context = "chrome";

  constructor(
    private host: string = "localhost",
    private port: number = 2828,
  ) {}

  async connect(): Promise<void> {
    console.log(`Connecting to Marionette at ${this.host}:${this.port}...`);

    this.socket = await Deno.connect({
      hostname: this.host,
      port: this.port,
    });

    // Read handshake
    const buffer = new Uint8Array(4096);
    const n = await this.socket.read(buffer);
    if (n) {
      const handshake = JSON.parse(
        new TextDecoder().decode(buffer.subarray(0, n)),
      );
      console.log("Marionette handshake:", handshake);

      if (handshake.applicationType !== "gecko") {
        throw new Error(
          `Unexpected application type: ${handshake.applicationType}`,
        );
      }
    }
  }

  async sendCommand(
    name: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (!this.socket) {
      throw new Error("Not connected");
    }

    this.messageId++;
    const msg = JSON.stringify({
      id: this.messageId,
      name,
      parameters: params,
    });

    const msgWithLength = `${msg.length}:${msg}`;
    await this.socket.write(new TextEncoder().encode(msgWithLength));

    // Read response
    const buffer = new Uint8Array(65536);
    const n = await this.socket.read(buffer);
    if (!n) {
      throw new Error("Connection closed");
    }

    const response = new TextDecoder().decode(buffer.subarray(0, n));
    const colonPos = response.indexOf(":");
    if (colonPos === -1) {
      throw new Error("Invalid response format");
    }

    const responseData = JSON.parse(response.substring(colonPos + 1));

    if (responseData.error) {
      throw new Error(JSON.stringify(responseData.error));
    }

    return responseData.value;
  }

  async setContext(context: "chrome" | "content"): Promise<void> {
    await this.sendCommand("Marionette:SetContext", { value: context });
    this.context = context;
    console.log(`Context set to: ${context}`);
  }

  async executeScript(script: string, args: unknown[] = []): Promise<unknown> {
    return await this.sendCommand("WebDriver:ExecuteScript", {
      script,
      args,
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

async function captureFullscreenScreenshot(
  host: string,
  port: number,
  outputPath: string,
): Promise<void> {
  const client = new MarionetteClient(host, port);

  try {
    await client.connect();

    // Set to chrome context to access browser chrome APIs
    await client.setContext("chrome");

    console.log("Taking fullscreen screenshot...");

    // Use Firefox's screenshot API in chrome context
    const script = `
      const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
      const window = Services.wm.getMostRecentWindow("navigator:browser");
      
      if (!window) {
        return { error: "No browser window found" };
      }

      // Get the browser window dimensions
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // Create a canvas to capture the window
      const canvas = window.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext("2d");
      ctx.drawWindow(window, 0, 0, width, height, "rgb(255,255,255)");
      
      // Convert to PNG data URL
      const dataUrl = canvas.toDataURL("image/png");
      
      return {
        success: true,
        dataUrl: dataUrl,
        width: width,
        height: height
      };
    `;

    const result = await client.executeScript(script) as Record<
      string,
      unknown
    >;

    if (result.error) {
      throw new Error(result.error as string);
    }

    if (!result.success || !result.dataUrl) {
      throw new Error("Failed to capture screenshot");
    }

    console.log(`Screenshot captured: ${result.width}x${result.height}`);

    // Convert data URL to binary data
    const dataUrl = result.dataUrl as string;
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    const binaryData = Uint8Array.from(
      atob(base64Data),
      (c) => c.charCodeAt(0),
    );

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.ensureDir(outputDir);

    // Save the screenshot
    await Deno.writeFile(outputPath, binaryData);
    console.log(`Screenshot saved to: ${outputPath}`);
  } finally {
    client.disconnect();
    console.log("Disconnected from browser");
  }
}

async function main() {
  // Parse command line arguments
  const args = Deno.args;

  let host = "localhost";
  let port = 2828;
  let outputPath = "./screenshots/noraneko-fullscreen.png";

  // Simple argument parsing
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--host" && i + 1 < args.length) {
      host = args[i + 1];
      i++;
    } else if (args[i] === "--port" && i + 1 < args.length) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--output" && i + 1 < args.length) {
      outputPath = args[i + 1];
      i++;
    } else if (args[i] === "--help") {
      console.log(`
Usage: deno run --allow-net --allow-write --allow-read screenshot-example.ts [options]

Options:
  --host <host>      Marionette host (default: localhost)
  --port <port>      Marionette port (default: 2828)
  --output <path>    Output path for screenshot (default: ./screenshots/noraneko-fullscreen.png)
  --help             Show this help message

Example:
  deno run --allow-net --allow-write --allow-read screenshot-example.ts --port 2828 --output screenshot.png

Note: 
  - Noraneko must be started with Marionette enabled (--remote-debugging-port or --marionette)
  - The default Marionette port is 2828
  - This example uses the chrome context to capture the full browser window
      `);
      Deno.exit(0);
    }
  }

  // Make output path absolute
  if (!path.isAbsolute(outputPath)) {
    outputPath = path.join(Deno.cwd(), outputPath);
  }

  console.log("Noraneko Browser Screenshot Example");
  console.log("===================================");
  console.log("Marionette host:", host);
  console.log("Marionette port:", port);
  console.log("Output path:", outputPath);
  console.log();

  await captureFullscreenScreenshot(host, port, outputPath);

  console.log("\nExample completed successfully!");
}

// Run the example
if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    Deno.exit(1);
  });
}
