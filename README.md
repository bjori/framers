# Greenbrook Framers

Tennis team management platform for the Greenbrook Framers community.

## Features

- **USTA Team Management**: Roster, match schedule, RSVP, lineup optimizer
- **Internal Tournaments**: Round-robin singles & doubles, parallel tournaments
- **Unified Login**: One account across all teams and tournaments
- **ELO Ratings**: Singles and doubles ratings from all match results
- **Lineup Optimizer**: Constraint-based algorithm for best USTA lineups

## Tech Stack

- Next.js 15 (App Router, TypeScript)
- Tailwind CSS (mobile-first)
- Cloudflare Pages + D1 + KV + Workers
- Magic-link auth via Resend

## Development

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run deploy
```
