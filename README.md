# Chat Heist

**Your chat. One impossible heist. One chance to rewind time.**

A new, browser-based cooperative Twitch game built with Codex for the 2026 Codex x TwitchCon Hackathon. Viewers vote on three stages of an orbital heist. Each move changes loot and security heat. After an outcome, a majority of the previous round's participants can type `!rewind` to restore the exact pre-decision state once per run.

## Run locally

Requires Node.js 22 or later. No package installation or build required.

```sh
npm start
```

Open `http://localhost:4178/`. The server listens on loopback only. Run `npm test` and `npm run check` to verify the engine and syntax.

## Practice

Click **Launch the heist**, choose a rehearsal crew member, then click a move. Select another crew member to test multiplayer votes. **Lock votes** ends a round immediately; otherwise it lasts 30 seconds. No votes pauses the round instead of inventing a winner. Your latest vote replaces your earlier vote. Ties choose the leftmost option, as displayed in the console.

Try `blast → overload`, rewind, then `cloak → drift`: the rewind restores the 36,000-credit pre-vault balance and heat 48, and the new route escapes with 46,000 credits at heat 20. All credits are fictional game scores and have no monetary value.

## Twitch setup

1. Enable two-factor authentication for the broadcaster account. Twitch requires it to register an app.
2. Register a **public** application at https://dev.twitch.tv/console/apps, category Game Integration.
3. Add `http://localhost:4178/` as an exact OAuth redirect. If hosting, also add the exact HTTPS origin plus trailing slash.
4. Open **Connect Twitch**, enter the application's public client ID, and authorize `user:read:chat` as the broadcaster.
5. Viewers send the commands shown in the game in that broadcaster's Twitch chat. The broadcaster may participate too. After a round, previous voters may send `!rewind`.

The app validates the token with Twitch, subscribes to `channel.chat.message` through EventSub WebSockets, deduplicates event IDs, monitors keepalives, handles server-directed reconnects, and pauses on connection loss or revocation. No chat messages are sent by the app. Tokens are memory-only and must be authorized again after reload. OAuth CSRF state has a ten-minute lifetime and is single-use. The game must remain open and foregrounded for accurate browser timers.

## Stream / record

Use **Stream view** and capture this Chrome window in OBS. The game is the captured content. Do not capture the connection dialog, authorization pages, browser developer tools, or account settings. This release does not have an independently synchronized OBS Browser Source URL. Use the compact stream controls or keyboard shortcuts: Enter = next/start, P = pause/resume, L = lock votes, R = rewind. Shortcuts do not act while a form or dialog is focused.

## Architecture

- `dist/engine.js`: deterministic state machine; no DOM or network.
- `dist/twitch.js`: Twitch-only transport, authorization validation, delivery deduplication.
- `dist/app.js`: controller, safe text rendering, original canvas scene.
- `dist/style.css`: responsive design and reduced-motion support.
- `tests/`: rule and integration-boundary tests using the Node built-in test runner.

## Assets and privacy

Orbital artwork is original procedural Canvas drawing; there are no stock illustrations, logos, video, or music. Google Fonts serves Barlow Condensed and DM Sans; system sans-serif fallbacks remain usable offline. The application stores only a short-lived OAuth nonce and public client ID in session storage during login. Chat display is bounded to the most recent 30 accepted game messages and disappears on reload; it is not uploaded to an application server. Twitch receives normal API and WebSocket traffic. Google Fonts receives browser requests for fonts.

## Evidence status

Local rules and browser interaction are testable without Twitch. A passing local suite does **not** prove live EventSub delivery, a Twitch broadcast, YouTube publication, or a completed Devpost entry. Track those separately in `docs/DELIVERY.md`.
