# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

A real-time collaborative platform coordination tool for the "Artale" escape room game (Floor 6 — 羅茱踏板工具). Four players each occupy one room (甲/乙/丙/丁 = A/B/C/D) and select platforms across 10 floors. The app synchronizes all selections live via Firebase.

## Running the App

No build process. Open `index.html` directly in a browser. Firebase is loaded via CDN — an internet connection is required.

To test multi-room play, open multiple browser windows/tabs and use different room assignments.

## Architecture

Three files, no framework:
- **`index.html`** — Structure and overlays (access gate, room selector, nickname, join-session)
- **`app.js`** — All logic: Firebase sync, session management, state, UI updates
- **`style.css`** — Dark/light theming via CSS custom properties, 4-room color scheme

### Firebase Data Structure

```
/sessions/{sessionId}/
  /floors/{1-10}/{a|b|c|d}  → platform number (1-4) or null
  /rooms/{a|b|c|d}          → nickname or default room name
/access_codes/{code}         → truthy value (access gate)
```

Firebase project: `artale-rjpq-6b73d`

### Session Flow

1. Access code verified against `/access_codes/` in Firebase
2. Room selected (a/b/c/d) + optional nickname written to `/sessions/{id}/rooms/`
3. URL updated with `?s=SESSION_ID` for sharing
4. Real-time listeners on `/sessions/{id}/` drive all UI updates
5. `onDisconnect().remove()` cleans up the room entry automatically

### State Model

- `gameState[floor][room]` — platform choice per floor per room (1–4 or null)
- `occupiedRooms[room]` — which rooms are currently joined
- `myRoom` — current player's room assignment (a/b/c/d)
- localStorage persists: access code, session ID, room, nickname, theme

### UI Behavior

- Player's own room: interactive buttons to pick platform 1–4
- Other rooms: read-only display of their chosen platforms
- Green = correct/available, red/strikethrough = conflict (same platform chosen by another room)
- Sticky sequence bar at top shows your room's platform picks for floors 1–10
