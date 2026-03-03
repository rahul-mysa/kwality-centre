import { Hono } from 'hono';
import { db } from '../db/index.js';
import { testRuns, testResults, testSuites, suiteTestCases, testCases, testSteps, projects } from '../db/schema.js';
import { eq, desc, asc, count, sql, and, notInArray, type SQL } from 'drizzle-orm';
import { Layout } from '../views/layout.js';
import type { AuthEnv } from '../middleware/auth.js';
import { RunStatusBadge, ResultStatusBadge, PriorityBadge } from '../views/components/badge.js';
import { EmptyState } from '../views/components/empty-state.js';
import type { FC } from 'hono/jsx';
import { marked } from 'marked';

const runRoutes = new Hono<AuthEnv>();

// ==================== Routes ====================

// --- List all runs ---
runRoutes.get('/:projectId/runs', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const search = c.req.query('search') || '';
  const statusFilter = c.req.query('status') || '';
  const sortBy = c.req.query('sort') || 'created_at';
  const sortDir = c.req.query('dir') || 'desc';

  const conditions: SQL[] = [eq(testRuns.projectId, projectId)];
  if (statusFilter) conditions.push(eq(testRuns.status, statusFilter as any));
  if (search) conditions.push(sql`${testRuns.name} ILIKE ${'%' + search + '%'}`);

  const sortColumn = sortBy === 'name' ? testRuns.name
    : sortBy === 'status' ? testRuns.status
    : sortBy === 'started_at' ? testRuns.startedAt
    : sortBy === 'completed_at' ? testRuns.completedAt
    : testRuns.createdAt;
  const orderFn = sortDir === 'asc' ? asc : desc;

  const runs = await db
    .select({
      id: testRuns.id,
      name: testRuns.name,
      status: testRuns.status,
      environment: testRuns.environment,
      createdAt: testRuns.createdAt,
      startedAt: testRuns.startedAt,
      completedAt: testRuns.completedAt,
      suiteName: testSuites.name,
    })
    .from(testRuns)
    .leftJoin(testSuites, eq(testSuites.id, testRuns.suiteId))
    .where(and(...conditions))
    .orderBy(orderFn(sortColumn));

  const statsMap = new Map<string, RunStats>();

  if (runs.length > 0) {
    const stats = await db
      .select({ runId: testResults.runId, status: testResults.status, count: count() })
      .from(testResults)
      .groupBy(testResults.runId, testResults.status);
    for (const row of stats) {
      if (!statsMap.has(row.runId)) statsMap.set(row.runId, { total: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, not_run: 0 });
      const s = statsMap.get(row.runId)!;
      s.total += row.count;
      if (row.status === 'passed') s.passed = row.count;
      else if (row.status === 'failed') s.failed = row.count;
      else if (row.status === 'blocked') s.blocked = row.count;
      else if (row.status === 'skipped') s.skipped = row.count;
      else s.not_run = row.count;
    }
  }

  const runsWithStats = runs.map((r) => ({
    ...r,
    stats: statsMap.get(r.id) || { total: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, not_run: 0 },
  }));

  const filters = { search, status: statusFilter, sort: sortBy, dir: sortDir };
  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
  return c.html(
    <Layout title={`Test Runs — ${project[0].name}`} user={user} activeProject={activeProject} activePage="runs" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Test Runs' }]}>
      <RunListView project={project[0]} runs={runsWithStats} filters={filters} />
    </Layout>
  );
});

// --- New run form ---
runRoutes.get('/:projectId/runs/new', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const suites = await db
    .select({ id: testSuites.id, name: testSuites.name, description: testSuites.description })
    .from(testSuites)
    .where(eq(testSuites.projectId, projectId))
    .orderBy(asc(testSuites.name));

  const suiteCounts = await db
    .select({ suiteId: suiteTestCases.suiteId, count: count() })
    .from(suiteTestCases)
    .groupBy(suiteTestCases.suiteId);
  const countMap = new Map(suiteCounts.map((r) => [r.suiteId, r.count]));

  const suitesWithCounts = suites.map((s) => ({ ...s, caseCount: countMap.get(s.id) || 0 }));

  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
  return c.html(
    <Layout title={`New Test Run — ${project[0].name}`} user={user} activeProject={activeProject} activePage="runs" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Test Runs', href: `/projects/${projectId}/runs` }, { label: 'New' }]}>
      <NewRunView project={project[0]} suites={suitesWithCounts} />
    </Layout>
  );
});

