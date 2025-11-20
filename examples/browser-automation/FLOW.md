# Browser Automation Flow

## How the Screenshot Example Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    Screenshot Example Flow                       │
└─────────────────────────────────────────────────────────────────┘

1. START
   │
   ▼
2. Launch Noraneko Browser
   ├─ Command: noraneko-bin --marionette -marionette-port 2828
   ├─ WebDriver BiDi on port 5180
   └─ Marionette on port 2828
   │
   ▼
3. Wait for Browser Ready
   ├─ Monitor stderr for "WebDriver BiDi listening on ws://..."
   ├─ Monitor stderr for "Marionette" ready signal
   └─ Trigger onReady() callback
   │
   ▼
4. Wait for Full Page Load (3 seconds)
   │
   ▼
5. Connect to Marionette (TCP localhost:2828)
   │
   ▼
6. Create WebDriver Session
   ├─ Send: [0, 1, "WebDriver:NewSession", {capabilities: {}}]
   └─ Receive: Session ID
   │
   ▼
7. Take Screenshot
   ├─ Send: [0, 2, "WebDriver:TakeScreenshot", {}]
   └─ Receive: Base64 encoded PNG data
   │
   ▼
8. Save Screenshot
   ├─ Decode base64 to binary
   ├─ Create screenshots/ directory
   └─ Save as: noraneko-YYYY-MM-DDTHH-MM-SS-mmmZ.png
   │
   ▼
9. SUCCESS
   ├─ Screenshot saved
   └─ Browser keeps running (Ctrl+C to close)
```

## File Structure

```
noraneko/
├── examples/
│   └── browser-automation/
│       ├── README.md                          # Documentation
│       ├── screenshot-example.ts               # Basic example
│       └── advanced-screenshot-example.ts      # Advanced example
├── tools/
│   └── src/
│       ├── browser_launcher.ts                 # Original launcher
│       └── browser_launcher_with_automation.ts # Enhanced launcher
├── screenshots/                                # Output directory
│   └── noraneko-*.png                         # Generated screenshots
└── deno.json                                   # Includes @f3liz/mus-uc-devtools
```

## Key Components

### 1. Enhanced Browser Launcher
- **File**: `tools/src/browser_launcher_with_automation.ts`
- **Purpose**: Launch browser with Marionette automation enabled
- **Features**:
  - Configurable ports
  - Headless mode support
  - Ready callback for automation tasks

### 2. Marionette Protocol
- **Protocol**: Text-based JSON over TCP
- **Port**: 2828 (default)
- **Commands Format**: `length:json`
- **Example**: `45:[0,1,"WebDriver:NewSession",{"capabilities":{}}]`

### 3. Screenshot Capture
- **Command**: `WebDriver:TakeScreenshot`
- **Response**: JSON with base64 PNG data
- **Format**: `{value: "iVBORw0KGgoAAAANSUhEUgAA..."}`
- **Output**: PNG file in screenshots/ directory

## Usage Examples

### Basic Usage
```bash
deno run -A examples/browser-automation/screenshot-example.ts
```

### With Headless Mode
Modify the example to set `headless: true`:
```typescript
await runWithAutomation({
  marionettePort: 2828,
  headless: true,  // Run without UI
  onReady: async (wsUrl, port) => {
    // Your automation code
  },
});
```

### Custom Port
```typescript
await runWithAutomation({
  marionettePort: 3333,  // Use different port
  onReady: async (wsUrl, port) => {
    await takeScreenshot(port);
  },
});
```

## Integration with mus-uc-devtools

The `@f3liz/mus-uc-devtools` package provides:
- **CSS Manager**: Dynamic style injection into Firefox
- **Marionette Client**: Enhanced automation capabilities
- **WASM Module**: Performance-optimized operations

While the examples use raw Marionette protocol for simplicity and reliability, 
the mus-uc-devtools package can be used for more advanced automation scenarios.
