import { Hono } from 'hono';
import { db } from '../db/index.js';
import { projects, automatedRuns } from '../db/schema.js';
import { eq, desc, count, and, gte, lte, sql } from 'drizzle-orm';
import { Layout } from '../views/layout.js';
import type { AuthEnv } from '../middleware/auth.js';
import type { FC } from 'hono/jsx';
import { listSpecFiles, fetchFileContent, parseSpecFile, countTests, fetchTestCounts, testConnection, type TestNode, type SpecFileEntry } from '../services/github.js';

const automationRoutes = new Hono<AuthEnv>();

// ==================== Automated Tests (from GitHub) ====================

automationRoutes.get('/:projectId/automated-tests', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const p = project[0];
  const activeProject = { id: p.id, name: p.name, hasGithub: !!(p.githubOwner && p.githubRepo && p.githubTestPath) };
  const hasGithub = p.githubOwner && p.githubRepo && p.githubTestPath;

  let specFiles: SpecFileEntry[] = [];
  let error: string | null = null;
  let testCounts = new Map<string, number>();

  if (hasGithub) {
    try {
      specFiles = await listSpecFiles(p.githubOwner!, p.githubRepo!, p.githubBranch || 'main', p.githubTestPath!);
      testCounts = await fetchTestCounts(p.githubOwner!, p.githubRepo!, p.githubBranch || 'main', specFiles);
    } catch (err: any) {
      error = err.message;
    }
  }

  const folders = new Map<string, SpecFileEntry[]>();
  for (const f of specFiles) {
    const key = f.folder || '(root)';
    if (!folders.has(key)) folders.set(key, []);
    folders.get(key)!.push(f);
  }

  return c.html(
    <Layout title={`Automated Tests — ${p.name}`} user={user} activeProject={activeProject} activePage="auto-tests" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: p.name, href: `/projects/${projectId}` }, { label: 'Automated Tests' }]}>
      <AutoTestsView project={p} folders={folders} specFiles={specFiles} testCounts={testCounts} error={error} hasGithub={!!hasGithub} />
    </Layout>
  );
});

automationRoutes.get('/:projectId/automated-tests/file', async (c) => {
  const projectId = c.req.param('projectId');
  const filePath = c.req.query('path');
  if (!filePath) return c.text('Missing path', 400);

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const p = project[0];
  if (!p.githubOwner || !p.githubRepo) return c.text('GitHub not configured', 400);

  try {
    const content = await fetchFileContent(p.githubOwner, p.githubRepo, p.githubBranch || 'main', filePath);
    const tree = parseSpecFile(content);
    return c.html(<TestTreeView nodes={tree} />);
  } catch (err: any) {
    return c.html(<p class="text-error text-sm">{err.message}</p>);
  }
});

// ==================== Automated Runs ====================

automationRoutes.get('/:projectId/automated-runs', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const dateFrom = c.req.query('from');
  const dateTo = c.req.query('to');
  const versionFilter = c.req.query('version');
  const labelFilter = c.req.query('label');
  const period = c.req.query('period') ?? '7d';

  const conditions = [eq(automatedRuns.projectId, projectId)];

  if (dateFrom) {
    conditions.push(gte(automatedRuns.startedAt, new Date(dateFrom)));
  } else if (period !== 'all') {
    const days = period === '30d' ? 30 : period === '14d' ? 14 : 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);
    conditions.push(gte(automatedRuns.startedAt, cutoff));
  }

  if (dateTo) {
    const toEnd = new Date(dateTo);
    toEnd.setHours(23, 59, 59, 999);
    conditions.push(lte(automatedRuns.startedAt, toEnd));
  }

  if (versionFilter) {
    conditions.push(eq(automatedRuns.appVersion, versionFilter));
  }

  if (labelFilter) {
    conditions.push(eq(automatedRuns.label, labelFilter));
  }

  const runs = await db
    .select({
      id: automatedRuns.id,
      name: automatedRuns.name,
      label: automatedRuns.label,
      platform: automatedRuns.platform,
      appVersion: automatedRuns.appVersion,
      passed: automatedRuns.passed,
      failed: automatedRuns.failed,
      skipped: automatedRuns.skipped,
      total: automatedRuns.total,
      duration: automatedRuns.duration,
      startedAt: automatedRuns.startedAt,
      endedAt: automatedRuns.endedAt,
      createdAt: automatedRuns.createdAt,
    })
    .from(automatedRuns)
    .where(and(...conditions))
    .orderBy(desc(automatedRuns.startedAt));

  const appVersions = await db
    .selectDistinct({ appVersion: automatedRuns.appVersion })
    .from(automatedRuns)
    .where(eq(automatedRuns.projectId, projectId))
    .orderBy(desc(automatedRuns.appVersion));
  const versions = appVersions.map(v => v.appVersion).filter(Boolean) as string[];

  const labelRows = await db
    .selectDistinct({ label: automatedRuns.label })
    .from(automatedRuns)
    .where(eq(automatedRuns.projectId, projectId))
    .orderBy(automatedRuns.label);
  const labels = labelRows.map(l => l.label).filter(Boolean) as string[];

  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
  return c.html(
    <Layout title={`Automated Runs — ${project[0].name}`} user={user} activeProject={activeProject} activePage="auto-runs" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Automated Runs' }]}>
      <AutoRunsListView project={project[0]} runs={runs} versions={versions} labels={labels} filters={{ period, dateFrom: dateFrom || '', dateTo: dateTo || '', version: versionFilter || '', label: labelFilter || '' }} />
    </Layout>
  );
});