// --- Create run ---
runRoutes.post('/:projectId/runs', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const body = await c.req.parseBody();
  const name = (body.name as string || '').trim();
  const suiteId = (body.suiteId as string || '').trim();
  const environment = (body.environment as string || '').trim();

  if (!name || !suiteId) {
    return c.redirect(`/projects/${projectId}/runs/new`);
  }

  const [run] = await db.insert(testRuns).values({
    projectId, suiteId, name,
    environment: environment || null,
    createdBy: user.id, status: 'planned',
  }).returning();

  const suiteCases = await db
    .select({ testCaseId: suiteTestCases.testCaseId })
    .from(suiteTestCases)
    .where(eq(suiteTestCases.suiteId, suiteId))
    .orderBy(asc(suiteTestCases.position));

  if (suiteCases.length > 0) {
    await db.insert(testResults).values(
      suiteCases.map((sc) => ({ runId: run.id, testCaseId: sc.testCaseId, status: 'not_run' as const }))
    );
  }

  return c.redirect(`/projects/${projectId}/runs/${run.id}`);
});

// --- Run detail / execution page ---
runRoutes.get('/:projectId/runs/:runId', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');
  const statusFilter = c.req.query('status') || '';

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const run = await db
    .select({
      id: testRuns.id, name: testRuns.name, status: testRuns.status,
      environment: testRuns.environment,
      createdAt: testRuns.createdAt, updatedAt: testRuns.updatedAt,
      startedAt: testRuns.startedAt, completedAt: testRuns.completedAt,
      suiteName: testSuites.name, suiteId: testRuns.suiteId,
    })
    .from(testRuns)
    .leftJoin(testSuites, eq(testSuites.id, testRuns.suiteId))
    .where(eq(testRuns.id, runId))
    .limit(1);
  if (run.length === 0) return c.notFound();

  const conditions: SQL[] = [eq(testResults.runId, runId)];
  if (statusFilter) conditions.push(eq(testResults.status, statusFilter as any));

  const results = await db
    .select({
      id: testResults.id, testCaseId: testResults.testCaseId,
      status: testResults.status, notes: testResults.notes,
      defectUrl: testResults.defectUrl, executedAt: testResults.executedAt,
      tcTitle: testCases.title, tcPriority: testCases.priority, tcXrayKey: testCases.xrayKey,
    })
    .from(testResults)
    .innerJoin(testCases, eq(testCases.id, testResults.testCaseId))
    .where(and(...conditions))
    .orderBy(asc(testCases.title));

  const allResults = await db
    .select({ status: testResults.status, count: count() })
    .from(testResults)
    .where(eq(testResults.runId, runId))
    .groupBy(testResults.status);

  const stats: RunStats = { total: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, not_run: 0 };
  for (const r of allResults) {
    stats.total += r.count;
    if (r.status === 'passed') stats.passed = r.count;
    else if (r.status === 'failed') stats.failed = r.count;
    else if (r.status === 'blocked') stats.blocked = r.count;
    else if (r.status === 'skipped') stats.skipped = r.count;
    else stats.not_run = r.count;
  }

  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
  return c.html(
    <Layout title={`${run[0].name} — ${project[0].name}`} user={user} activeProject={activeProject} activePage="runs" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Test Runs', href: `/projects/${projectId}/runs` }, { label: run[0].name }]}>
      <RunDetailView project={project[0]} run={run[0]} results={results} stats={stats} statusFilter={statusFilter} />
    </Layout>
  );
});

// --- Execute single test case (read-only view + result controls) ---
runRoutes.get('/:projectId/runs/:runId/execute/:resultId', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');
  const resultId = c.req.param('resultId');

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const run = await db
    .select({ id: testRuns.id, name: testRuns.name, status: testRuns.status })
    .from(testRuns).where(eq(testRuns.id, runId)).limit(1);
  if (run.length === 0) return c.notFound();

  const result = await db
    .select({
      id: testResults.id, testCaseId: testResults.testCaseId,
      status: testResults.status, notes: testResults.notes,
      defectUrl: testResults.defectUrl,
    })
    .from(testResults).where(eq(testResults.id, resultId)).limit(1);
  if (result.length === 0) return c.notFound();

  const tc = await db.select().from(testCases).where(eq(testCases.id, result[0].testCaseId)).limit(1);
  if (tc.length === 0) return c.notFound();

  const steps = await db.select().from(testSteps)
    .where(eq(testSteps.testCaseId, tc[0].id))
    .orderBy(asc(testSteps.stepNumber));

  // Get all results in this run for prev/next navigation
  const allResults = await db
    .select({ id: testResults.id, tcTitle: testCases.title })
    .from(testResults)
    .innerJoin(testCases, eq(testCases.id, testResults.testCaseId))
    .where(eq(testResults.runId, runId))
    .orderBy(asc(testCases.title));

  const currentIdx = allResults.findIndex((r) => r.id === resultId);
  const prevResult = currentIdx > 0 ? allResults[currentIdx - 1] : null;
  const nextResult = currentIdx < allResults.length - 1 ? allResults[currentIdx + 1] : null;

  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
  return c.html(
    <Layout title={`Execute — ${tc[0].title}`} user={user} activeProject={activeProject} activePage="runs" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Test Runs', href: `/projects/${projectId}/runs` }, { label: run[0].name, href: `/projects/${projectId}/runs/${runId}` }, { label: tc[0].title }]}>
      <ExecuteView
        project={project[0]} run={run[0]} result={result[0]}
        testCase={tc[0]} steps={steps}
        currentIndex={currentIdx} totalCount={allResults.length}
        prevResultId={prevResult?.id || null} nextResultId={nextResult?.id || null}
      />
    </Layout>
  );
});

