# Quest Panel

A minimal Chrome Manifest V3 extension with a React side panel. Clicking the toolbar icon opens the panel, which currently shows a greeting, today's date, a Today section, and a quiet footer. OAuth and external API connections are not configured.

The extension uses Vite with CRXJS. CRXJS is a lightweight Vite plugin that handles the MV3 manifest and extension entry points directly, so this starter does not need a larger extension framework.

## Requirements

- Node.js 20 or later
- npm
- Google Chrome

## Build

From the repository root, run:

```sh
npm install
npm run build
```

The production extension is written to `dist/`.

## Load unpacked in Chrome

1. Build the extension using the commands above.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** using the switch in the upper-right corner.
4. Select **Load unpacked**.
5. Choose this repository's `dist/` directory.
6. Click the Quest Panel toolbar icon. Chrome opens the side panel.

After changing the code, run `npm run build` again. On `chrome://extensions`, use the extension's **Reload** button to load the updated build.
