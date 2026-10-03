# PayAttention

PayAttention is a privacy-first browser extension that pauses audio and video when you leave a tab. Its purpose is behavioral, not merely technical: media should stay attached to your attention instead of becoming automatic background noise.

## What the MVP does

- Pauses playing `<audio>` and `<video>` elements whenever the document becomes hidden.
- Works inside matching iframes and open shadow roots.
- Re-pauses media that attempts to restart while the tab remains hidden.
- Optionally mutes the entire browser tab as a fallback for Web Audio, browser games, ads, and unusual players.
- Optionally resumes only media that PayAttention itself paused.
- Supports permanent whole-domain, exact-hostname, and URL-pattern rules. The popup’s quick permanent allowance applies to the exact current hostname.
- Supports temporary site exceptions for 1, 5, 15, 30, or 60 minutes, plus a custom duration.
- Supports a tab-only exception that lasts until the tab closes.
- Shows an optional in-page notification with a pause reason and Resume button.
- Provides toolbar badges, keyboard shortcuts, import/export, and an optional local activity log.
- Does not use a server, account, analytics, telemetry, ads, or remote code.

## Browser support

- **Google Chrome:** primary target.
- **Brave:** uses the same Chromium build.
- **Firefox:** the project builds from the same source, but Firefox remains a secondary test target for the initial release.

## Development

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

WXT opens a development browser with the extension installed. To build production packages:

```bash
npm run build
npm run zip
npm run build:firefox
npm run zip:firefox
```

The Chromium unpacked build is written to `.output/chrome-mv3/` and the release ZIP is written under `.output/`.

## Manual installation

### Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select `.output/chrome-mv3/`.

### Brave

1. Open `brave://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select `.output/chrome-mv3/`.

## Keyboard commands

- `Alt+Shift+A`: toggle an exception for the current tab until it closes.
- `Alt+Shift+P`: enable or disable PayAttention globally.

Users can change these shortcuts from the browser’s extension-shortcuts page.

## Rule precedence

1. Global disabled state
2. Tab-until-close exception
3. Temporary site exception
4. Most-specific permanent site rule
5. Default behavior

URL patterns are considered more specific than exact hostnames, and exact hostnames are more specific than whole-domain rules.

## Permission rationale

- `storage`: stores settings, rules, temporary exception expiration times, and the optional activity log locally.
- `tabs`: reads the active tab, updates the toolbar badge, and optionally changes the tab mute state.
- `<all_urls>` host access: required to detect and pause media on pages the user visits. PayAttention does not read or transmit page text.

See `docs/PRIVACY_POLICY.md`, `docs/ARCHITECTURE.md`, and `docs/TEST_PLAN.md` for release documentation.
