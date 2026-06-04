<div align="center">
  <img src="frontend/public/logo.svg" alt="TraceBull Logo" width="100" style="margin-bottom: 12px;" />

  # TraceBull

  **Log collection, search and tracing for developers**

  Self-hosted · Modern UI · Multi-project · Role-based access

  [![CI](https://github.com/tracebull/TraceBull/actions/workflows/ci-release.yml/badge.svg)](https://github.com/tracebull/TraceBull/actions/workflows/ci-release.yml)
  [![Docker Image](https://ghcr-badge.egpl.dev/tracebull/tracebull/latest_tag?trim=major&label=ghcr.io)](https://github.com/tracebull/TraceBull/pkgs/container/tracebull)
  [![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
</div>

---

## Features

- **Easy Deployment** — Single `docker compose up -d`, everything included
- **Powerful Log Search** — Filter by fields, operators, and time ranges with a visual query builder
- **Multi-Project** — Isolated log spaces per project with separate API keys
- **Multi-User** — Role-based access control (Admin / Member) with project-level permissions
- **Multi-Language** — Send logs from Python, Go, Java, Node.js and more via HTTP API
- **Realtime Streaming** — Live log tail with SSE, no polling
- **API Keys & Security** — Per-project keys with optional domain and IP restrictions
- **Audit Logging** — Complete trail of all user and admin actions
- **OAuth Support** — GitHub and Google login (optional, cloud mode)
- **Modern UI** — React 19 + shadcn/ui with light/dark theme, built with Tailwind CSS 4

---

## Quick Start

### Option 1 — Pre-built image (recommended)

```bash
curl -O https://raw.githubusercontent.com/tracebull/TraceBull/main/docs/docker-compose.yml
curl -O https://raw.githubusercontent.com/tracebull/TraceBull/main/.env.example
cp .env.example .env

docker compose up -d
```

Pulls `ghcr.io/tracebull/tracebull:latest` with PostgreSQL 17, VictoriaLogs, and Valkey 8.0. Data persists in named Docker volumes.

Access the app at **http://localhost:4005**. On first load you'll be prompted to set the admin password.

To pin a version, edit the image tag in `docker-compose.yml` (e.g. `ghcr.io/tracebull/tracebull:v1.0.0`).

### Option 2 — Build from source

```bash
git clone https://github.com/tracebull/TraceBull.git
cd TraceBull

cp .env.example .env
docker compose up -d --build
```

Builds the Docker image locally from source. Same stack — PostgreSQL, VictoriaLogs, Valkey.

---

## Sending Logs

Open **Search → How to send logs from code?** in the app for ready-to-copy snippets in Python, Go, Java, cURL, and more.

```bash
curl -X POST http://localhost:4005/api/v1/logs/ingest/{projectId} \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{
    "logs": [
      {
        "level": "INFO",
        "message": "User signed in",
        "fields": { "userId": "abc123", "ip": "1.2.3.4" }
      }
    ]
  }'
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, shadcn/ui, Tailwind CSS 4, Vite |
| Backend | Go 1.24, Gin, GORM |
| Database | PostgreSQL 17 |
| Log Storage | VictoriaLogs |
| Cache | Valkey 8.0 (Redis-compatible) |
| Infra | Docker, multi-stage build, linux/amd64 + linux/arm64 |

---

## Project Structure

```
├── backend/
│   ├── cmd/main.go              # Entry point
│   ├── internal/
│   │   ├── config/              # Environment config
│   │   ├── features/            # Feature modules (users, projects, logs, etc.)
│   │   ├── storage/             # DB connection (GORM)
│   │   ├── cache/               # Valkey cache
│   │   └── util/                # Shared utilities
│   ├── migrations/              # SQL migrations (Goose)
│   └── swagger/                 # Auto-generated Swagger docs
├── frontend/
│   └── src/
│       ├── entity/              # API layer + models
│       ├── features/            # Feature components
│       ├── widgets/             # Composite components
│       ├── shared/              # Shared utilities and hooks
│       └── components/ui/       # shadcn/ui components
├── Dockerfile                   # Multi-stage build (published to ghcr.io)
├── docker-compose.yml           # Build from source
└── docs/
    └── docker-compose.yml       # Deploy from ghcr.io image
```

---

## Development

```bash
# Backend
cd backend
make run          # Run server (hot-reload with air)
make test         # Run tests
make lint         # golangci-lint

# Frontend
cd frontend
npm run dev       # Vite dev server with HMR
npm run build     # TypeScript check + production build
npm run lint      # ESLint
```

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TRACEBULL_PORT` | `4005` | Port the app listens on |
| `POSTGRES_DB` | `tracebull` | PostgreSQL database name |
| `POSTGRES_USER` | `postgres` | PostgreSQL user |
| `POSTGRES_PASSWORD` | `tracebull` | PostgreSQL password — **change in production** |
| `VICTORIALOGS_URL` | `http://victorialogs` | VictoriaLogs base URL |
| `VICTORIALOGS_PORT` | `9428` | VictoriaLogs port |
| `VALKEY_HOST` | `valkey` | Valkey hostname |
| `VALKEY_PORT` | `6379` | Valkey port |
| `IS_CLOUD` | `false` | Enables OAuth login |
| `GITHUB_CLIENT_ID` | — | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | — | GitHub OAuth app client secret |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret |

---

## Credits

TraceBull is built on top of [LogBull](https://github.com/logbull/logbull), created by [Rostislav Dugin](https://github.com/rostislav-dugin).

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
