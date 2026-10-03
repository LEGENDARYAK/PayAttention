# Architecture

## Components

### Content script

The content script runs at `document_start` in all matching frames. It:

- Watches `document.visibilityState`.
- Finds playing `<audio>` and `<video>` elements in the document and open shadow roots.
- Pauses media when the document becomes hidden.
- Tracks only the media elements it paused.
- Optionally resumes those tracked elements when the document becomes visible.
- Re-pauses media that fires a `play` event while hidden.
- Renders the isolated in-page toast in the top frame.

### Background service worker

The Manifest V3 service worker:

- Resolves rule precedence.
- Handles tab-level muting and restores only mute states created by PayAttention.
- Stores tab-only exceptions in `storage.session`.
- Aggregates pause events from multiple frames into one notification.
- Updates toolbar badges.
- Handles keyboard commands.
- Maintains the optional activity log.

### Popup

The toolbar popup provides:

- Global enable/disable
- Current-tab status
- Tab-until-close exception
- Timed site exception
- Permanent exact-site allowance
- Exact-site behavior override

### Options page

The options page provides all settings, permanent rules, temporary exceptions, optional activity history, shortcut access, and JSON import/export.

## Privacy boundaries

Content scripts do not directly access local extension storage. The background service worker restricts `storage.local` to trusted extension contexts when the browser supports `setAccessLevel`. Content scripts request only the resolved behavior policy.

## Known limitations

- Browser-internal pages and other extensions cannot be controlled.
- Closed shadow roots cannot be inspected; optional tab muting covers their audible output but cannot pause their internal timeline.
- DRM or unusual player implementations may resist programmatic pausing; the mute fallback still silences the tab.
- Resuming media may occasionally be blocked by a site or browser autoplay policy.
- File URLs require the user to enable file access for the extension.
