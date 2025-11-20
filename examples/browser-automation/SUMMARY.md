# Browser Automation with mus-uc-devtools

## Summary

This change replaces `puppeteer-core` with `@f3liz/mus-uc-devtools` in package.json and provides a comprehensive example demonstrating browser automation using the Marionette protocol.

## Changes Made

### 1. Package Dependencies
- **Removed**: `puppeteer-core@^24.27.0`
- **Added**: `@f3liz/mus-uc-devtools@npm:@jsr/f3liz__mus-uc-devtools@^0.1.0`

The mus-uc-devtools package provides:
- WASM-based tooling for userChrome CSS development
- Marionette protocol integration
- MCP (Model Context Protocol) server for LLM integration
- Browser automation capabilities

### 2. Browser Launcher Enhancement
- Added `--marionette` flag to explicitly enable the Marionette protocol
- The browser now starts with both WebDriver BiDi and Marionette protocols enabled
- Default Marionette port: 2828

### 3. Example Implementation

#### Location
`examples/browser-automation/`

#### Files Created

**screenshot-example.ts**
- Implements a complete Marionette client in TypeScript
- Connects to running Noraneko browser via TCP socket
- Uses Chrome context for privileged browser API access
- Captures fullscreen screenshot of browser window
- Saves screenshot as PNG file

**README.md**
- Comprehensive documentation for the example
- Usage instructions and command-line options
- Explanation of Marionette protocol and contexts
- Troubleshooting guide
- Extension ideas for developers

## Technical Details

### Marionette Protocol

The Marionette protocol is Firefox's native automation protocol that provides two contexts:

1. **Content Context**: Access to web page content (similar to WebDriver)
2. **Chrome Context**: Access to browser UI and internal APIs (privileged)

The example uses the Chrome context to:
- Access browser window via `Services.wm.getMostRecentWindow()`
- Use `ChromeUtils` for importing Firefox modules
- Execute privileged JavaScript to capture the browser window
- Use canvas drawing APIs to capture the full window

### Implementation Highlights

```typescript
class MarionetteClient {
  // TCP socket connection to Marionette server
  private socket: Deno.TcpConn | null = null;
  
  // Connect to Marionette
  async connect(): Promise<void> {
    this.socket = await Deno.connect({
      hostname: this.host,
      port: this.port,
    });
    // Handle handshake...
  }
  
  // Send Marionette commands
  async sendCommand(name: string, params: Record<string, unknown> = {}): Promise<unknown> {
    // Format: "length:json_message"
    const msg = JSON.stringify({ id: this.messageId, name, parameters: params });
    const msgWithLength = `${msg.length}:${msg}`;
    // Send and receive response...
  }
  
  // Execute JavaScript in current context
  async executeScript(script: string, args: unknown[] = []): Promise<unknown> {
    return await this.sendCommand("WebDriver:ExecuteScript", { script, args });
  }
}
```

### Screenshot Capture Process

1. Connect to Marionette server on port 2828
2. Set context to "chrome" for privileged access
3. Execute JavaScript that:
   - Gets the most recent browser window
   - Creates a canvas with window dimensions
   - Uses `ctx.drawWindow()` to capture the window
   - Converts canvas to PNG data URL
4. Decode base64 data URL to binary
5. Save as PNG file

## Usage

### Starting the Browser

```bash
deno task feles-build dev
```

This starts Noraneko with:
- Development servers running
- Remote debugging enabled
- Marionette protocol enabled on port 2828

### Running the Example

```bash
cd examples/browser-automation
deno run --allow-net --allow-write --allow-read screenshot-example.ts
```

### Command-Line Options

```bash
--host <host>      Marionette host (default: localhost)
--port <port>      Marionette port (default: 2828)
--output <path>    Screenshot output path (default: ./screenshots/noraneko-fullscreen.png)
--help             Show help message
```

## Benefits

1. **No Puppeteer Dependency**: Removes heavy Chromium-based automation dependency
2. **Native Firefox Protocol**: Uses Firefox's native Marionette protocol
3. **Chrome Context Access**: Full access to browser internals and UI
4. **Educational Value**: Demonstrates how to implement Marionette client from scratch
5. **Extensibility**: Foundation for more advanced browser automation
6. **Developer Tooling**: Supports userChrome CSS development workflow

## Future Extensions

The example can be extended to:
- Load and inject userChrome CSS dynamically
- Automate browser settings and preferences
- Test browser UI components
- Monitor browser performance
- Create automated testing workflows
- Integrate with CI/CD pipelines
- Capture specific UI elements
- Navigate and interact with web content

## Security

- CodeQL security scan passed with 0 alerts
- No security vulnerabilities introduced
- Proper error handling and resource cleanup
- TCP socket properly closed after use
- Base64 decoding uses standard browser APIs

## Compatibility

- **Runtime**: Deno (uses Deno TCP APIs)
- **Browser**: Firefox-based (Noraneko, Firefox, etc.)
- **Protocol**: Marionette (Firefox native)
- **Contexts**: Chrome (browser UI) and Content (web pages)

## Documentation References

- [Firefox Marionette Protocol](https://firefox-source-docs.mozilla.org/testing/marionette/)
- [Marionette Protocol Specification](https://firefox-source-docs.mozilla.org/testing/marionette/marionette/Protocol.html)
- [mus-uc-devtools on JSR](https://jsr.io/@f3liz/mus-uc-devtools)

## Testing

The example has been:
- ✅ Linted with `deno lint` (no issues)
- ✅ Formatted with `deno fmt`
- ✅ Checked with CodeQL (0 alerts)
- ✅ Syntax validated

To test manually:
1. Start Noraneko with `deno task feles-build dev`
2. Wait for browser to fully start
3. Run the example in a separate terminal
4. Check the generated screenshot in `./screenshots/` directory

## Notes

- The `@f3liz/mus-uc-devtools` package is added to package.json but not directly imported in the example
- The example implements its own Marionette client to demonstrate the protocol
- This approach provides learning value and reduces external dependencies
- The mus-uc-devtools package itself provides additional features like WASM tooling and MCP server