automationRoutes.get('/:projectId/automated-runs/:runId', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const run = await db.select().from(automatedRuns).where(eq(automatedRuns.id, runId)).limit(1);
  if (run.length === 0) return c.notFound();

  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
  return c.html(
    <Layout title={`${run[0].name} — ${project[0].name}`} user={user} activeProject={activeProject} activePage="auto-runs" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Automated Runs', href: `/projects/${projectId}/automated-runs` }, { label: run[0].name }]}>
      <AutoRunDetailView project={project[0]} run={run[0]} />
    </Layout>
  );
});

automationRoutes.post('/:projectId/automated-runs/:runId/label', async (c) => {
  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');
  const body = await c.req.parseBody();
  const label = (body['label'] as string || '').trim() || null;

  await db.update(automatedRuns)
    .set({ label })
    .where(eq(automatedRuns.id, runId));

  return c.redirect(`/projects/${projectId}/automated-runs/${runId}?toast=Label updated`);
});

// ==================== Results API (separate, no auth) ====================

const automationApiRoutes = new Hono<AuthEnv>();

automationApiRoutes.post('/:projectId/automated-results', async (c) => {
  const projectId = c.req.param('projectId');

  const apiKey = process.env.KC_API_KEY;
  if (apiKey) {
    const auth = c.req.header('Authorization');
    if (auth !== `Bearer ${apiKey}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.json({ error: 'Project not found' }, 404);

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const passed = body.passed ?? 0;
  const failed = body.failed ?? 0;
  const skipped = body.skipped ?? 0;
  const total = body.total ?? 0;
  const duration = body.duration ?? null;
  const startedAt = body.startTime ? new Date(body.startTime) : null;
  const endedAt = body.endTime ? new Date(body.endTime) : null;
  const platform = body.platform ?? null;
  const appVersion = body.appVersion ?? null;

  const datePart = startedAt ? startedAt.toISOString().replace(/[:.]/g, '-').substring(0, 19) : new Date().toISOString().substring(0, 10);
  const name = `Run ${datePart}${platform ? ` (${platform})` : ''}`;

  if (startedAt) {
    const dupes = await db.select({ id: automatedRuns.id }).from(automatedRuns)
      .where(eq(automatedRuns.startedAt, startedAt))
      .limit(1);
    if (dupes.length > 0) {
      return c.json({ error: 'Duplicate run (same startTime already exists)', id: dupes[0].id }, 409);
    }
  }

  const [inserted] = await db.insert(automatedRuns).values({
    projectId,
    name,
    platform,
    appVersion,
    passed,
    failed,
    skipped,
    total,
    duration,
    startedAt,
    endedAt,
    results: body,
  }).returning();

  return c.json({ id: inserted.id, passed, failed, total, message: `Imported: ${passed} passed, ${failed} failed, ${total} total` }, 201);
});

// ==================== Views ====================

const AutoTestsView: FC<{
  project: any;
  folders: Map<string, SpecFileEntry[]>;
  specFiles: SpecFileEntry[];
  testCounts: Map<string, number>;
  error: string | null;
  hasGithub: boolean;
}> = ({ project, folders, specFiles, testCounts, error, hasGithub }) => {
  let totalTests = 0;
  for (const c of testCounts.values()) totalTests += c;

  return (
    <div>
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-2xl font-bold">Automated Tests</h1>
          <p class="text-base-content/60 text-sm mt-1">
            {project.name} — {specFiles.length} suite{specFiles.length !== 1 ? 's' : ''} · {totalTests} test case{totalTests !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {!hasGithub ? (
        <div class="bg-base-100 rounded-box border border-base-300 p-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-3 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
          <h3 class="text-lg font-semibold mb-2">No GitHub repository configured</h3>
          <p class="text-sm text-base-content/50 mb-4">Connect a GitHub repo to browse automated test cases.</p>
          <a href={`/projects/${project.id}/edit`} class="btn btn-primary btn-sm">Configure in Project Settings</a>
        </div>
      ) : error ? (
        <div class="alert alert-error">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          <span>{error}</span>
        </div>
      ) : (
        <div class="space-y-4">
          {[...folders.entries()].map(([folder, files]) => {
            const folderTotal = files.reduce((sum, f) => sum + (testCounts.get(f.path) || 0), 0);
            return (
              <div class="bg-base-100 rounded-box border border-base-300">
                <div class="px-4 py-3 border-b border-base-200 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                  <span class="font-medium text-sm">{folder}</span>
                  <span class="badge badge-xs badge-ghost">{files.length} suite{files.length !== 1 ? 's' : ''}</span>
                  <span class="badge badge-xs badge-primary">{folderTotal} test{folderTotal !== 1 ? 's' : ''}</span>
                </div>
                <div class="divide-y divide-base-200">
                  {files.map((f) => {
                    const fileCount = testCounts.get(f.path) || 0;
                    return (
                      <details class="group">
                        <summary class="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-base-200 text-sm">
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/40 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-info/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                          <span class="flex-1 font-mono text-xs">{f.name}</span>
                          <span class="text-xs text-base-content/40">{fileCount} test{fileCount !== 1 ? 's' : ''}</span>
                        </summary>
                        <div
                          class="px-6 py-2 bg-base-200/30"
                          hx-get={`/projects/${project.id}/automated-tests/file?path=${encodeURIComponent(f.path)}`}
                          hx-trigger="intersect once"
                          hx-swap="innerHTML"
                        >
                          <p class="text-xs text-base-content/30 py-2">Loading...</p>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const TestTreeView: FC<{ nodes: TestNode[] }> = ({ nodes }) => (
  <ul class="space-y-0.5 py-1">
    {nodes.map((node) => (
      <li>
        <div class="flex items-center gap-2 py-1">
          {node.type === 'describe' ? (
            <span class="badge badge-xs badge-outline badge-primary">describe</span>
          ) : (
            <span class="badge badge-xs badge-outline badge-success">it</span>
          )}
          <span class="text-sm">{node.title}</span>
        </div>
        {node.children.length > 0 && (
          <div class="ml-5 border-l border-base-300 pl-3">
            <TestTreeView nodes={node.children} />
          </div>
        )}
      </li>
    ))}
  </ul>
);

type AutoRunRow = {
  id: string;
  name: string;
  label: string | null;
  platform: string | null;
  appVersion: string | null;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
};

function groupRunsByDate(runs: AutoRunRow[]): Map<string, AutoRunRow[]> {
  const groups = new Map<string, AutoRunRow[]>();
  for (const r of runs) {
    const d = r.startedAt ?? r.createdAt;
    const key = d.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return groups;
}

type RunFilters = { period: string; dateFrom: string; dateTo: string; version: string; label: string };

const AutoRunsListView: FC<{ project: { id: string; name: string }; runs: AutoRunRow[]; versions: string[]; labels: string[]; filters: RunFilters }> = ({ project, runs, versions, labels, filters }) => {
  const dateGroups = groupRunsByDate(runs);
  const baseUrl = `/projects/${project.id}/automated-runs`;

  function buildUrl(overrides: Partial<RunFilters>): string {
    const merged = { ...filters, ...overrides };
    const params = new URLSearchParams();
    if (merged.period && merged.period !== '7d') params.set('period', merged.period);
    if (merged.dateFrom) params.set('from', merged.dateFrom);
    if (merged.dateTo) params.set('to', merged.dateTo);
    if (merged.version) params.set('version', merged.version);
    if (merged.label) params.set('label', merged.label);
    if (merged.dateFrom || merged.dateTo) params.delete('period');
    const qs = params.toString();
    return qs ? `${baseUrl}?${qs}` : baseUrl;
  }

  const isCustomDateRange = !!(filters.dateFrom || filters.dateTo);

  return (
    <div>
      <div class="flex justify-between items-center mb-4">
        <div>
          <h1 class="text-2xl font-bold">Automated Runs</h1>
          <p class="text-base-content/60 text-sm mt-1">{project.name} — {runs.length} run{runs.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div class="bg-base-100 rounded-box border border-base-300 px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-1">
          <span class="text-xs font-medium text-base-content/50 mr-1">Period:</span>
          {['7d', '14d', '30d', 'all'].map((p) => (
            <a
              href={buildUrl({ period: p, dateFrom: '', dateTo: '' })}
              class={`btn btn-xs ${filters.period === p && !isCustomDateRange ? 'btn-primary' : 'btn-ghost'}`}
            >
              {p === '7d' ? '7 days' : p === '14d' ? '14 days' : p === '30d' ? '30 days' : 'All'}
            </a>
          ))}
        </div>

        <div class="divider divider-horizontal mx-0 h-6" />

        <form class="flex items-center gap-2" method="get" action={baseUrl}>
          <span class="text-xs font-medium text-base-content/50">From:</span>
          <input type="date" name="from" value={filters.dateFrom} class="input input-xs input-bordered w-36" />
          <span class="text-xs font-medium text-base-content/50">To:</span>
          <input type="date" name="to" value={filters.dateTo} class="input input-xs input-bordered w-36" />
          {filters.version && <input type="hidden" name="version" value={filters.version} />}
          {filters.label && <input type="hidden" name="label" value={filters.label} />}
          <button type="submit" class="btn btn-xs btn-primary">Apply</button>
          {isCustomDateRange && <a href={buildUrl({ dateFrom: '', dateTo: '', period: '7d' })} class="btn btn-xs btn-ghost">Clear</a>}
        </form>

        {versions.length > 0 && (
          <>
            <div class="divider divider-horizontal mx-0 h-6" />
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-base-content/50">Version:</span>
              <select class="select select-xs select-bordered" onchange={`window.location=this.value`}>
                <option value={buildUrl({ version: '' })} selected={!filters.version}>All versions</option>
                {versions.map((v) => (
                  <option value={buildUrl({ version: v })} selected={filters.version === v}>{v}</option>
                ))}
              </select>
            </div>
          </>
        )}
        {labels.length > 0 && (
          <>
            <div class="divider divider-horizontal mx-0 h-6" />
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-base-content/50">Label:</span>
              <select class="select select-xs select-bordered" onchange={`window.location=this.value`}>
                <option value={buildUrl({ label: '' })} selected={!filters.label}>All labels</option>
                {labels.map((l) => (
                  <option value={buildUrl({ label: l })} selected={filters.label === l}>{l}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {runs.length === 0 ? (
        <div class="bg-base-100 rounded-box border border-base-300 p-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-3 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          <h3 class="text-lg font-semibold mb-2">No runs found</h3>
          <p class="text-sm text-base-content/50">No automated runs match the current filters. Try adjusting the date range or version.</p>
        </div>
      ) : (
        <div class="space-y-4">
          {[...dateGroups.entries()].map(([dateLabel, groupRuns]) => (
            <details class="bg-base-100 rounded-box border border-base-300 group" open>
              <summary class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-base-200 border-b border-base-200">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/40 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
                <span class="font-medium text-sm">{dateLabel}</span>
                <span class="badge badge-xs badge-ghost">{groupRuns.length} run{groupRuns.length !== 1 ? 's' : ''}</span>
              </summary>
              <div class="overflow-x-auto">
                <table class="table table-sm table-fixed">
                  <colgroup>
                    <col style="width: 15%" />
                    <col style="width: 15%" />
                    <col style="width: 25%" />
                    <col style="width: 15%" />
                    <col style="width: 15%" />
                    <col style="width: 15%" />
                  </colgroup>
                  <thead>
                    <tr class="text-xs uppercase text-base-content/50">
                      <th>Time</th>
                      <th>App Version</th>
                      <th>Results</th>
                      <th>Pass Rate</th>
                      <th>Duration</th>
                      <th>Label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupRuns.map((r) => {
                      const passRate = r.total > 0 ? Math.round((r.passed / r.total) * 100) : 0;
                      const durationMin = r.duration ? Math.round(r.duration / 60000) : null;
                      const timeStr = (r.startedAt ?? r.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                      return (
                        <tr class="hover:bg-base-200 cursor-pointer" onclick={`window.location='/projects/${project.id}/automated-runs/${r.id}'`}>
                          <td class="font-medium whitespace-nowrap">
                            <a href={`/projects/${project.id}/automated-runs/${r.id}`} class="link link-hover">{timeStr}</a>
                            {r.platform && <span class="text-xs text-base-content/40 ml-2">{r.platform}</span>}
                          </td>
                          <td class="text-sm text-base-content/60 whitespace-nowrap">{r.appVersion || '—'}</td>
                          <td>
                            <div class="flex items-center gap-2">
                              <div class="w-20 h-2 bg-base-300 rounded-full overflow-hidden flex">
                                {r.passed > 0 && <div class="bg-success h-full" style={`width:${(r.passed / r.total) * 100}%`} />}
                                {r.failed > 0 && <div class="bg-error h-full" style={`width:${(r.failed / r.total) * 100}%`} />}
                                {r.skipped > 0 && <div class="bg-info h-full" style={`width:${(r.skipped / r.total) * 100}%`} />}
                              </div>
                              <span class="text-xs text-base-content/50 whitespace-nowrap">
                                {r.passed}/{r.total}
                                {r.failed > 0 && <span class="text-error ml-1">({r.failed} fail)</span>}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span class={`text-sm font-medium ${passRate >= 80 ? 'text-success' : passRate >= 50 ? 'text-warning' : 'text-error'}`}>
                              {passRate}%
                            </span>
                          </td>
                          <td class="text-sm text-base-content/60 whitespace-nowrap">{durationMin != null ? `${durationMin}m` : '—'}</td>
                          <td class="whitespace-nowrap">{r.label ? <span class="badge badge-sm badge-outline">{r.label}</span> : <span class="text-base-content/30">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
};

function isRunningReportFormat(results: any): boolean {
  return Array.isArray(results?.failedTestsList) || Array.isArray(results?.passedTestsList);
}

const RunningReportDetail: FC<{ results: any }> = ({ results }) => {
  const failedSuites: any[] = results.failedTestsList || [];
  const passedSuites: any[] = results.passedTestsList || [];

  return (
    <div class="space-y-3">
      {failedSuites.length > 0 && (
        <div>
          <h3 class="text-sm font-semibold text-error mb-2">Failed Tests</h3>
          {failedSuites.map((suite: any) => (
            <details class="bg-base-100 rounded-box border border-error/30 group mb-2" open>
              <summary class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-base-200">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/40 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
                <span class="font-medium text-sm flex-1">{suite.suiteName}</span>
                <span class="badge badge-xs badge-error">{suite.tests.length} failed</span>
              </summary>
              <div class="border-t border-error/20">
                <table class="table table-sm">
                  <tbody>
                    {suite.tests.map((t: any) => (
                      <tr>
                        <td class="w-6"><span class="text-error">&#10007;</span></td>
                        <td class="text-sm">
                          <span class="text-base-content/40 mr-2">#{t.index}</span>
                          {t.name}
                          {t.error && (
                            <pre class="text-xs text-error/80 bg-error/5 rounded p-2 mt-1 whitespace-pre-wrap max-h-32 overflow-auto">{t.error}</pre>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}

      {passedSuites.length > 0 && (
        <div>
          <h3 class="text-sm font-semibold text-success mb-2">Passed Tests</h3>
          {passedSuites.map((suite: any) => (
            <details class="bg-base-100 rounded-box border border-base-300 group mb-2">
              <summary class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-base-200">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/40 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
                <span class="font-medium text-sm flex-1">{suite.suiteName}</span>
                <span class="badge badge-xs badge-success">{suite.tests.length} passed</span>
              </summary>
              <div class="border-t border-base-200">
                <table class="table table-sm">
                  <tbody>
                    {suite.tests.map((t: any) => (
                      <tr>
                        <td class="w-6"><span class="text-success">&#10003;</span></td>
                        <td class="text-sm">
                          <span class="text-base-content/40 mr-2">#{t.index}</span>
                          {t.name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
};

const TestResultsJsonDetail: FC<{ results: any }> = ({ results }) => {
  const suites = results?.testSuites || [];
  return (
    <div class="space-y-3">
      {suites.map((suite: any) => {
        const tests = suite.tests || [];
        const suitePassed = tests.filter((t: any) => t.status === 'passed').length;
        const suiteFailed = tests.filter((t: any) => t.status === 'failed').length;
        return (
          <details class="bg-base-100 rounded-box border border-base-300 group" open={suiteFailed > 0}>
            <summary class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-base-200">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/40 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
              <span class="font-medium text-sm flex-1">{suite.name}</span>
              <span class="text-xs text-base-content/50">{tests.length} test{tests.length !== 1 ? 's' : ''}</span>
              {suiteFailed > 0 && <span class="badge badge-xs badge-error">{suiteFailed} failed</span>}
              {suiteFailed === 0 && suitePassed === tests.length && <span class="badge badge-xs badge-success">all passed</span>}
            </summary>
            <div class="border-t border-base-200">
              <table class="table table-sm">
                <tbody>
                  {tests.map((t: any) => (
                    <tr>
                      <td class="w-6">
                        {t.status === 'passed' && <span class="text-success">&#10003;</span>}
                        {t.status === 'failed' && <span class="text-error">&#10007;</span>}
                        {t.status === 'skipped' && <span class="text-info">&#8212;</span>}
                        {t.status === 'pending' && <span class="text-warning">&#9679;</span>}
                      </td>
                      <td class="text-sm flex-1">
                        {t.title}
                        {t.errorMessage && (
                          <pre class="text-xs text-error/80 bg-error/5 rounded p-2 mt-1 whitespace-pre-wrap max-h-32 overflow-auto">{t.errorMessage}</pre>
                        )}
                      </td>
                      <td class="text-xs text-base-content/40 whitespace-nowrap">{t.duration ? `${(t.duration / 1000).toFixed(1)}s` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </div>
  );
};

const AutoRunDetailView: FC<{ project: { id: string; name: string }; run: any }> = ({ project, run }) => {
  const results = run.results as any;
  const passRate = run.total > 0 ? Math.round((run.passed / run.total) * 100) : 0;
  const durationMin = run.duration ? (run.duration / 60000).toFixed(1) : null;
  const isReport = isRunningReportFormat(results);

  return (
    <div>
      <div class="mb-6">
        <h1 class="text-2xl font-bold">{run.name}</h1>
        <div class="flex items-center justify-between mt-2 flex-wrap gap-2">
          <div class="flex items-center gap-2">
            {run.platform && <span class="badge badge-sm badge-outline">{run.platform}</span>}
            {run.appVersion && <span class="badge badge-sm badge-primary badge-outline">v{run.appVersion}</span>}
          </div>
          <form method="post" action={`/projects/${project.id}/automated-runs/${run.id}/label`} class="flex items-center gap-2 editor-action">
            <span class="text-xs text-base-content/50">Label:</span>
            <input type="text" name="label" value={run.label || ''} placeholder="Add label..." class="input input-xs input-bordered w-36" />
            <button type="submit" class="btn btn-xs btn-primary btn-outline">Save</button>
          </form>
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div class="stat bg-base-100 rounded-box border border-base-300 py-3 px-4">
          <div class="stat-title text-xs">Total</div>
          <div class="stat-value text-xl">{run.total}</div>
        </div>
        <div class="stat bg-base-100 rounded-box border border-base-300 py-3 px-4">
          <div class="stat-title text-xs">Passed</div>
          <div class="stat-value text-xl text-success">{run.passed}</div>
        </div>
        <div class="stat bg-base-100 rounded-box border border-base-300 py-3 px-4">
          <div class="stat-title text-xs">Failed</div>
          <div class="stat-value text-xl text-error">{run.failed}</div>
        </div>
        <div class="stat bg-base-100 rounded-box border border-base-300 py-3 px-4">
          <div class="stat-title text-xs">Pass Rate</div>
          <div class={`stat-value text-xl ${passRate >= 80 ? 'text-success' : passRate >= 50 ? 'text-warning' : 'text-error'}`}>{passRate}%</div>
        </div>
        <div class="stat bg-base-100 rounded-box border border-base-300 py-3 px-4">
          <div class="stat-title text-xs">Duration</div>
          <div class="stat-value text-xl">{durationMin ? `${durationMin}m` : '—'}</div>
        </div>
      </div>

      {run.startedAt && (
        <p class="text-xs text-base-content/40 mb-4">
          Started: {run.startedAt.toLocaleString()} {run.endedAt && `· Ended: ${run.endedAt.toLocaleString()}`}
        </p>
      )}

      {isReport ? <RunningReportDetail results={results} /> : <TestResultsJsonDetail results={results} />}
    </div>
  );
};

export { automationRoutes, automationApiRoutes };
