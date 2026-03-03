import { Hono } from 'hono';
import { db } from '../db/index.js';
import { projects } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { Layout } from '../views/layout.js';
import type { AuthEnv } from '../middleware/auth.js';
import { importFromXray, type ImportResult } from '../services/xray-import.js';

const importRoutes = new Hono<AuthEnv>();

importRoutes.get('/:projectId/import', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const hasXrayConfig = !!(process.env.XRAY_CLIENT_ID && process.env.XRAY_CLIENT_SECRET && process.env.JIRA_PROJECT_KEY);
  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };

  return c.html(
    <Layout title={`Import — ${project[0].name}`} user={user} activeProject={activeProject} activePage="import" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Import' }]}>
      <ImportPageView project={project[0]} hasXrayConfig={hasXrayConfig} />
    </Layout>
  );
});

importRoutes.post('/:projectId/import/xray', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };

  try {
    const result = await importFromXray(projectId, user.id);

    return c.html(
      <Layout title={`Import Complete — ${project[0].name}`} user={user} activeProject={activeProject} activePage="import" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Import' }]}>
        <ImportResultView project={project[0]} result={result} />
      </Layout>
    );
  } catch (err: any) {
    return c.html(
      <Layout title={`Import Failed — ${project[0].name}`} user={user} activeProject={activeProject} activePage="import" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Import' }]}>
        <ImportPageView project={project[0]} hasXrayConfig={true} error={err.message} />
      </Layout>
    );
  }
});

export { importRoutes };

// --- Views inlined for simplicity ---

import type { FC } from 'hono/jsx';

const ImportPageView: FC<{ project: { id: string; name: string }; hasXrayConfig: boolean; error?: string }> = ({ project, hasXrayConfig, error }) => (
  <div class="max-w-2xl">
    <h1 class="text-2xl font-bold mb-2">Import Test Cases</h1>
    <p class="text-base-content/60 mb-6">Import existing test cases from Jira Xray Cloud into {project.name}.</p>

    {error && (
      <div class="alert alert-error mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
        <div>
          <p class="font-semibold">Import failed</p>
          <p class="text-sm">{error}</p>
        </div>
      </div>
    )}

    {!hasXrayConfig ? (
      <div class="alert alert-warning">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
        <div>
          <p class="font-semibold">Xray not configured</p>
          <p class="text-sm">Set <code>XRAY_CLIENT_ID</code>, <code>XRAY_CLIENT_SECRET</code>, and <code>JIRA_PROJECT_KEY</code> in your environment variables.</p>
        </div>
      </div>
    ) : (
      <div class="bg-base-100 rounded-box shadow-sm border border-base-300 p-6">
        <div class="flex items-start gap-4 mb-6">
          <div class="bg-info/10 rounded-lg p-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-semibold">Xray Cloud Import</h2>
            <p class="text-sm text-base-content/60 mt-1">
              Import test cases from Jira project <code class="badge badge-sm">{process.env.JIRA_PROJECT_KEY}</code> with their steps, folders, and metadata.
            </p>
          </div>
        </div>

        <div class="bg-base-200 rounded-lg p-4 mb-6">
          <h3 class="text-sm font-semibold mb-2">What will be imported:</h3>
          <ul class="text-sm space-y-1 text-base-content/70">
            <li class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
              Test cases with title, description, preconditions, priority, status
            </li>
            <li class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
              Test steps (action, data, expected result)
            </li>
            <li class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
              Folder structure (auto-created from Xray repository)
            </li>
            <li class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
              Xray key and issue ID for traceability
            </li>
            <li class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
              Jira wiki markup converted to plain text
            </li>
            <li class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01" /></svg>
              <span class="text-base-content/50">Attachments skipped (can be imported later)</span>
            </li>
          </ul>
        </div>

        <div class="bg-warning/10 border border-warning/30 rounded-lg p-4 mb-6">
          <p class="text-sm text-warning-content">
            <strong>Duplicate detection:</strong> Test cases already imported (matched by Xray key) will be skipped. It's safe to run this multiple times.
          </p>
        </div>

        <form method="POST" action={`/projects/${project.id}/import/xray`} onsubmit="this.querySelector('button').disabled=true; this.querySelector('button').innerHTML='<span class=\\'loading loading-spinner loading-sm\\'></span> Importing...';">
          <button type="submit" class="btn btn-primary gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Start Import from Xray
          </button>
        </form>
      </div>
    )}
  </div>
);

const ImportResultView: FC<{ project: { id: string; name: string }; result: ImportResult }> = ({ project, result }) => (
  <div class="max-w-2xl">
    <h1 class="text-2xl font-bold mb-2">Import Complete</h1>
    <p class="text-base-content/60 mb-6">Xray import into {project.name} finished in {result.duration} seconds.</p>

    <div class="bg-base-100 rounded-box shadow-sm border border-base-300 p-6 mb-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="stat bg-base-200 rounded-lg p-4">
          <div class="stat-title text-xs">Test Cases</div>
          <div class="stat-value text-2xl text-success">{result.testCasesImported}</div>
          <div class="stat-desc">imported</div>
        </div>
        <div class="stat bg-base-200 rounded-lg p-4">
          <div class="stat-title text-xs">Steps</div>
          <div class="stat-value text-2xl">{result.stepsImported}</div>
          <div class="stat-desc">created</div>
        </div>
        <div class="stat bg-base-200 rounded-lg p-4">
          <div class="stat-title text-xs">Folders</div>
          <div class="stat-value text-2xl">{result.foldersCreated}</div>
          <div class="stat-desc">created</div>
        </div>
        <div class="stat bg-base-200 rounded-lg p-4">
          <div class="stat-title text-xs">Skipped</div>
          <div class="stat-value text-2xl text-base-content/40">{result.testCasesSkipped}</div>
          <div class="stat-desc">duplicates</div>
        </div>
      </div>

      {result.errors.length > 0 && (
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-error mb-2">Errors ({result.errors.length})</h3>
          <div class="bg-error/5 border border-error/20 rounded-lg p-3 max-h-40 overflow-y-auto">
            {result.errors.map((err) => (
              <p class="text-xs text-error mb-1">{err}</p>
            ))}
          </div>
        </div>
      )}
    </div>

    <div class="flex gap-3">
      <a href={`/projects/${project.id}/test-cases`} class="btn btn-primary gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        View Test Cases
      </a>
      <a href={`/projects/${project.id}/import`} class="btn btn-ghost">Import Again</a>
    </div>
  </div>
);
