# MoneyMan — Multiplayer

Real-time multiplayer coin catcher game (up to 5 players). Server-authoritative via Cloudflare Workers + Durable Objects + WebSockets.

## How to Play

- **Move left**: Arrow Left / `A` / tap left side of screen
- **Move right**: Arrow Right / `D` / tap right side of screen
- Catch falling coins to earn points (+10 each)
- Compete against other players in 60-second rounds
- Highest score at the end wins!

## Architecture

- **Cloudflare Worker** serves static files and routes `/ws` to a Durable Object
- **Durable Object (`GameRoom`)** manages game state: lobby, countdown, gameplay, scoring
- **State machine**: LOBBY → COUNTDOWN (5s) → PLAYING (60s) → GAME_OVER (5s) → LOBBY
- Server ticks at 20/sec during play; clients handle input and rendering only

## Development

```bash
npm install
npm run dev
```

Open multiple browser tabs to `http://localhost:8787` to test multiplayer.

## Deployment

```bash
npm run deploy
```

Deploys the Worker + Durable Object + static assets to Cloudflare.
