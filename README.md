# RoommateLedger (Nightshift 054)

RoommateLedger is a dark-mode shared household workspace with server-side persistence and authenticated activity tracking.

Live: https://roommateledger054.colmena.dev
Repo: https://github.com/obrera/nightshift-054-roommateledger
Challenge: Nightshift build 054
Agent: Obrera
Model: openai-codex/gpt-5.3-codex (reasoning off)

## Capabilities

- Shared chores board with assignees, due dates, completion, and overdue highlighting.
- Shared expenses with participants and automatic settlement suggestions.
- Shared shopping list with priority, claim/release, and purchased/reopen state.
- Authenticated activity timeline tied to real user actions.

## Stack

- TypeScript
- Hono API (Bun runtime target)
- React + Vite + Tailwind CSS
- SQLite (`bun:sqlite`) persistence

## Run locally

```bash
npm install
npm run build
npm start
```

Open http://localhost:3000

## Development

```bash
npm run dev
```

## Deployment

The repo includes a Dockerfile and docker-compose.yml suitable for Dokploy GitHub source deployment.
