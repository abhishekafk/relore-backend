# re:lore

> your lore, your knowledge.

re:lore is a personal AI second-brain for short-form video content. Share Instagram reels to re:lore — they get transcribed, analyzed, and made semantically searchable.

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native + Expo (Android) |
| Backend | Node.js + Express (Render) |
| Database | Supabase Postgres + pgvector |
| AI | Google Gemini API |
| Queue | Bull + Redis |

## Project Structure

```
relore/
  backend/        Node.js + Express API
  mobile/         React Native + Expo app (Phase 4+)
```

## Getting Started — Backend

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY, REDIS_URL
```

### 3. Set up Supabase database
Run `backend/supabase_setup.sql` in your Supabase SQL Editor (Dashboard → SQL Editor → New Query).

### 4. Run locally
```bash
npm run dev
# Server: http://localhost:3000
# Health: http://localhost:3000/api/v1/health
```

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/health` | None | Health check |
| POST | `/api/v1/reels/import` | JWT | Import reel URL |
| GET | `/api/v1/reels/:id` | JWT | Get reel details |
| GET | `/api/v1/reels/status/:id` | JWT | Get processing status |
| DELETE | `/api/v1/reels/:id` | JWT | Delete reel |

## Build Phases

- [x] **Phase 1** — Backend Foundation
- [ ] **Phase 2** — AI Processing Pipeline
- [ ] **Phase 3** — Search & Clustering
- [ ] **Phase 4** — React Native App Foundation
- [ ] **Phase 5** — Core Screens
- [ ] **Phase 6** — Android Share Sheet
- [ ] **Phase 7** — AI Chat
- [ ] **Phase 8** — Animations & Polish
- [ ] **Phase 9** — Onboarding & Final QA