// --- Update a single result ---
runRoutes.post('/:projectId/runs/:runId/results/:resultId', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');
  const resultId = c.req.param('resultId');
  const body = await c.req.parseBody();
  const returnTo = (body.returnTo as string) || 'run';

  const updates: Record<string, any> = { updatedAt: new Date() };

  if (body.status) {
    updates.status = body.status;
    if (body.status === 'not_run') {
      updates.executedBy = null;
      updates.executedAt = null;
    } else {
      updates.executedBy = user.id;
      updates.executedAt = new Date();
    }
  }
  if (body.notes !== undefined) updates.notes = (body.notes as string).trim() || null;
  if (body.defectUrl !== undefined) updates.defectUrl = (body.defectUrl as string).trim() || null;

  await db.update(testResults).set(updates).where(eq(testResults.id, resultId));

  // Auto-transition run status
  const run = await db.select().from(testRuns).where(eq(testRuns.id, runId)).limit(1);
  if (run.length > 0 && run[0].status === 'planned' && body.status && body.status !== 'not_run') {
    await db.update(testRuns).set({ status: 'in_progress', startedAt: new Date(), updatedAt: new Date() }).where(eq(testRuns.id, runId));
  }

  if (returnTo === 'execute') {
    return c.redirect(`/projects/${projectId}/runs/${runId}/execute/${resultId}?saved=1`);
  }
  return c.redirect(`/projects/${projectId}/runs/${runId}`);
});

// --- Complete run ---
runRoutes.post('/:projectId/runs/:runId/complete', async (c) => {
  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');
  await db.update(testRuns).set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() }).where(eq(testRuns.id, runId));
  return c.redirect(`/projects/${projectId}/runs/${runId}`);
});

// --- Reopen run ---
runRoutes.post('/:projectId/runs/:runId/reopen', async (c) => {
  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');
  await db.update(testRuns).set({ status: 'in_progress', completedAt: null, updatedAt: new Date() }).where(eq(testRuns.id, runId));
  return c.redirect(`/projects/${projectId}/runs/${runId}`);
});

// --- Sync from suite (add new cases that aren't in the run yet) ---
runRoutes.post('/:projectId/runs/:runId/sync', async (c) => {
  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');

  const run = await db.select().from(testRuns).where(eq(testRuns.id, runId)).limit(1);
  if (run.length === 0 || !run[0].suiteId) return c.redirect(`/projects/${projectId}/runs/${runId}`);

  const existingCaseIds = await db
    .select({ testCaseId: testResults.testCaseId })
    .from(testResults)
    .where(eq(testResults.runId, runId));
  const existingIds = existingCaseIds.map((r) => r.testCaseId);

  const conditions: SQL[] = [eq(suiteTestCases.suiteId, run[0].suiteId)];
  if (existingIds.length > 0) conditions.push(notInArray(suiteTestCases.testCaseId, existingIds));

  const newCases = await db
    .select({ testCaseId: suiteTestCases.testCaseId })
    .from(suiteTestCases)
    .where(and(...conditions));

  if (newCases.length > 0) {
    await db.insert(testResults).values(
      newCases.map((sc) => ({ runId, testCaseId: sc.testCaseId, status: 'not_run' as const }))
    );
    await db.update(testRuns).set({ updatedAt: new Date() }).where(eq(testRuns.id, runId));
  }

  return c.redirect(`/projects/${projectId}/runs/${runId}`);
});

// --- Delete run ---
runRoutes.post('/:projectId/runs/:runId/delete', async (c) => {
  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');
  await db.delete(testRuns).where(eq(testRuns.id, runId));
  return c.redirect(`/projects/${projectId}/runs`);
});

export { runRoutes };

// ==================== Views ====================

type RunStats = { total: number; passed: number; failed: number; blocked: number; skipped: number; not_run: number };

