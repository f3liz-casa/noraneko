# Noraneko Browser Automation Example

This example demonstrates how to use the Marionette protocol (similar to
`mus-uc-devtools`) to automate and control the Noraneko browser during
development.

## Overview

The `screenshot-example.ts` script connects to a running Noraneko browser
instance via the Marionette protocol and captures a fullscreen screenshot of the
entire browser window using Chrome context APIs.

## Prerequisites

1. Noraneko browser must be built and available
2. Deno runtime
3. Noraneko must be started with Marionette enabled

## Usage

### 1. Start Noraneko in Development Mode

First, start the Noraneko browser in development mode with Marionette enabled:

```bash
deno task feles-build dev
```

This will:

- Start the development servers
- Launch the browser with remote debugging and Marionette enabled
- The browser will listen on the default Marionette port (2828)

### 2. Run the Screenshot Example

In a separate terminal, run the example script:

```bash
cd examples/browser-automation
deno run --allow-net --allow-write --allow-read screenshot-example.ts
```

### Command Line Options

- `--host <host>`: Marionette host (default: `localhost`)
- `--port <port>`: Marionette port (default: `2828`)
- `--output <path>`: Output path for the screenshot (default:
  `./screenshots/noraneko-fullscreen.png`)
- `--help`: Show help message

### Example with Custom Options

```bash
deno run --allow-net --allow-write --allow-read screenshot-example.ts \
  --port 2828 \
  --output /tmp/my-screenshot.png
```

## What the Example Does

1. Connects to the running Noraneko browser via Marionette protocol (TCP socket)
2. Sets the context to "chrome" to access browser chrome APIs
3. Executes JavaScript in the chrome context to:
   - Get the browser window
   - Create a canvas with window dimensions
   - Draw the entire window to the canvas
   - Convert to PNG data URL
4. Saves the screenshot to the specified output path
5. Disconnects from the browser

## Understanding Marionette Protocol

The Marionette protocol is Firefox's automation protocol that allows:

- **Content Context**: Access to web page content (like WebDriver)
- **Chrome Context**: Access to browser UI and internal APIs (privileged)

This example uses the chrome context to capture the full browser window,
including UI elements like tabs, address bar, etc.

## Extending the Example

You can extend this example to:

- Load and test userChrome CSS
- Navigate to specific URLs in content context
- Interact with browser UI elements
- Execute privileged Firefox APIs (Services, ChromeUtils, etc.)
- Automate browser settings and preferences
- Monitor and test browser behavior
- Create custom browser automation workflows

## API Reference

The Marionette client in this example provides:

- `connect()`: Connect to the Marionette server
- `setContext(context)`: Switch between "chrome" and "content" contexts
- `executeScript(script, args)`: Execute JavaScript in the current context
- `sendCommand(name, params)`: Send raw Marionette commands
- `disconnect()`: Close the connection

For more details about Marionette protocol, see:

- [Firefox Marionette Protocol](https://firefox-source-docs.mozilla.org/testing/marionette/)
- [Marionette Client Documentation](https://firefox-source-docs.mozilla.org/testing/marionette/marionette/Protocol.html)

## About mus-uc-devtools

The `@f3liz/mus-uc-devtools` package provides similar functionality with
additional features:

- WASM-based CLI tool for userChrome CSS development
- MCP (Model Context Protocol) server for LLM integration
- Automated testing capabilities
- CSS injection and live reloading

This example demonstrates the core Marionette protocol concepts that
mus-uc-devtools is built upon.

## Troubleshooting

### "Connection refused" error

Make sure the Noraneko browser is running with Marionette enabled. The browser
launcher in `tools/src/browser_launcher.ts` enables Marionette by default via
the `--remote-debugging-port` flag.

### "No browser window found" error

The browser might still be starting up. Wait a moment and try again, or ensure
at least one window is open in the browser.

### Permission errors

Make sure you run the script with the necessary Deno permissions:

- `--allow-net`: For TCP connection to Marionette server
- `--allow-write`: For saving screenshots
- `--allow-read`: For reading file paths and configuration

### "Invalid response format" error

This might indicate a Marionette protocol version mismatch or connection issue.
Try restarting the browser and reconnecting.
