# Kwality Centre

A test management tool for creating test cases, test suites, test runs, and tracking results. Built for teams migrating from tools like HP Quality Center or Jira Xray.

## Features

- **Test Cases** — Create, edit, organize into folders, search/filter/sort, bulk actions
- **Test Suites** — Group test cases for structured execution
- **Test Runs** — Execute suites, record pass/fail/blocked/skipped results with comments and GitHub issue links
- **Automated Tests** — View automated test definitions from GitHub (Detox, Playwright), track execution results via API
- **Dashboard** — Project overview with charts, pass rate trends, recent activity
- **Xray Import** — Import test cases and executions from Jira Xray Cloud
- **Google Auth** — Company Google Workspace authentication
- **Role-Based Access** — Viewer (read-only), Editor (create/edit), Admin (full access + user management)

## Tech Stack

- **Backend**: [Hono](https://hono.dev/) (TypeScript)
- **Frontend**: Server-rendered JSX + [HTMX](https://htmx.org/) for interactivity
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [DaisyUI](https://daisyui.com/)
- **Database**: PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **Auth**: Google OAuth 2.0 + JWT sessions

## Prerequisites

- Node.js 20+
- PostgreSQL 14+

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a PostgreSQL database

```bash
createdb kwality_centre
```

### 3. Configure environment variables

Copy the example below into `.env.local` and fill in your values:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kwality_centre

# Google OAuth (set up as "Internal" app in Google Cloud Console)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Domain restriction (comma-separated allowed email domains)
ALLOWED_DOMAINS=yourcompany.com

# Admin emails (auto-promoted to admin on first login)
ADMIN_EMAILS=you@yourcompany.com

# GitHub (for automated test integration — optional)
GITHUB_TOKEN=ghp_your-personal-access-token

# API key for automated results upload (optional)
KC_API_KEY=your-api-key

# Xray Cloud (for import — optional)
XRAY_CLIENT_ID=your-xray-client-id
XRAY_CLIENT_SECRET=your-xray-client-secret
JIRA_PROJECT_KEY=TEST

# App
SESSION_SECRET=random-secret-string-at-least-32-chars
PORT=3000
NODE_ENV=development
```

> **Note**: If `GOOGLE_CLIENT_ID` is not set, the app runs in dev mode with a local dev user (no login required).

### 4. Push the database schema

```bash
npm run db:push
```

### 5. Start the dev server

```bash
npm run dev
```

The app will be running at [http://localhost:3000](http://localhost:3000).

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm run start` | Start production server |
| `npm run db:push` | Push schema changes to database |
| `npm run db:generate` | Generate Drizzle migration files |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:studio` | Open Drizzle Studio (visual DB browser) |

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Navigate to **APIs & Services > Credentials**
4. Create an **OAuth 2.0 Client ID** (Web application)
5. Add `http://localhost:3000/auth/google/callback` as an authorized redirect URI
6. For company-only access, set the OAuth consent screen to **Internal** (requires Google Workspace)
7. Copy the Client ID and Client Secret into `.env.local`

## Automated Test Integration

To display automated tests from a GitHub repo:

1. Edit your project in Kwality Centre and fill in the GitHub fields (owner, repo, branch, test path)
2. Set `GITHUB_TOKEN` in `.env.local` with a personal access token that has repo read access
3. The Automated Tests page will show spec files and test counts from GitHub

To upload test results:

```bash
curl -X POST http://localhost:3000/api/projects/PROJECT_ID/automated-results \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KC_API_KEY" \
  -d @test-results.json
```

## User Roles

| Role | Permissions |
|------|-------------|
| **Viewer** | View everything (read-only) |
| **Editor** | Create and edit projects, test cases, suites; execute test runs |
| **Admin** | Everything + delete, import from Xray, manage users |

New users default to **Viewer**. Emails in `ADMIN_EMAILS` are auto-promoted to Admin on first login. Admins can change roles from the **Manage Users** page (profile dropdown).

## Project Structure

```
src/
├── index.tsx              # App entry point
├── db/
│   ├── schema.ts          # Drizzle database schema
│   └── index.ts           # DB connection
├── routes/
│   ├── auth.tsx            # Google OAuth
│   ├── dashboard.tsx       # Dashboard
│   ├── projects.tsx        # Project CRUD
│   ├── test-cases.tsx      # Test case CRUD
│   ├── folders.tsx         # Folder management
│   ├── suites.tsx          # Test suite CRUD
│   ├── runs.tsx            # Test runs & execution
│   ├── automation.tsx      # Automated tests & runs
│   ├── import.tsx          # Xray import
│   └── admin.tsx           # User management
├── views/                  # Server-rendered JSX templates
├── services/
│   ├── xray-import.ts      # Xray API client
│   └── github.ts           # GitHub API client
└── middleware/
    └── auth.ts             # Auth + role guards
```

## License

Private — internal use only.
