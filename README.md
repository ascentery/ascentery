# Ascentery Client

The thin client for Ascentery, the MUD. (The seeded starter town is named Thornmere.) React + Vite + supabase-js.
Design language: **illuminated terminal** — Cormorant Garamond room
titles over an IBM Plex Mono log, ink-blue night palette with
candle-amber accents. The signature element is the procedural SVG
room banner (`src/lib/svgScene.js`): every room's environmental tags
+ id deterministically paint its scene.

## Setup

```
cp .env.example .env        # fill in your Supabase URL + anon key
npm install
npm run dev
```

Requires the backend bundle (migrations 001–009 + edge functions)
deployed first, and Realtime enabled for `room_actions`,
`fight_events`, and `direct_messages`:

```sql
alter publication supabase_realtime add table room_actions, fight_events, direct_messages;
```

## How it talks to the backend

- **Reads:** `get_room_view` RPC (banner, occupants sorted
  friends → acquaintances → strangers, paginated), plus direct
  selects allowed by RLS (inventory, who, friends).
- **Writes:** only through the 007 RPCs via `src/lib/parser.js` —
  the client never mutates game tables.
- **Live updates:** Realtime `postgres_changes` on `room_actions`
  (filtered by current room), `fight_events` (combat ticks), and
  `direct_messages` (tells + DMs on the user's own rows).
- **AI:** `talk to <mob>` invokes the `ai-proxy` edge function with
  the mob's personality + recent room history; falls back to the
  mob's pre-written lines (and surfaces the why) when AI is
  unavailable.

## Command set

look · n/s/e/w/up/down · say (') · emote (:) · tell · who · sit ·
stand · rest · attack · consider · flee · rescue · cast heal ·
drink · wield · wear · remove · inventory · talk to · ignore · help

## Not yet wired (clean extension points)

- Friend request UI (tap an occupant chip → "Add Friend"); the
  `friendships` RLS policies already support it.
- Settings screen: AI key entry → `test-ai-key` function; profile
  editing; password/email changes.
- Admin panel.
- `cached_svg` from the world builder is already preferred over the
  procedural banner when present (`Game.jsx`).
