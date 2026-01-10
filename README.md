# Happy Hotels SKO 2027

Demo-ready monorepo with a hotel booking API, MCP tools, and a ChatGPT-powered concierge UI.

## Quick Start

```bash
pnpm install
```

If `pnpm` is not available or corepack cannot download it (proxy restrictions), install pnpm manually:

```bash
npm install -g pnpm
pnpm install
```

Create your environment file at the repo root:

```bash
cp .env.example .env
```

Copy API-specific settings for Prisma:

```bash
cp packages/api/.env.example packages/api/.env
```

For the web app, ensure `OPENAI_API_KEY` is available in `apps/web/.env.local` (copy from root if desired).

### API (Express + Prisma + SQLite)

```bash
cd packages/api
pnpm prisma generate
pnpm prisma migrate dev --name init
pnpm dev
```

### MCP Server

```bash
cd packages/mcp
pnpm dev
```

### Web App (Next.js)

```bash
cd apps/web
pnpm dev
```

The web app expects the API on `http://localhost:4000/api/v1` and uses `OPENAI_API_KEY` for chat.

## Test the demo flow

1. Start the API and web app (see commands above).
2. In the web UI, ask for a booking (e.g., “Book a Resort Hotel in August 2027 for 2 adults, 1 child.”).
3. Provide any missing fields the assistant requests.
4. Say **confirm** to create the booking and watch the Booking Confirmation card update.

## Scripts (root)

```bash
pnpm dev
```

Starts the API and web app concurrently for the live demo.
