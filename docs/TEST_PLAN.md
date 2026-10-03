# Test Plan

## Core media

- Native HTML audio pauses after switching tabs.
- Native HTML video pauses after switching tabs.
- Multiple media elements in one document all pause.
- Media in same-origin and cross-origin iframes pauses.
- Media in an open shadow root pauses.
- Newly started media is immediately re-paused while the tab remains hidden.
- Media already paused by the user is never marked for automatic resume.

## Resume behavior

- Auto-resume off: media remains paused when returning.
- Notification Resume button resumes tracked media.
- Auto-resume on: only extension-paused media resumes.
- A removed or ended media element is not resumed.
- A site autoplay rejection does not crash the extension.

## Mute fallback

- Hidden tab is muted when fallback mode is enabled.
- Visible tab is unmuted only when PayAttention muted it.
- A user-muted tab remains muted.
- Disabling PayAttention restores extension-created mute states.

## Rules

- Whole-domain rule matches the domain and subdomains.
- Exact-hostname rule does not match sibling subdomains.
- URL-pattern rule overrides a broader domain rule.
- Tab-until-close exception overrides all site rules.
- Temporary exception expires at the expected time.
- Permanent allowlisted tabs are never paused or muted.

## UI

- Toolbar badge reflects OFF, allow, pause, mute, and pause+mute states.
- Toast appears after returning, not invisibly expiring while away.
- Toast can be disabled.
- Resume button and reason can be disabled independently.
- Import/export round-trip preserves settings and rules.
- Invalid imports are rejected.
- Activity history is absent unless enabled and can be cleared.

## Browser matrix

- Latest stable Chrome on macOS and Windows
- Latest stable Brave on macOS and Windows
- Latest stable Firefox as a secondary compatibility target
