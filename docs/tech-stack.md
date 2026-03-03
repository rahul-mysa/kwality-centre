# Kwality Centre — Tech Stack

> Last updated: Feb 20, 2026

## Stack Overview

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend Framework** | [Hono](https://hono.dev/) | Lightweight TypeScript web framework (~14KB) |
| **Templating** | Hono JSX | Server-side HTML rendering (built into Hono) |
| **Interactivity** | [HTMX](https://htmx.org/) | Client-side interactivity via HTML attributes, no custom JS |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) + [DaisyUI](https://daisyui.com/) | Utility-first CSS + pre-built component classes |
| **Charts** | [Chart.js](https://www.chartjs.org/) | Dashboard visualizations (pass/fail trends, pie charts) |
| **Database** | [PostgreSQL](https://www.postgresql.org/) | Relational database for all structured data |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team/) | Type-safe database queries and migrations |
| **Auth** | Google OAuth 2.0 | Google sign-in, session management |
| **Language** | TypeScript | Type safety across the entire codebase |
| **Runtime** | Node.js | Server runtime |
| **Process Manager** | [PM2](https://pm2.keymetrics.io/) | Keep the server running, auto-restart on crash |
| **Reverse Proxy** | nginx | SSL termination, static asset serving, proxy to Hono |
| **Hosting** | Digital Ocean VM | $6-12/mo droplet |

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Digital Ocean Droplet ($6-12/mo)                    │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  nginx                                         │  │
│  │  ├── SSL (Let's Encrypt)                       │  │
│  │  ├── /assets/* → static files (CSS, JS, imgs)  │  │
│  │  ├── /uploads/* → uploaded attachments          │  │
│  │  └── /* → proxy to Hono (port 3000)            │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Hono Server (managed by PM2)                  │  │
│  │  ├── Routes → render HTML pages (JSX)          │  │
│  │  ├── HTMX endpoints → return HTML fragments    │  │
│  │  ├── Google OAuth → session cookies            │  │
│  │  ├── Drizzle ORM → PostgreSQL                  │  │
│  │  └── Xray import service                       │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  PostgreSQL                                    │  │
│  │  └── All structured data (projects, cases,     │  │
│  │      suites, runs, results, users)             │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  /uploads (local disk)                         │  │
│  │  └── File attachments (screenshots, logs)      │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## Request Flow

```
Browser → nginx → Hono → Drizzle → PostgreSQL
                    ↓
              Renders JSX HTML
                    ↓
            HTMX swaps content in the page
```

## Local Development

| Tool | Purpose |
|------|---------|
| Node.js 20+ | Runtime |
| PostgreSQL (local or Docker) | Database |
| `npm run dev` | Hono dev server with hot reload |
| No frontend build step | HTMX + Tailwind CDN in development |

## Why This Stack

- **Hono + HTMX**: No frontend framework, no SPA complexity, no client-side state management. The server renders HTML, HTMX adds interactivity. Ideal for a CRUD-heavy tool.
- **PostgreSQL**: Relational data (projects → suites → cases → runs → results) maps naturally to SQL tables with foreign keys and joins.
- **Drizzle ORM**: Type-safe queries, easy migrations, lightweight. No heavy abstraction layer.
- **Digital Ocean VM**: Full control, low cost, everything runs on one machine. No vendor lock-in.
- **Tailwind + DaisyUI**: Rapid UI development with consistent styling. DaisyUI provides pre-built component classes (buttons, tables, modals, badges) without custom CSS.

## Future Considerations

- **Scaling**: If usage grows beyond one VM, split Postgres to a managed instance (DO Managed Database) and add a second app server behind a load balancer.
- **Backups**: Set up automated Postgres backups with `pg_dump` cron job or DO managed backups.
- **CI/CD**: GitHub Actions to run tests and deploy via SSH on push to `main`.
- **Monitoring**: PM2 built-in monitoring, or add a lightweight tool like Uptime Kuma.
