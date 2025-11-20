# Noraneko Browser Automation Examples

This directory contains examples demonstrating browser automation using `mus-uc-devtools` with the Noraneko browser.

## Prerequisites

1. Noraneko browser must be built and available in `_dist/bin/`
2. Deno runtime installed
3. The `@f3liz/mus-uc-devtools` package (already configured in deno.json)

## Examples

### 1. Basic Screenshot Example

**File:** `screenshot-example.ts`

Demonstrates:
- Launching Noraneko with Marionette automation enabled
- Waiting for the browser to be fully loaded
- Taking a screenshot using the Marionette protocol
- Saving the screenshot to the `screenshots/` directory

**Usage:**
```bash
deno run -A examples/browser-automation/screenshot-example.ts
```

### 2. Advanced Screenshot Example

**File:** `advanced-screenshot-example.ts`

Demonstrates:
- Using `mus-uc-devtools` integration for browser control
- Enhanced Marionette protocol handling
- Better error handling and status reporting
- Capturing larger screenshots with chunked reading

**Usage:**
```bash
deno run -A examples/browser-automation/advanced-screenshot-example.ts
```

## How It Works

### Browser Launch

The examples use an enhanced browser launcher (`browser_launcher_with_automation.ts`) that:
1. Starts Noraneko with the `--marionette` flag enabled
2. Configures the Marionette port (default: 2828)
3. Provides an `onReady` callback when the browser is fully initialized
4. Supports both headed and headless modes

### Marionette Protocol

Firefox's Marionette protocol is used for browser automation:
- Text-based protocol over TCP
- Commands are sent as JSON arrays: `[message_type, message_id, command, params]`
- Responses include command results (like screenshot data in base64 format)

### Screenshot Capture

The examples demonstrate:
1. Connecting to the Marionette server
2. Creating a new WebDriver session
3. Executing the `WebDriver:TakeScreenshot` command
4. Receiving and decoding base64 screenshot data
5. Saving to a PNG file in the `screenshots/` directory

## Configuration Options

### LaunchOptions

```typescript
interface LaunchOptions {
  port?: number;              // WebDriver BiDi port (default: 5180)
  marionettePort?: number;    // Marionette port (default: 2828)
  headless?: boolean;         // Run in headless mode (default: false)
  onReady?: (wsUrl: string, marionettePort: number) => void | Promise<void>;
}
```

## Output

Screenshots are saved to the `screenshots/` directory in the project root with timestamps:
- Format: `noraneko-YYYY-MM-DDTHH-MM-SS-mmmZ.png`
- Example: `noraneko-2025-11-20T05-30-15-123Z.png`

## Troubleshooting

### Browser doesn't start
- Ensure the browser is built: `deno task feles-build dev`
- Check that `_dist/bin/noraneko/noraneko-bin` exists (Linux)

### Marionette connection fails
- Wait a few seconds for the browser to fully start
- Check that port 2828 is not already in use
- Look for "Marionette" in the browser console output

### Screenshot is empty or black
- Increase the wait time before taking the screenshot
- Ensure the browser window is visible (not minimized)
- Try navigating to a specific URL before capturing

## Integration with mus-uc-devtools

The `@f3liz/mus-uc-devtools` package provides:
- CSS Manager for dynamic style injection
- Marionette client with enhanced features
- WebAssembly-based performance optimizations

For full documentation, see: https://jsr.io/@f3liz/mus-uc-devtools

## License

MPL-2.0 (same as Noraneko Browser)