const ProgressBar: FC<{ stats: RunStats }> = ({ stats }) => {
  if (stats.total === 0) return <div class="text-xs text-base-content/40">No test cases</div>;
  const executed = stats.total - stats.not_run;
  const pct = Math.round((executed / stats.total) * 100);
  const passedPct = (stats.passed / stats.total) * 100;
  const failedPct = (stats.failed / stats.total) * 100;
  const blockedPct = (stats.blocked / stats.total) * 100;
  const skippedPct = (stats.skipped / stats.total) * 100;

  return (
    <div>
      <div class="flex justify-between text-xs text-base-content/60 mb-1">
        <span>{executed} of {stats.total} executed</span>
        <span>{pct}%</span>
      </div>
      <div class="w-full bg-base-200 rounded-full h-2 flex overflow-hidden">
        {stats.passed > 0 && <div class="bg-success h-full" style={`width:${passedPct}%`} />}
        {stats.failed > 0 && <div class="bg-error h-full" style={`width:${failedPct}%`} />}
        {stats.blocked > 0 && <div class="bg-warning h-full" style={`width:${blockedPct}%`} />}
        {stats.skipped > 0 && <div class="bg-base-300 h-full" style={`width:${skippedPct}%`} />}
      </div>
      <div class="flex gap-3 mt-1.5 text-xs text-base-content/50 flex-wrap">
        {stats.passed > 0 && <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-success inline-block" />{stats.passed} passed</span>}
        {stats.failed > 0 && <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-error inline-block" />{stats.failed} failed</span>}
        {stats.blocked > 0 && <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-warning inline-block" />{stats.blocked} blocked</span>}
        {stats.skipped > 0 && <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-base-300 inline-block" />{stats.skipped} skipped</span>}
        {stats.not_run > 0 && <span>{stats.not_run} remaining</span>}
      </div>
    </div>
  );
};

type RunRow = {
  id: string; name: string; status: string; environment: string | null;
  createdAt: Date; startedAt: Date | null; completedAt: Date | null; suiteName: string | null;
  stats: RunStats;
};

type RunFilters = { search: string; status: string; sort: string; dir: string };

const RunSortHeader: FC<{ label: string; field: string; projectId: string; filters: RunFilters }> = ({ label, field, projectId, filters }) => {
  const isActive = filters.sort === field;
  const nextDir = isActive && filters.dir === 'desc' ? 'asc' : 'desc';
  const params = new URLSearchParams({ search: filters.search, status: filters.status, sort: field, dir: nextDir });
  return (
    <th class="cursor-pointer hover:bg-base-200 select-none">
      <a href={`/projects/${projectId}/runs?${params}`} class="flex items-center gap-1">
        {label}
        {isActive && (
          <svg xmlns="http://www.w3.org/2000/svg" class={`h-3 w-3 ${filters.dir === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
        )}
      </a>
    </th>
  );
};

const RunListView: FC<{ project: { id: string; name: string }; runs: RunRow[]; filters: RunFilters }> = ({ project, runs, filters }) => (
  <div>
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-2xl font-bold">Test Runs</h1>
        <p class="text-base-content/60 text-sm mt-1">{project.name} — {runs.length} run{runs.length !== 1 ? 's' : ''}</p>
      </div>
      <a href={`/projects/${project.id}/runs/new`} class="btn btn-primary btn-sm gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
        New Run
      </a>
    </div>

    {/* Search and filter bar */}
    <div class="flex gap-3 mb-4 items-center">
      <form method="get" action={`/projects/${project.id}/runs`} class="flex gap-3 items-center flex-1">
        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="dir" value={filters.dir} />
        <input type="text" name="search" value={filters.search} placeholder="Search runs..." class="input input-bordered input-sm w-64" />
        <select name="status" class="select select-bordered select-sm" onchange="this.form.submit()">
          <option value="">All Statuses</option>
          <option value="planned" selected={filters.status === 'planned'}>Planned</option>
          <option value="in_progress" selected={filters.status === 'in_progress'}>In Progress</option>
          <option value="completed" selected={filters.status === 'completed'}>Completed</option>
        </select>
        <button type="submit" class="btn btn-ghost btn-sm">Search</button>
        {(filters.search || filters.status) && (
          <a href={`/projects/${project.id}/runs`} class="btn btn-ghost btn-sm text-error">Clear</a>
        )}
      </form>
    </div>

    {runs.length === 0 ? (
      (filters.search || filters.status) ? (
        <div class="bg-base-100 rounded-box border border-base-300 p-8 text-center">
          <p class="text-base-content/50">No runs match your filters.</p>
          <a href={`/projects/${project.id}/runs`} class="btn btn-ghost btn-sm mt-2">Clear filters</a>
        </div>
      ) : (
        <EmptyState
          title="No test runs yet"
          description="Create a test run to start executing test cases from a suite."
          actionUrl={`/projects/${project.id}/runs/new`}
          actionLabel="Create Run"
        />
      )
    ) : (
      <div class="bg-base-100 rounded-box border border-base-300 overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="text-xs uppercase text-base-content/50">
              <RunSortHeader label="Name" field="name" projectId={project.id} filters={filters} />
              <th>Status</th>
              <th>Results</th>
              <th>Suite</th>
              <RunSortHeader label="Created" field="created_at" projectId={project.id} filters={filters} />
              <RunSortHeader label="Started" field="started_at" projectId={project.id} filters={filters} />
              <RunSortHeader label="Completed" field="completed_at" projectId={project.id} filters={filters} />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const passRate = r.stats.total > 0 ? Math.round((r.stats.passed / r.stats.total) * 100) : 0;
              return (
                <tr class="hover:bg-base-200 cursor-pointer" onclick={`window.location='/projects/${project.id}/runs/${r.id}'`}>
                  <td class="font-medium max-w-xs">
                    <a href={`/projects/${project.id}/runs/${r.id}`} class="link link-hover block truncate">{r.name}</a>
                    {r.environment && <span class="text-xs text-base-content/40">{r.environment}</span>}
                  </td>
                  <td><RunStatusBadge status={r.status} /></td>
                  <td>
                    <div class="flex items-center gap-2">
                      <div class="w-20 h-2 bg-base-300 rounded-full overflow-hidden flex">
                        {r.stats.passed > 0 && <div class="bg-success h-full" style={`width:${(r.stats.passed / r.stats.total) * 100}%`} />}
                        {r.stats.failed > 0 && <div class="bg-error h-full" style={`width:${(r.stats.failed / r.stats.total) * 100}%`} />}
                        {r.stats.blocked > 0 && <div class="bg-warning h-full" style={`width:${(r.stats.blocked / r.stats.total) * 100}%`} />}
                      </div>
                      <span class="text-xs text-base-content/50 whitespace-nowrap">
                        {r.stats.passed}/{r.stats.total}
                        {r.stats.failed > 0 && <span class="text-error ml-1">({r.stats.failed} fail)</span>}
                      </span>
                    </div>
                  </td>
                  <td class="text-sm text-base-content/60 max-w-[150px] truncate">{r.suiteName || <span class="italic text-base-content/30">—</span>}</td>
                  <td class="text-sm text-base-content/60 whitespace-nowrap">{r.createdAt.toLocaleDateString()}</td>
                  <td class="text-sm text-base-content/60 whitespace-nowrap">{r.startedAt ? r.startedAt.toLocaleDateString() : '—'}</td>
                  <td class="text-sm text-base-content/60 whitespace-nowrap">{r.completedAt ? r.completedAt.toLocaleDateString() : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

const NewRunView: FC<{ project: { id: string; name: string }; suites: { id: string; name: string; description: string | null; caseCount: number }[] }> = ({ project, suites }) => (
  <div class="max-w-lg">
    <h1 class="text-2xl font-bold mb-6">New Test Run</h1>

    {suites.length === 0 ? (
      <div class="alert alert-warning">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
        <span>No test suites found. <a href={`/projects/${project.id}/suites/new`} class="link">Create a suite</a> first.</span>
      </div>
    ) : (
      <form method="POST" action={`/projects/${project.id}/runs`}>
        <div class="space-y-4">
          <div class="form-control">
            <label class="label"><span class="label-text font-medium">Run Name *</span></label>
            <input type="text" name="name" placeholder="e.g., Regression v2.5, Sprint 12 Smoke" class="input input-bordered w-full" required autofocus />
          </div>
          <div class="form-control">
            <label class="label"><span class="label-text font-medium">Test Suite *</span></label>
            <input type="text" id="suite-search" placeholder="Search suites..." class="input input-bordered input-sm w-full mb-2" oninput="filterSuites(this.value)" />
            <div id="suite-cards" class="space-y-2 max-h-72 overflow-y-auto">
              {suites.map((s) => (
                <label class="suite-card flex items-start gap-3 p-3 rounded-lg border border-base-300 hover:bg-base-200 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5" data-name={s.name.toLowerCase()}>
                  <input type="radio" name="suiteId" value={s.id} class="radio radio-primary radio-sm mt-0.5" required />
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-sm">{s.name}</p>
                    {s.description && <p class="text-xs text-base-content/50 truncate">{s.description}</p>}
                    <p class="text-xs text-base-content/40 mt-0.5">{s.caseCount} test case{s.caseCount !== 1 ? 's' : ''}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div class="form-control">
            <label class="label"><span class="label-text font-medium">Environment</span></label>
            <input type="text" name="environment" placeholder="e.g., Staging, Production, iOS 17" class="input input-bordered w-full" />
          </div>
        </div>
        <div class="flex gap-3 pt-6">
          <button type="submit" class="btn btn-primary">Create Run</button>
          <a href={`/projects/${project.id}/runs`} class="btn btn-ghost">Cancel</a>
        </div>
      </form>
    )}

    <script dangerouslySetInnerHTML={{ __html: `
      function filterSuites(q) {
        var cards = document.querySelectorAll('.suite-card');
        var lower = q.toLowerCase();
        cards.forEach(function(c) {
          c.style.display = c.dataset.name.includes(lower) ? '' : 'none';
        });
      }
    ` }} />
  </div>
);

type ResultRow = {
  id: string; testCaseId: string; status: string; notes: string | null;
  defectUrl: string | null; executedAt: Date | null;
  tcTitle: string; tcPriority: string; tcXrayKey: string | null;
};

const statusBtnClass: Record<string, string> = {
  not_run: 'btn-ghost',
  passed: 'btn-success',
  failed: 'btn-error',
  blocked: 'btn-warning',
  skipped: 'btn-ghost',
};

function renderNotes(text: string): string {
  return marked.parse(text, { breaks: true, gfm: true }) as string;
}

const ResultCard: FC<{ result: ResultRow; projectId: string; runId: string; isLocked: boolean; index: number }> = ({ result, projectId, runId, isLocked, index }) => (
  <a href={`/projects/${projectId}/runs/${runId}/execute/${result.id}`} class="block bg-base-100 rounded-box border border-base-300 mb-2 hover:shadow-md transition-shadow">
    <div class="flex items-center gap-3 p-4">
      <span class="text-sm text-base-content/40 w-6 text-right">{index}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-medium text-sm truncate">{result.tcTitle}</span>
          <PriorityBadge priority={result.tcPriority} />
          {result.tcXrayKey && <span class="text-xs text-base-content/30">{result.tcXrayKey}</span>}
        </div>
      </div>
      <ResultStatusBadge status={result.status} />
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
    </div>
  </a>
);

type RunDetail = {
  id: string; name: string; status: string; environment: string | null;
  createdAt: Date; updatedAt: Date; startedAt: Date | null; completedAt: Date | null;
  suiteName: string | null; suiteId: string | null;
};

const RunDetailView: FC<{ project: { id: string; name: string }; run: RunDetail; results: ResultRow[]; stats: RunStats; statusFilter: string }> = ({ project, run, results, stats, statusFilter }) => {
  const isLocked = run.status === 'completed';
  const executed = stats.total - stats.not_run;
  return (
    <div class="max-w-4xl">
      <div class="flex justify-between items-start mb-4">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold">{run.name}</h1>
            <RunStatusBadge status={run.status} />
          </div>
          <div class="flex items-center gap-3 text-sm text-base-content/50 mt-1">
            {run.suiteName ? <span>Suite: {run.suiteName}</span> : <span class="italic text-base-content/40">No suite (imported)</span>}
            {run.environment && <span>Env: {run.environment}</span>}
          </div>
        </div>
        <div class="flex gap-2 flex-wrap justify-end">
          {run.status !== 'completed' && run.suiteId && (
            <form method="POST" action={`/projects/${project.id}/runs/${run.id}/sync`} onsubmit="return confirm('Sync new test cases from the suite into this run?')">
              <button type="submit" class="btn btn-ghost btn-sm gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Sync Suite
              </button>
            </form>
          )}
          {run.status !== 'completed' && executed > 0 && (
            <form method="POST" action={`/projects/${project.id}/runs/${run.id}/complete`} onsubmit={`return confirm('Complete this run? ${stats.not_run > 0 ? stats.not_run + ' test(s) are still not executed.' : 'All tests executed.'}')`}>
              <button type="submit" class="btn btn-success btn-sm gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                Complete Run
              </button>
            </form>
          )}
          {run.status === 'completed' && (
            <form method="POST" action={`/projects/${project.id}/runs/${run.id}/reopen`}>
              <button type="submit" class="btn btn-ghost btn-sm">Reopen</button>
            </form>
          )}
          <form method="POST" action={`/projects/${project.id}/runs/${run.id}/delete`} onsubmit="return confirm('Delete this run and all its results?')">
            <button type="submit" class="btn btn-ghost btn-sm text-error">Delete</button>
          </form>
        </div>
      </div>

      <div class="bg-base-100 rounded-box border border-base-300 p-4 mb-4">
        <ProgressBar stats={stats} />
      </div>

      {/* Status filter tabs */}
      <div class="tabs tabs-boxed bg-base-100 mb-4 p-1">
        <a href={`/projects/${project.id}/runs/${run.id}`} class={`tab tab-sm ${!statusFilter ? 'tab-active' : ''}`}>All ({stats.total})</a>
        <a href={`/projects/${project.id}/runs/${run.id}?status=not_run`} class={`tab tab-sm ${statusFilter === 'not_run' ? 'tab-active' : ''}`}>Not Run ({stats.not_run})</a>
        <a href={`/projects/${project.id}/runs/${run.id}?status=passed`} class={`tab tab-sm ${statusFilter === 'passed' ? 'tab-active' : ''}`}>Passed ({stats.passed})</a>
        <a href={`/projects/${project.id}/runs/${run.id}?status=failed`} class={`tab tab-sm ${statusFilter === 'failed' ? 'tab-active' : ''}`}>Failed ({stats.failed})</a>
        <a href={`/projects/${project.id}/runs/${run.id}?status=blocked`} class={`tab tab-sm ${statusFilter === 'blocked' ? 'tab-active' : ''}`}>Blocked ({stats.blocked})</a>
        <a href={`/projects/${project.id}/runs/${run.id}?status=skipped`} class={`tab tab-sm ${statusFilter === 'skipped' ? 'tab-active' : ''}`}>Skipped ({stats.skipped})</a>
      </div>

      {/* Results list */}
      {results.length === 0 ? (
        <div class="text-center py-8 text-base-content/40">
          <p class="text-sm">{statusFilter ? `No ${statusFilter.replace('_', ' ')} results.` : 'No test cases in this run.'}</p>
        </div>
      ) : (
        <div>
          {results.map((r, i) => (
            <ResultCard result={r} projectId={project.id} runId={run.id} isLocked={isLocked} index={i + 1} />
          ))}
        </div>
      )}

      <div class="bg-base-100 rounded-box border border-base-300 p-4 mt-4">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-base-content/50">
          <div><span class="font-medium text-base-content/70">Created</span><br/>{run.createdAt.toLocaleString()}</div>
          <div><span class="font-medium text-base-content/70">Last Updated</span><br/>{run.updatedAt.toLocaleString()}</div>
          <div><span class="font-medium text-base-content/70">Started</span><br/>{run.startedAt ? run.startedAt.toLocaleString() : '—'}</div>
          <div><span class="font-medium text-base-content/70">Completed</span><br/>{run.completedAt ? run.completedAt.toLocaleString() : '—'}</div>
        </div>
      </div>
    </div>
  );
};

// ==================== Execute View ====================

type ExecuteProps = {
  project: { id: string; name: string };
  run: { id: string; name: string; status: string };
  result: { id: string; testCaseId: string; status: string; notes: string | null; defectUrl: string | null };
  testCase: {
    id: string; title: string; description: string | null;
    preconditions: string | null; priority: string; type: string; status: string;
    tags: string[] | null; xrayKey: string | null;
  };
  steps: Array<{ id: string; stepNumber: number; action: string; data: string | null; expectedResult: string | null }>;
  currentIndex: number;
  totalCount: number;
  prevResultId: string | null;
  nextResultId: string | null;
};

const ExecuteView: FC<ExecuteProps> = ({ project, run, result, testCase, steps, currentIndex, totalCount, prevResultId, nextResultId }) => {
  const isLocked = run.status === 'completed';
  const baseUrl = `/projects/${project.id}/runs/${run.id}`;

  return (
    <div>
      {/* Navigation bar */}
      <div class="flex items-center justify-between mb-4">
        <a href={baseUrl} class="btn btn-ghost btn-sm gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to Run
        </a>
        <span class="text-sm text-base-content/50">{currentIndex + 1} of {totalCount}</span>
        <div class="flex gap-2">
          {prevResultId ? (
            <a href={`${baseUrl}/execute/${prevResultId}`} class="btn btn-ghost btn-sm">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Prev
            </a>
          ) : <span class="btn btn-ghost btn-sm btn-disabled">Prev</span>}
          {nextResultId ? (
            <a href={`${baseUrl}/execute/${nextResultId}`} class="btn btn-ghost btn-sm">
              Next
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
            </a>
          ) : <span class="btn btn-ghost btn-sm btn-disabled">Next</span>}
        </div>
      </div>

      {/* Test case header */}
      <div class="mb-4">
        <h1 class="text-xl font-bold">{testCase.title}</h1>
        <div class="flex items-center gap-2 mt-2">
          <PriorityBadge priority={testCase.priority} />
          <span class="badge badge-sm badge-outline">{testCase.type}</span>
          {testCase.xrayKey && <span class="badge badge-sm badge-info badge-outline">{testCase.xrayKey}</span>}
          {testCase.tags && testCase.tags.map((tag) => <span class="badge badge-sm badge-ghost">{tag}</span>)}
          <ResultStatusBadge status={result.status} />
        </div>
      </div>

      <div class="flex gap-6">
        {/* Left: Test case content — 70% */}
        <div class="w-[70%] min-w-0 space-y-4">
          {testCase.description && (
            <div class="bg-base-100 rounded-box border border-base-300 p-4">
              <h2 class="text-xs font-semibold text-base-content/50 uppercase mb-2">Description</h2>
              <p class="whitespace-pre-wrap text-sm">{testCase.description}</p>
            </div>
          )}

          {testCase.preconditions && (
            <div class="bg-base-100 rounded-box border border-base-300 p-4">
              <h2 class="text-xs font-semibold text-base-content/50 uppercase mb-2">Preconditions</h2>
              <p class="whitespace-pre-wrap text-sm">{testCase.preconditions}</p>
            </div>
          )}

          <div class="bg-base-100 rounded-box border border-base-300 p-4">
            <h2 class="text-xs font-semibold text-base-content/50 uppercase mb-3">
              Test Steps {steps.length > 0 && `(${steps.length})`}
            </h2>
            {steps.length === 0 ? (
              <p class="text-sm text-base-content/50">No steps defined.</p>
            ) : (
              <div class="space-y-3">
                {steps.map((step) => (
                  <div class="border border-base-300 rounded-lg p-3">
                    <div class="flex items-start gap-3">
                      <div class="badge badge-primary badge-sm mt-0.5">{step.stepNumber}</div>
                      <div class="flex-1 space-y-1.5">
                        <div>
                          <span class="text-xs font-semibold text-base-content/50 uppercase">Action</span>
                          <p class="whitespace-pre-wrap text-sm mt-0.5">{step.action}</p>
                        </div>
                        {step.data && (
                          <div>
                            <span class="text-xs font-semibold text-base-content/50 uppercase">Test Data</span>
                            <p class="whitespace-pre-wrap text-sm mt-0.5 bg-base-200 p-2 rounded">{step.data}</p>
                          </div>
                        )}
                        {step.expectedResult && (
                          <div>
                            <span class="text-xs font-semibold text-base-content/50 uppercase">Expected Result</span>
                            <p class="whitespace-pre-wrap text-sm mt-0.5">{step.expectedResult}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Result panel — 30% */}
        <div class="w-[30%] shrink-0">
          <div id="result-panel" class="bg-base-100 rounded-box border border-base-300 p-4 sticky top-4 space-y-4">
            <h2 class="text-xs font-semibold text-base-content/50 uppercase">Result</h2>

            {!isLocked ? (
              <>
                <div class="flex flex-wrap gap-2">
                  {['passed', 'failed', 'blocked', 'skipped', 'not_run'].map((s) => (
                    <form method="POST" action={`${baseUrl}/results/${result.id}`} class="inline">
                      <input type="hidden" name="status" value={s} />
                      <input type="hidden" name="returnTo" value="execute" />
                      <button type="submit" class={`btn btn-sm ${result.status === s ? statusBtnClass[s] : 'btn-outline ' + statusBtnClass[s]}`}>
                        {s === 'not_run' ? 'Reset' : s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    </form>
                  ))}
                </div>

                {result.notes && (
                  <div>
                    <span class="text-xs font-medium text-base-content/50">Saved comments</span>
                    <div class="text-sm mt-1 prose prose-sm max-w-none bg-base-200 rounded-lg p-3" dangerouslySetInnerHTML={{ __html: renderNotes(result.notes) }} />
                  </div>
                )}

                <form id="notes-form" method="POST" action={`${baseUrl}/results/${result.id}`} class="space-y-3">
                  <input type="hidden" name="returnTo" value="execute" />
                  <div class="form-control">
                    <label class="label py-0"><span class="label-text text-xs">{result.notes ? 'Edit comments' : 'Comments'}</span></label>
                    <textarea id="notes-editor" name="notes">{result.notes || ''}</textarea>
                  </div>
                  <div class="form-control">
                    <label class="label py-0"><span class="label-text text-xs">GitHub Issue</span></label>
                    <input type="text" name="defectUrl" value={result.defectUrl || ''} placeholder="https://github.com/..." class="input input-bordered input-sm w-full text-xs" />
                  </div>
                  <button type="submit" class="btn btn-primary btn-sm w-full">Save</button>
                </form>
                <script dangerouslySetInnerHTML={{ __html: `
                  document.addEventListener('DOMContentLoaded', function() {
                    var ta = document.getElementById('notes-editor');
                    if (typeof EasyMDE !== 'undefined' && ta) {
                      var mde = new EasyMDE({
                        element: ta,
                        spellChecker: false,
                        status: false,
                        toolbar: ['bold', 'italic', 'strikethrough', '|', 'unordered-list', 'ordered-list', '|', 'code', 'quote', '|', 'table', 'link', '|', 'preview'],
                        placeholder: 'Add comments...',
                        minHeight: '100px',
                      });
                      var form = document.getElementById('notes-form');
                      var submitting = false;
                      form.addEventListener('submit', function(e) {
                        if (!submitting) {
                          e.preventDefault();
                          ta.value = mde.value();
                          submitting = true;
                          form.submit();
                        }
                      });
                    }
                  });
                ` }} />
              </>
            ) : (
              <div class="space-y-3">
                <div><ResultStatusBadge status={result.status} /></div>
                {result.notes && (
                  <div>
                    <span class="text-xs font-medium text-base-content/50">Comments</span>
                    <div class="text-sm mt-1 prose prose-sm" dangerouslySetInnerHTML={{ __html: renderNotes(result.notes) }} />
                  </div>
                )}
                {result.defectUrl && (
                  <div>
                    <span class="text-xs font-medium text-base-content/50">Bug Link</span>
                    <a href={result.defectUrl} target="_blank" class="text-sm link link-primary block mt-0.5 truncate">{result.defectUrl}</a>
                  </div>
                )}
                {!result.notes && !result.defectUrl && <p class="text-xs text-base-content/40">No comments or links.</p>}
              </div>
            )}

            {/* Quick nav to next */}
            {!isLocked && nextResultId && (
              <a href={`${baseUrl}/execute/${nextResultId}`} class="btn btn-ghost btn-sm w-full gap-1">
                Next Test Case
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
              </a>
            )}
          </div>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: `
        document.addEventListener('DOMContentLoaded', function() {
          if (window.location.search.indexOf('saved=1') !== -1) {
            var toast = document.getElementById('toast-container');
            if (toast) {
              toast.innerHTML = '<div class="alert alert-success shadow-lg text-sm py-2 px-4"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg><span>Saved</span></div>';
              setTimeout(function() { toast.innerHTML = ''; }, 3000);
            }
            history.replaceState(null, '', window.location.pathname);
            var panel = document.getElementById('result-panel');
            if (panel) panel.scrollIntoView({ block: 'start' });
          }
        });
      ` }} />
    </div>
  );
};
