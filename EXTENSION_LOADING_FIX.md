# Chrome Extension Loading Fix

## Problem

Chrome extensions were not being loaded when specified in `playwright-mcp-config.json` using the `--load-extension` argument.

## Root Cause

The issue was caused by the default configuration setting `channel: 'chrome'`, which instructs Playwright to use the system-installed Chrome browser instead of Playwright's bundled Chromium.

**Key Discovery**: Chrome extensions load correctly with Playwright's bundled Chromium, but fail to load when using the system Chrome via `channel: 'chrome'`.

## Solution

Removed `channel: 'chrome'` from the default configuration in `src/config.ts`, allowing Playwright to use its bundled Chromium by default.

### Changed File

**`src/config.ts`** (lines 56-76):
```typescript
const defaultConfig: FullConfig = {
  browser: {
    browserName: 'chromium',
    launchOptions: {
      // Note: Do not set channel by default to use Playwright's bundled Chromium
      // which works better with extensions. Users can override with 'chrome' if needed.
      // channel: 'chrome',  // <-- REMOVED THIS LINE
      headless: os.platform() === 'linux' && !process.env.DISPLAY,
      chromiumSandbox: true,
    },
    contextOptions: {
      viewport: null,
    },
  },
  // ... rest of config
};
```

## Configuration

To use Chrome extensions with Playwright MCP:

1. **Use bundled Chromium (recommended)**:
```json
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": {
      "headless": false,
      "args": [
        "--load-extension=/path/to/your/extension"
      ]
    }
  },
  "projectIsolation": true
}
```

2. **Or explicitly specify no channel**:
```json
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": {
      "channel": undefined,  // or omit this line
      "headless": false,
      "args": [
        "--load-extension=/path/to/your/extension"
      ]
    }
  }
}
```

## Important Notes

- ✅ **Works**: Playwright's bundled Chromium (default)
- ❌ **Doesn't work**: System Chrome via `channel: 'chrome'`
- The extension path should be an absolute path to the unpacked extension directory
- Extensions require `launchPersistentContext` (used automatically by Playwright MCP with `projectIsolation: true`)
- Both `--load-extension` and `--disable-extensions-except` arguments are automatically added by the extension enhancement logic

## Testing

To verify extension loading:

1. Create a test extension with visible content injection
2. Configure `playwright-mcp-config.json` with the extension path
3. Launch the browser and navigate to any page
4. The extension content should be visible

## Technical Details

The fix ensures that:
1. `enhanceLaunchOptionsWithExtensions()` correctly processes extension paths
2. Both `--disable-extensions-except` and `--load-extension` arguments are added
3. Playwright uses its bundled Chromium which properly supports extension loading
4. Extension loading works in both isolated and persistent context modes



