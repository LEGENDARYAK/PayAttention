# PayAttention

I love music, podcasts, YouTube videos, white noise; but sometimes that stuff can overload your senses and dull your thinking. One day I found myself trying to play a game with audio, listen to music, and half-listen to a podcast, all at the same time. Something had to change, so I made this! PayAttention is a privacy-first browser extension that pauses audio and video when you leave a tab, keeping media attached to your attention instead of playing in the background.

## Install

### Chrome or Brave

1. Download [PayAttention for Chrome and Brave](release-assets/PayAttention-0.1.0-Chrome-Brave.zip) and unzip it somewhere you will keep it.
2. Open `chrome://extensions` in Chrome or `brave://extensions` in Brave. Turn on **Developer mode**, choose **Load unpacked**, and select the unzipped folder containing `manifest.json`.
3. Pin PayAttention from the Extensions menu, then click its toolbar icon to manage the current site or open settings.

This is a local install, so browser developer mode must stay enabled. Keep the unzipped folder in place while using the extension. To update, remove the old PayAttention entry from the Extensions page, unzip the new package to a stable folder, and choose **Load unpacked** again.

### Firefox

Download [the Firefox testing package](release-assets/PayAttention-0.1.0-Firefox-unsigned-temporary.zip), then open `about:debugging` → **This Firefox** → **Load Temporary Add-on** and select the ZIP file. This unsigned install is temporary: Firefox removes it when the browser restarts.

Firefox requires Mozilla to sign an extension before it can be installed permanently in the standard Firefox release. This repository does not yet contain a signed Firefox release. See Mozilla’s [temporary installation guide](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) and [self-distribution guide](https://extensionworkshop.com/documentation/publish/self-distribution/) for details.

### Using PayAttention

PayAttention starts enabled and pauses playing HTML audio and video when you switch away from a tab. Click the toolbar icon to allow a tab or site temporarily, add a permanent site rule, or adjust that site’s behavior. Open **Settings & rules** from the popup to configure automatic resume, mute fallback, per-site notifications, temporary exceptions, and the optional local activity log.

The extension requests access to all websites so it can detect media on the pages you visit. It does not send page data anywhere. See the [privacy policy](docs/PRIVACY_POLICY.md) for details.

## What it does

- Pauses playing `<audio>` and `<video>` elements whenever the document becomes hidden.
- Works inside matching iframes and open shadow roots, and re-pauses media that tries to restart while hidden.
- Optionally mutes the tab as a fallback for Web Audio, browser games, ads, and unusual players.
- Optionally resumes only media PayAttention itself paused.
- Supports permanent whole-domain, exact-hostname, and URL-pattern rules; temporary site exceptions; and tab-only exceptions.
- Provides toolbar badges, keyboard shortcuts, import/export, per-site notification controls, and an optional local activity log.
- Uses no server, account, analytics, telemetry, ads, or remote code.

## Browser support

- **Chrome:** supported using the Chromium build.
- **Brave:** use the same Chromium build and installation steps.
- **Firefox:** a temporary testing build is available; a permanently installable signed release is not yet published.

## Build from source

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

To build both browsers and copy install packages into `release-assets/`:

```bash
npm run package:release
```

Build outputs are also available under `.output/`. The Chrome/Brave directory can be loaded unpacked from `.output/chrome-mv3/`. Firefox output is unsigned and intended for temporary installation through `about:debugging`.

## Keyboard shortcuts

- `Alt+Shift+A`: toggle an exception for the current tab until it closes.
- `Alt+Shift+P`: enable or disable PayAttention globally.

Change shortcuts from the browser’s extension-shortcuts page.

## Rule precedence

1. Global disabled state
2. Tab-until-close exception
3. Temporary site exception
4. Most-specific permanent site rule
5. Default behavior

URL patterns are considered more specific than exact hostnames, and exact hostnames are more specific than whole-domain rules.

See [architecture](docs/ARCHITECTURE.md), [test plan](docs/TEST_PLAN.md), and [store listing draft](docs/STORE_LISTING_DRAFT.md) for project details.
