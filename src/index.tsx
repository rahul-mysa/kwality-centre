import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { config } from 'dotenv';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { projectRoutes } from './routes/projects.js';
import { testCaseRoutes } from './routes/test-cases.js';
import { folderRoutes } from './routes/folders.js';
import { importRoutes } from './routes/import.js';
import { suiteRoutes } from './routes/suites.js';
import { runRoutes } from './routes/runs.js';
import { automationRoutes, automationApiRoutes } from './routes/automation.js';
import { adminRoutes } from './routes/admin.js';
import { authMiddleware, type AuthEnv } from './middleware/auth.js';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { eq } from 'drizzle-orm';

config({ path: '.env.local' });

async function ensureDevUser() {
  if (process.env.NODE_ENV === 'production' || process.env.GOOGLE_CLIENT_ID) return;
  const devId = '00000000-0000-0000-0000-000000000000';
  const existing = await db.select().from(users).where(eq(users.id, devId)).limit(1);
  if (existing.length === 0) {
    await db.insert(users).values({ id: devId, email: 'dev@kwality.local', name: 'Dev User' });
  }
}

ensureDevUser().catch(console.error);

const app = new Hono<AuthEnv>();

app.use('/assets/*', serveStatic({ root: './public' }));

app.route('/auth', authRoutes);

app.route('/api/projects', automationApiRoutes);

app.use('*', authMiddleware);
app.route('/', dashboardRoutes);
app.route('/projects', projectRoutes);
app.route('/projects', testCaseRoutes);
app.route('/projects', folderRoutes);
app.route('/projects', importRoutes);
app.route('/projects', suiteRoutes);
app.route('/projects', runRoutes);
app.route('/projects', automationRoutes);
app.route('/admin', adminRoutes);

app.notFound((c) => {
  const user = c.get('user');
  return c.html(
    <html lang="en" data-theme="nord">
      <head>
        <meta charset="UTF-8" />
        <title>404 — Kwality Centre</title>
        <link href="https://cdn.jsdelivr.net/npm/daisyui@4/dist/full.min.css" rel="stylesheet" />
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="min-h-screen bg-base-200 flex items-center justify-center">
        <div class="text-center">
          <h1 class="text-6xl font-bold text-base-content/20">404</h1>
          <p class="text-lg mt-4">Page not found</p>
          <a href="/" class="btn btn-primary btn-sm mt-6">Back to Dashboard</a>
        </div>
      </body>
    </html>,
    404
  );
});

const port = parseInt(process.env.PORT || '3000');

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`\n  Kwality Centre running at http://localhost:${info.port}\n`);
});
