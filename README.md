# DevMetrics

> Real-time developer activity tracking API.

DevMetrics is a backend API that tracks developer activity via GitHub webhooks, maintains real-time leaderboards, and broadcasts live updates to connected dashboards via WebSockets.

---

## Tech Stack

- **Node.js + Express + TypeScript** — REST API
- **Socket.io** — real-time event broadcasting
- **PostgreSQL via Supabase** — persistent storage
- **Redis** — real-time leaderboards and presence tracking
- **Docker + Docker Compose** — containerized development
- **node-cron** — background job scheduling

---

## Features

- JWT authentication + API key authentication
- bcrypt password hashing
- Role-based access control (admin, developer, viewer)
- GitHub webhook integration with HMAC-SHA256 signature verification
- Real-time leaderboards using Redis sorted sets
- Live event streaming via Socket.io
- Rate limiting (global + per-route)
- Background jobs — daily stat aggregation and leaderboard cache warming

---

## Getting Started

### Prerequisites
- Node.js 18+
- Docker Desktop
- Accounts: [Supabase](https://supabase.com)

### Installation

```bash
git clone https://github.com/yourusername/devmetrics.git
cd devmetrics
npm install
```

### Environment Variables

Create a `.env` file in the root:

```env
PORT=3000
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_role_key
JWT_SECRET=your_jwt_secret
REDIS_URL=redis://localhost:6379
GITHUB_WEBHOOK_SECRET=your_webhook_secret
```

### Running Locally

```bash
# Option 1: Standard
npm run dev

# Option 2: Docker (includes Redis)
docker-compose up --build
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Register a new user, returns JWT + API key |
| `POST` | `/auth/login` | Login, returns JWT |
| `POST` | `/teams` | Create a team |
| `GET` | `/teams` | Get your teams |
| `POST` | `/teams/:id/invite` | Invite a user to a team |
| `GET` | `/teams/:id/leaderboard` | Get top developers by score |
| `GET` | `/teams/:id/activity` | Get recent events with pagination |
| `GET` | `/teams/:id/presence` | Get online users |
| `POST` | `/webhooks/github/:teamId` | Receive GitHub webhook events |
| `GET` | `/health` | Health check |

---

## How It Works

1. A developer pushes code to GitHub
2. GitHub sends a signed webhook event to `/webhooks/github/:teamId`
3. The server verifies the HMAC-SHA256 signature
4. The event is stored in Supabase and the developer's Redis leaderboard score is updated
5. Socket.io broadcasts the event to all connected dashboard clients in real time
6. A background job runs hourly to rebuild the leaderboard cache and nightly to aggregate daily stats

---

## Authentication

Two methods supported:

**Bearer Token** — for dashboard users
```
Authorization: Bearer your_jwt_token
```

**API Key** — for programmatic access
```
x-api-key: dm_live_your_api_key
```

---

## License

MIT