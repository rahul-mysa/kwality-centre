import { Hono } from 'hono';
import { db } from '../db/index.js';
import { projects, testCases, testRuns, testResults, testSuites } from '../db/schema.js';
import { desc, count, eq, sql, and } from 'drizzle-orm';
import { Layout, type Breadcrumb } from '../views/layout.js';
import { DashboardView } from '../views/dashboard.js';
import type { AuthEnv } from '../middleware/auth.js';

const dashboardRoutes = new Hono<AuthEnv>();

dashboardRoutes.get('/', async (c) => {
  const user = c.get('user');

  const rawProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .orderBy(desc(projects.updatedAt));

  const caseCounts = await db.select({ projectId: testCases.projectId, count: count() }).from(testCases).groupBy(testCases.projectId);
  const caseMap = new Map(caseCounts.map((r) => [r.projectId, r.count]));

  const runCounts = await db.select({ projectId: testRuns.projectId, count: count() }).from(testRuns).groupBy(testRuns.projectId);
  const runMap = new Map(runCounts.map((r) => [r.projectId, r.count]));

  const suiteCounts = await db.select({ projectId: testSuites.projectId, count: count() }).from(testSuites).groupBy(testSuites.projectId);
  const suiteMap = new Map(suiteCounts.map((r) => [r.projectId, r.count]));

  const allProjects = rawProjects.map((p) => ({
    ...p,
    testCaseCount: caseMap.get(p.id) || 0,
    suiteCount: suiteMap.get(p.id) || 0,
    runCount: runMap.get(p.id) || 0,
  }));

  const recentRuns = await db
    .select({
      id: testRuns.id,
      name: testRuns.name,
      status: testRuns.status,
      projectId: testRuns.projectId,
      projectName: projects.name,
      environment: testRuns.environment,
      createdAt: testRuns.createdAt,
    })
    .from(testRuns)
    .innerJoin(projects, eq(testRuns.projectId, projects.id))
    .orderBy(desc(testRuns.createdAt))
    .limit(10);

  const [totals] = await db.select({ count: count() }).from(testCases);
  const [totalRuns] = await db.select({ count: count() }).from(testRuns);

  const resultStats = await db
    .select({ status: testResults.status, count: count() })
    .from(testResults)
    .groupBy(testResults.status);
  const resultBreakdown: Record<string, number> = {};
  for (const r of resultStats) resultBreakdown[r.status] = r.count;

  const runTrend = await db
    .select({
      runId: testRuns.id,
      runName: testRuns.name,
      createdAt: testRuns.createdAt,
      status: testResults.status,
      count: count(),
    })
    .from(testRuns)
    .innerJoin(testResults, eq(testResults.runId, testRuns.id))
    .groupBy(testRuns.id, testRuns.name, testRuns.createdAt, testResults.status)
    .orderBy(desc(testRuns.createdAt))
    .limit(200);

  const runTrendMap = new Map<string, { name: string; date: string; passed: number; failed: number; total: number }>();
  for (const r of runTrend) {
    if (!runTrendMap.has(r.runId)) {
      runTrendMap.set(r.runId, { name: r.runName, date: r.createdAt.toLocaleDateString(), passed: 0, failed: 0, total: 0 });
    }
    const entry = runTrendMap.get(r.runId)!;
    entry.total += r.count;
    if (r.status === 'passed') entry.passed += r.count;
    if (r.status === 'failed') entry.failed += r.count;
  }
  const trendData = [...runTrendMap.values()].reverse().slice(-20);

  return c.html(
    <Layout title="Dashboard" user={user} activePage="dashboard">
      <DashboardView
        projects={allProjects}
        recentRuns={recentRuns}
        totalTestCases={totals.count}
        totalRuns={totalRuns.count}
        resultBreakdown={resultBreakdown}
        trendData={trendData}
      />
    </Layout>
  );
});

dashboardRoutes.get('/api/sidebar-projects', async (c) => {
  const allProjects = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(projects.name);

  if (allProjects.length === 0) return c.html(<div></div>);

  return c.html(
    <div class="mt-4 border-t border-base-300 pt-4">
      <p class="text-xs font-semibold uppercase text-base-content/50 px-3 mb-2">Projects</p>
      <ul class="menu menu-sm gap-1">
        {allProjects.map((p) => (
          <li>
            <a href={`/projects/${p.id}`} class="flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
              {p.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
});

export { dashboardRoutes };
