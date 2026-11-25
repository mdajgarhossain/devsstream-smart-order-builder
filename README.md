# Smart Order Builder

Frontend assessment for DevsStream Limited: a "Build Your Breakfast" order builder with a rules engine, shared ingredient stock, a pricing engine, reservations, checkout, and a Gemini-powered sales assistant.

There is no real backend. [MSW](https://mswjs.io) acts as the server, and its state is kept in the browser.

## Setup

```bash
npm install
cp .env.example .env.local   # then paste your Gemini key
npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app |
| `npm test` | Run all tests once |
| `npm run typecheck` | TypeScript strict check |
| `npm run build` | Production build |

_Work in progress. Architecture, trade-offs and hours spent will be filled in as the parts land._
