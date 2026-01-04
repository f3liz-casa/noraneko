# Tab Rename Feature - Testing Guide

## Overview

This feature allows users to rename tabs in the browser with custom names that persist across browser restarts.

## How to Test

### Manual Testing Steps

1. **Build the project:**

   ```bash
   deno task feles-build
   ```

2. **Right-click on any tab** in the browser to open the tab context menu

3. **Click "Rename Tab"** menu item (or localized equivalent)
   - English: "Rename Tab"
   - Japanese: "タブの名前を変更"
   - Kansai dialect: "タブの名前変えるわ"

4. **Input field appears** where the tab label was
   - The current tab name (or custom name if already renamed) appears as placeholder
   - Input is focused and text is selected

5. **Enter a custom name** and press Enter or click away (blur)
   - Tab label is updated with the custom name
   - Custom name is shown in italic with medium weight
   - Original page title is hidden

6. **Restart the browser**
   - Custom tab names should persist
   - All renamed tabs show their custom names

7. **Clear custom name** by entering empty text and pressing Enter
   - Tab reverts to showing the original page title

### Testing with mus-uc-devtools

To verify the UI elements are properly shown:

```bash
cd /tmp/mus-uc-devtools
cargo build --release

# Start Firefox with Marionette enabled
# Set marionette.port to 2828 in about:config

# Run JavaScript in chrome context to verify elements
../mus-uc-devtools/target/release/mus-uc execute \
  "console.log(document.querySelector('#context_renameTab'))"

# Check if the function is exposed
../mus-uc-devtools/target/release/mus-uc execute \
  "console.log(typeof window.gNoraShowTabRenameInput)"
```

## Features Implemented

- ✅ Context menu item "Rename Tab"
- ✅ Input box appears when rename is clicked
- ✅ Original tab name used as placeholder
- ✅ Tab names persist across browser restarts (stored in preferences)
- ✅ Tab identification using linkedPanel attribute
- ✅ Press Enter to save, Escape to cancel
- ✅ Blur event saves the name
- ✅ Empty name removes custom name
- ✅ Localization support (en-US, ja-JP, ja-JP-x-kansai)

## Architecture

### Files Created

- `browser-features/chrome/common/tab-rename/index.ts` - Main component
- `browser-features/chrome/common/tab-rename/tab-rename-manager.ts` - State management
- `browser-features/chrome/common/tab-rename/tab-rename.css` - Styling

### Files Modified

- `browser-features/chrome/utils/context-menu.tsx` - Added rename tab menu item
- `i18n/*/browser-chrome.json` - Added localization strings

### Data Storage

- Preference key: `noraneko.tabRename.data`
- Format: JSON string mapping tab IDs to rename data
- Tab identification: Uses `linkedPanel` attribute (created if missing)

## Known Limitations

1. Tab IDs are based on `linkedPanel` which is generated if not present
2. Data is stored in a single preference string (may have size limits for many tabs)
3. No UI to bulk clear all renamed tabs (would need to clear preference manually)
