# Quest Panel

A Chrome Manifest V3 extension with a React side panel for a focused view of Google Tasks and today's primary Google Calendar events. Google sign-in uses `chrome.identity.getAuthToken`; access tokens remain in Chrome's identity cache and are not written to extension storage. The first connection happens only after the user presses **Sign in**.

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

## Tests

Run the pure progress module's unit tests with:

```sh
npm test
```

## Load unpacked in Chrome

1. Build the extension using the commands above.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** using the switch in the upper-right corner.
4. Select **Load unpacked**.
5. Choose this repository's `dist/` directory.
6. Click the Quest Panel toolbar icon. Chrome opens the side panel.

After changing the code, run `npm run build` again. On `chrome://extensions`, use the extension's **Reload** button to load the updated build.

## Google Cloud Console setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project or select one for Quest Panel.
2. Open **APIs & Services → Library**. Find and enable **Google Calendar API** and **Google Tasks API**.
3. Open **Google Auth Platform** (or **APIs & Services → OAuth consent screen**, depending on the console layout). Configure the app name and support/developer email. Choose **External** as the audience if prompted, keep the publishing status in **Testing**, and add your Google account under **Test users**. Save the changes.
4. Open **Google Auth Platform → Clients** (or **APIs & Services → Credentials → Create credentials → OAuth client ID**). Choose **Chrome Extension** as the application type.
5. Get the extension ID: build once with `npm run build`, load `dist/` at `chrome://extensions` if it is not loaded yet, then copy the ID shown on the Quest Panel card. Use that ID as the Chrome Extension client's **Item ID** in Cloud Console and create the client.
6. Copy the new OAuth client ID (it ends in `.apps.googleusercontent.com`). In the repository root `manifest.json`, replace the value of `oauth2.client_id`:

   ```json
   "oauth2": {
     "client_id": "YOUR_EXTENSION_OAUTH_CLIENT_ID.apps.googleusercontent.com",
     "scopes": [
       "https://www.googleapis.com/auth/tasks",
       "https://www.googleapis.com/auth/calendar.readonly"
     ]
   }
   ```

   Keep the two scopes as shown. The manifest is the source copied into `dist/` during each build.
7. Run `npm run build` again. At `chrome://extensions`, reload Quest Panel. Open its side panel and press **Sign in**; approve the Tasks and Calendar access prompt. The panel then shows the task, list, and event counts.

The extension also declares `https://www.googleapis.com/*` and `https://tasks.googleapis.com/*` as host permissions so its side panel can call the Google APIs. For this OAuth approach, use a **Chrome Extension** OAuth client tied to the extension ID; no client secret, redirect URI, or `launchWebAuthFlow` setup is needed. While the consent screen is in Testing, only listed test users can authorize the app.
