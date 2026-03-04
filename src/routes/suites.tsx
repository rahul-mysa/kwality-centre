import { Hono } from 'hono';
import { db } from '../db/index.js';
import { testSuites, suiteTestCases, testCases, testSteps, projects, folders } from '../db/schema.js';
import { eq, desc, asc, count, sql, ilike, and, notInArray, inArray, isNull, type SQL } from 'drizzle-orm';
import { Layout } from '../views/layout.js';
import { type AuthEnv, requireEditor, requireAdmin } from '../middleware/auth.js';
import { PriorityBadge, StatusBadge } from '../views/components/badge.js';
import { EmptyState } from '../views/components/empty-state.js';
import type { FC } from 'hono/jsx';

const suiteRoutes = new Hono<AuthEnv>();

// --- List all suites ---
suiteRoutes.get('/:projectId/suites', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const rawSuites = await db
    .select({
      id: testSuites.id,
      name: testSuites.name,
      description: testSuites.description,
      createdAt: testSuites.createdAt,
    })
    .from(testSuites)
    .where(eq(testSuites.projectId, projectId))
    .orderBy(desc(testSuites.updatedAt));

  const caseCounts = await db
    .select({ suiteId: suiteTestCases.suiteId, count: count() })
    .from(suiteTestCases)
    .groupBy(suiteTestCases.suiteId);
  const countMap = new Map(caseCounts.map((r) => [r.suiteId, r.count]));

  const suites = rawSuites.map((s) => ({ ...s, caseCount: countMap.get(s.id) || 0 }));

  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
  return c.html(
    <Layout title={`Suites — ${project[0].name}`} user={user} activeProject={activeProject} activePage="suites" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Suites' }]}>
      <SuiteListView project={project[0]} suites={suites} />
    </Layout>
  );
});

// --- New suite form ---
suiteRoutes.get('/:projectId/suites/new', requireEditor, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
  return c.html(
    <Layout title={`New Suite — ${project[0].name}`} user={user} activeProject={activeProject} activePage="suites" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Suites', href: `/projects/${projectId}/suites` }, { label: 'New' }]}>
      <SuiteFormView project={project[0]} />
    </Layout>
  );
});

// --- Create suite ---
suiteRoutes.post('/:projectId/suites', requireEditor, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const body = await c.req.parseBody();
  const name = (body.name as string || '').trim();
  const description = (body.description as string || '').trim();

  if (!name) {
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
    return c.html(
      <Layout title="New Suite" user={user} activeProject={activeProject} activePage="suites" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Suites', href: `/projects/${projectId}/suites` }, { label: 'New' }]}>
        <SuiteFormView project={project[0]} error="Name is required" />
      </Layout>
    );
  }

  const [suite] = await db.insert(testSuites).values({
    projectId, name, description: description || null, createdBy: user.id,
  }).returning();

  return c.redirect(`/projects/${projectId}/suites/${suite.id}?toast=Suite created`);
});

// --- Suite detail ---
suiteRoutes.get('/:projectId/suites/:suiteId', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const suiteId = c.req.param('suiteId');

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const suite = await db.select().from(testSuites).where(eq(testSuites.id, suiteId)).limit(1);
  if (suite.length === 0) return c.notFound();

  const cases = await db
    .select({
      id: testCases.id,
      title: testCases.title,
      priority: testCases.priority,
      type: testCases.type,
      status: testCases.status,
      xrayKey: testCases.xrayKey,
      position: suiteTestCases.position,
      stcId: suiteTestCases.id,
      stepCount: sql<number>`(SELECT COUNT(*) FROM test_steps WHERE test_steps.test_case_id = ${testCases.id})`.as('step_count'),
    })
    .from(suiteTestCases)
    .innerJoin(testCases, eq(testCases.id, suiteTestCases.testCaseId))
    .where(eq(suiteTestCases.suiteId, suiteId))
    .orderBy(asc(suiteTestCases.position));

  const folderTree = await buildFolderTree(projectId);

  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
  return c.html(
    <Layout title={`${suite[0].name} — ${project[0].name}`} user={user} activeProject={activeProject} activePage="suites" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Suites', href: `/projects/${projectId}/suites` }, { label: suite[0].name }]}>
      <SuiteDetailView project={project[0]} suite={suite[0]} cases={cases} folderTree={folderTree} />
    </Layout>
  );
});

// --- Folder test cases for suite picker (HTMX partial) ---
suiteRoutes.get('/:projectId/suites/:suiteId/folder-cases/:folderId', async (c) => {
  const projectId = c.req.param('projectId');
  const suiteId = c.req.param('suiteId');
  const folderId = c.req.param('folderId');

  const existingIds = await db
    .select({ testCaseId: suiteTestCases.testCaseId })
    .from(suiteTestCases)
    .where(eq(suiteTestCases.suiteId, suiteId));
  const excludeIds = existingIds.map((r) => r.testCaseId);

  const conditions: SQL[] = [eq(testCases.projectId, projectId)];
  if (folderId === 'unfiled') {
    conditions.push(isNull(testCases.folderId));
  } else {
    conditions.push(eq(testCases.folderId, folderId));
  }

  const results = await db
    .select({ id: testCases.id, title: testCases.title, priority: testCases.priority, xrayKey: testCases.xrayKey })
    .from(testCases)
    .where(and(...conditions))
    .orderBy(asc(testCases.title));

  const available = results.filter((tc) => !excludeIds.includes(tc.id));
  const inSuiteIds = new Set(excludeIds);

  return c.html(
    <div class="pl-6 space-y-0.5">
      {results.length === 0 ? (
        <p class="text-xs text-base-content/40 py-1 pl-2">Empty folder</p>
      ) : (
        results.map((tc) => {
          const alreadyIn = inSuiteIds.has(tc.id);
          return (
            <div
              class={`flex items-center gap-2 py-1 px-2 rounded text-xs ${alreadyIn ? 'opacity-40' : 'hover:bg-base-200 cursor-grab'}`}
              draggable={!alreadyIn ? 'true' : undefined}
              data-tc-id={!alreadyIn ? tc.id : undefined}
              onDragStart={!alreadyIn ? `event.dataTransfer.setData('text/plain', '${tc.id}')` : undefined}
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 shrink-0 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              <span class="flex-1 truncate">{tc.title}</span>
              {alreadyIn && <span class="badge badge-xs badge-ghost">in suite</span>}
              {tc.xrayKey && <span class="text-base-content/30">{tc.xrayKey}</span>}
            </div>
          );
        })
      )}
    </div>
  );
});

// --- Edit suite form ---
suiteRoutes.get('/:projectId/suites/:suiteId/edit', requireEditor, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const suiteId = c.req.param('suiteId');

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();
  const suite = await db.select().from(testSuites).where(eq(testSuites.id, suiteId)).limit(1);
  if (suite.length === 0) return c.notFound();

  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
  return c.html(
    <Layout title={`Edit — ${suite[0].name}`} user={user} activeProject={activeProject} activePage="suites" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Suites', href: `/projects/${projectId}/suites` }, { label: suite[0].name, href: `/projects/${projectId}/suites/${suiteId}` }, { label: 'Edit' }]}>
      <SuiteFormView project={project[0]} suite={suite[0]} />
    </Layout>
  );
});

// --- Update suite ---
suiteRoutes.post('/:projectId/suites/:suiteId', requireEditor, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const suiteId = c.req.param('suiteId');
  const body = await c.req.parseBody();
  const name = (body.name as string || '').trim();
  const description = (body.description as string || '').trim();

  if (!name) {
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const suite = await db.select().from(testSuites).where(eq(testSuites.id, suiteId)).limit(1);
    const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
    return c.html(
      <Layout title="Edit Suite" user={user} activeProject={activeProject} activePage="suites" breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project[0].name, href: `/projects/${projectId}` }, { label: 'Suites', href: `/projects/${projectId}/suites` }, { label: suite[0].name, href: `/projects/${projectId}/suites/${suiteId}` }, { label: 'Edit' }]}>
        <SuiteFormView project={project[0]} suite={suite[0]} error="Name is required" />
      </Layout>
    );
  }

  await db.update(testSuites).set({ name, description: description || null, updatedAt: new Date() }).where(eq(testSuites.id, suiteId));
  return c.redirect(`/projects/${projectId}/suites/${suiteId}?toast=Suite updated`);
});

// --- Delete suite ---
suiteRoutes.post('/:projectId/suites/:suiteId/delete', requireAdmin, async (c) => {
  const projectId = c.req.param('projectId');
  const suiteId = c.req.param('suiteId');
  await db.delete(testSuites).where(eq(testSuites.id, suiteId));
  return c.redirect(`/projects/${projectId}/suites?toast=Suite deleted`);
});

// --- Search test cases to add (HTMX partial) ---
suiteRoutes.get('/:projectId/suites/:suiteId/search-cases', async (c) => {
  const projectId = c.req.param('projectId');
  const suiteId = c.req.param('suiteId');
  const q = c.req.query('q') || '';

  const existingIds = await db
    .select({ testCaseId: suiteTestCases.testCaseId })
    .from(suiteTestCases)
    .where(eq(suiteTestCases.suiteId, suiteId));
  const excludeIds = existingIds.map((r) => r.testCaseId);

  const conditions: SQL[] = [eq(testCases.projectId, projectId)];
  if (q) conditions.push(ilike(testCases.title, `%${q}%`));
  if (excludeIds.length > 0) conditions.push(notInArray(testCases.id, excludeIds));

  const results = await db
    .select({ id: testCases.id, title: testCases.title, priority: testCases.priority, xrayKey: testCases.xrayKey })
    .from(testCases)
    .where(and(...conditions))
    .orderBy(asc(testCases.title))
    .limit(20);

  return c.html(
    <div>
      {results.length === 0 ? (
        <p class="text-sm text-base-content/50 p-3">No matching test cases found.</p>
      ) : (
        results.map((tc) => (
          <form method="POST" action={`/projects/${projectId}/suites/${suiteId}/add-case`} class="flex items-center gap-3 p-2 hover:bg-base-200 rounded-lg">
            <input type="hidden" name="testCaseId" value={tc.id} />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{tc.title}</p>
              <div class="flex items-center gap-2 mt-0.5">
                <PriorityBadge priority={tc.priority} />
                {tc.xrayKey && <span class="text-xs text-base-content/40">{tc.xrayKey}</span>}
              </div>
            </div>
            <button type="submit" class="btn btn-ghost btn-xs btn-circle editor-action">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
            </button>
          </form>
        ))
      )}
    </div>
  );
});

// --- Add test case to suite ---
suiteRoutes.post('/:projectId/suites/:suiteId/add-case', requireEditor, async (c) => {
  const projectId = c.req.param('projectId');
  const suiteId = c.req.param('suiteId');
  const body = await c.req.parseBody();
  const testCaseId = body.testCaseId as string;

  const [maxPos] = await db
    .select({ max: sql<number>`COALESCE(MAX(${suiteTestCases.position}), 0)` })
    .from(suiteTestCases)
    .where(eq(suiteTestCases.suiteId, suiteId));

  await db.insert(suiteTestCases).values({
    suiteId, testCaseId, position: (maxPos.max || 0) + 1,
  });

  await db.update(testSuites).set({ updatedAt: new Date() }).where(eq(testSuites.id, suiteId));
  return c.redirect(`/projects/${projectId}/suites/${suiteId}`);
});

// --- Remove test cases from suite (supports multiple) ---
suiteRoutes.post('/:projectId/suites/:suiteId/remove-cases', requireEditor, async (c) => {
  const projectId = c.req.param('projectId');
  const suiteId = c.req.param('suiteId');
  const body = await c.req.parseBody({ all: true });
  const ids = Array.isArray(body['stcId']) ? body['stcId'] as string[] : body['stcId'] ? [body['stcId'] as string] : [];

  if (ids.length > 0) {
    await db.delete(suiteTestCases).where(inArray(suiteTestCases.id, ids));
    await db.update(testSuites).set({ updatedAt: new Date() }).where(eq(testSuites.id, suiteId));
  }
  return c.redirect(`/projects/${projectId}/suites/${suiteId}`);
});

export { suiteRoutes };

// ============ Helpers ============

type FolderTreeNode = { id: string; name: string; path: string; children: FolderTreeNode[]; testCount: number };

async function buildFolderTree(projectId: string): Promise<FolderTreeNode[]> {
  const allFolders = await db
    .select({
      id: folders.id,
      name: folders.name,
      path: folders.path,
      parentId: folders.parentId,
      testCount: sql<number>`(SELECT COUNT(*) FROM test_cases WHERE test_cases.folder_id = ${folders.id})`.as('test_count'),
    })
    .from(folders)
    .where(eq(folders.projectId, projectId))
    .orderBy(asc(folders.path));

  const nodeMap = new Map<string, FolderTreeNode>();
  for (const f of allFolders) {
    nodeMap.set(f.id, { id: f.id, name: f.name, path: f.path, children: [], testCount: Number(f.testCount) });
  }
  const roots: FolderTreeNode[] = [];
  for (const f of allFolders) {
    const node = nodeMap.get(f.id)!;
    if (f.parentId && nodeMap.has(f.parentId)) {
      nodeMap.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// ============ Views ============

type SuiteRow = { id: string; name: string; description: string | null; createdAt: Date; caseCount: number };

const SuiteListView: FC<{ project: { id: string; name: string }; suites: SuiteRow[] }> = ({ project, suites }) => (
  <div>
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-2xl font-bold">Test Suites</h1>
        <p class="text-base-content/60 text-sm mt-1">{project.name} — {suites.length} suite{suites.length !== 1 ? 's' : ''}</p>
      </div>
      <a href={`/projects/${project.id}/suites/new`} class="btn btn-primary btn-sm gap-2 editor-action">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
        New Suite
      </a>
    </div>

    {suites.length === 0 ? (
      <EmptyState
        title="No test suites yet"
        description="Create a suite to group test cases for execution."
        actionUrl={`/projects/${project.id}/suites/new`}
        actionLabel="Create Suite"
      />
    ) : (
      <div class="bg-base-100 rounded-box border border-base-300 overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="text-xs uppercase text-base-content/50">
              <th>Name</th>
              <th>Test Cases</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {suites.map((s) => (
              <tr class="hover:bg-base-200 cursor-pointer" onclick={`window.location='/projects/${project.id}/suites/${s.id}'`}>
                <td class="max-w-sm">
                  <a href={`/projects/${project.id}/suites/${s.id}`} class="link link-hover font-medium block truncate">{s.name}</a>
                  {s.description && <span class="text-xs text-base-content/50 line-clamp-1">{s.description}</span>}
                </td>
                <td class="text-sm text-base-content/70">{s.caseCount}</td>
                <td class="text-sm text-base-content/60 whitespace-nowrap">{s.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

const SuiteFormView: FC<{ project: { id: string; name: string }; suite?: { id: string; name: string; description: string | null }; error?: string }> = ({ project, suite, error }) => {
  const isEdit = !!suite;
  return (
    <div class="max-w-lg">
      <h1 class="text-2xl font-bold mb-6">{isEdit ? 'Edit Suite' : 'New Suite'}</h1>

      {error && (
        <div class="alert alert-error mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          <span>{error}</span>
        </div>
      )}

      <form method="POST" action={isEdit ? `/projects/${project.id}/suites/${suite.id}` : `/projects/${project.id}/suites`}>
        <div class="space-y-4">
          <div class="form-control">
            <label class="label"><span class="label-text font-medium">Name *</span></label>
            <input type="text" name="name" value={suite?.name || ''} placeholder="e.g., Smoke Tests, Regression Suite" class="input input-bordered w-full" required autofocus />
          </div>
          <div class="form-control">
            <label class="label"><span class="label-text font-medium">Description</span></label>
            <textarea name="description" placeholder="What does this suite cover?" class="textarea textarea-bordered w-full h-20">{suite?.description || ''}</textarea>
          </div>
        </div>
        <div class="flex gap-3 pt-6">
          <button type="submit" class="btn btn-primary">{isEdit ? 'Update Suite' : 'Create Suite'}</button>
          <a href={isEdit ? `/projects/${project.id}/suites/${suite.id}` : `/projects/${project.id}/suites`} class="btn btn-ghost">Cancel</a>
        </div>
      </form>
    </div>
  );
};

type SuiteCase = { id: string; title: string; priority: string; type: string; status: string; xrayKey: string | null; position: number; stcId: string; stepCount: number };

const SuiteDetailView: FC<{ project: { id: string; name: string }; suite: { id: string; name: string; description: string | null; createdAt: Date; updatedAt: Date }; cases: SuiteCase[]; folderTree: FolderTreeNode[] }> = ({ project, suite, cases, folderTree }) => (
  <div>
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold">{suite.name}</h1>
        {suite.description && <p class="text-base-content/60 mt-1">{suite.description}</p>}
        <p class="text-xs text-base-content/40 mt-2">{cases.length} test case{cases.length !== 1 ? 's' : ''} in this suite</p>
      </div>
      <div class="flex gap-2">
        <a href={`/projects/${project.id}/suites/${suite.id}/edit`} class="btn btn-ghost btn-sm editor-action">Edit</a>
        <form method="POST" action={`/projects/${project.id}/suites/${suite.id}/delete`} onsubmit="return confirm('Delete this suite? Test cases will not be deleted.')">
          <button type="submit" class="btn btn-ghost btn-sm text-error admin-action">Delete</button>
        </form>
      </div>
    </div>

    <div class="flex gap-4">
      {/* Left: Suite test cases (drop zone) */}
      <div class="flex-1 min-w-0">
        {/* Search bar */}
        <div class="bg-base-100 rounded-box shadow-sm border border-base-300 p-4 mb-4">
          <div class="form-control">
            <input
              type="text"
              placeholder="Search test cases to add..."
              class="input input-bordered input-sm w-full"
              hx-get={`/projects/${project.id}/suites/${suite.id}/search-cases`}
              hx-trigger="keyup changed delay:300ms"
              hx-target="#search-results"
              hx-swap="innerHTML"
              name="q"
            />
          </div>
          <div id="search-results" class="mt-2 max-h-48 overflow-y-auto"></div>
        </div>

        {/* Suite cases table */}
        <div
          id="suite-drop-zone"
          class="bg-base-100 rounded-box shadow-sm border-2 border-base-300 p-5 transition-colors"
        >
          <h2 class="text-sm font-semibold text-base-content/50 uppercase mb-4">
            Suite Cases ({cases.length})
            <span id="drop-hint" class="hidden ml-2 text-primary font-normal normal-case">Drop here to add</span>
          </h2>

          {cases.length === 0 ? (
            <div class="text-center py-8 text-base-content/40">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              <p class="text-sm">Drag test cases from the folder tree, or use search above.</p>
            </div>
          ) : (
            <form id="suite-cases-form" method="POST" action={`/projects/${project.id}/suites/${suite.id}/remove-cases`}>
              <div class="flex items-center gap-2 mb-3">
                <button
                  type="submit"
                  id="remove-selected-btn"
                  class="btn btn-error btn-sm btn-outline gap-1 hidden editor-action"
                  onclick="return confirm('Remove selected test cases from this suite?')"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Remove selected (<span id="selected-count">0</span>)
                </button>
              </div>
              <div class="overflow-x-auto">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th class="w-10"><input type="checkbox" class="checkbox checkbox-sm" id="select-all" /></th>
                      <th class="w-8">#</th>
                      <th>Title</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Steps</th>
                      <th>Xray</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map((tc, i) => (
                      <tr class="hover">
                        <td><input type="checkbox" class="checkbox checkbox-sm stc-checkbox" name="stcId" value={tc.stcId} /></td>
                        <td class="text-base-content/40">{i + 1}</td>
                        <td class="font-medium">
                          <a href={`/projects/${project.id}/test-cases/${tc.id}`} class="link link-hover line-clamp-1">{tc.title}</a>
                        </td>
                        <td><PriorityBadge priority={tc.priority} /></td>
                        <td><StatusBadge status={tc.status} /></td>
                        <td class="text-base-content/60">{tc.stepCount}</td>
                        <td class="text-base-content/60 text-xs">{tc.xrayKey || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </form>
          )}
        </div>

        <div class="text-xs text-base-content/40 mt-4">
          Created {suite.createdAt.toLocaleDateString()} · Updated {suite.updatedAt.toLocaleDateString()}
        </div>
      </div>

      {/* Right: Folder tree browser */}
      <div class="w-80 shrink-0 hidden lg:block">
        <div class="bg-base-100 rounded-box shadow-sm border border-base-300 p-3 sticky top-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
          <h3 class="text-xs font-semibold uppercase text-base-content/50 px-2 mb-2">Browse Test Cases</h3>
          <ul class="space-y-0.5">
            <SuiteFolderItem
              node={{ id: 'unfiled', name: 'Unfiled', path: '', children: [], testCount: 0 }}
              projectId={project.id}
              suiteId={suite.id}
              depth={0}
              isSpecial
            />
            {folderTree.length > 0 && <li class="border-t border-base-200 my-1" />}
            {folderTree.map((f) => (
              <SuiteFolderItem node={f} projectId={project.id} suiteId={suite.id} depth={0} />
            ))}
          </ul>
        </div>
      </div>
    </div>

    {/* Drag-and-drop + checkbox selection script */}
    <script dangerouslySetInnerHTML={{ __html: `
      (function() {
        var zone = document.getElementById('suite-drop-zone');
        var hint = document.getElementById('drop-hint');
        var addUrl = '/projects/${project.id}/suites/${suite.id}/add-case';
        zone.addEventListener('dragover', function(e) {
          e.preventDefault();
          zone.classList.add('border-primary', 'bg-primary/5');
          zone.classList.remove('border-base-300');
          hint.classList.remove('hidden');
        });
        zone.addEventListener('dragleave', function(e) {
          if (zone.contains(e.relatedTarget)) return;
          zone.classList.remove('border-primary', 'bg-primary/5');
          zone.classList.add('border-base-300');
          hint.classList.add('hidden');
        });
        zone.addEventListener('drop', function(e) {
          e.preventDefault();
          zone.classList.remove('border-primary', 'bg-primary/5');
          zone.classList.add('border-base-300');
          hint.classList.add('hidden');
          var tcId = e.dataTransfer.getData('text/plain');
          if (!tcId) return;
          var form = new FormData();
          form.append('testCaseId', tcId);
          fetch(addUrl, { method: 'POST', body: form, redirect: 'follow' })
            .then(function() { window.location.reload(); });
        });

        var selectAll = document.getElementById('select-all');
        var btn = document.getElementById('remove-selected-btn');
        var countEl = document.getElementById('selected-count');
        var boxes = document.querySelectorAll('.stc-checkbox');
        function updateBtn() {
          var checked = document.querySelectorAll('.stc-checkbox:checked').length;
          if (checked > 0) { btn.classList.remove('hidden'); } else { btn.classList.add('hidden'); }
          countEl.textContent = checked;
          if (selectAll) selectAll.checked = checked === boxes.length && boxes.length > 0;
        }
        if (selectAll) {
          selectAll.addEventListener('change', function() {
            boxes.forEach(function(cb) { cb.checked = selectAll.checked; });
            updateBtn();
          });
        }
        boxes.forEach(function(cb) { cb.addEventListener('change', updateBtn); });
      })();
    ` }} />
  </div>
);

const SuiteFolderItem: FC<{ node: FolderTreeNode; projectId: string; suiteId: string; depth: number; isSpecial?: boolean }> = ({ node, projectId, suiteId, depth, isSpecial }) => {
  const hasChildren = node.children.length > 0;
  const casesUrl = `/projects/${projectId}/suites/${suiteId}/folder-cases/${node.id}`;
  const paddingLeft = `${depth * 14 + 8}px`;

  return (
    <li>
      <details
        hx-get={casesUrl}
        hx-target={`#folder-cases-${node.id}`}
        hx-trigger="toggle once"
        hx-swap="innerHTML"
      >
        <summary
          class="flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer text-sm hover:bg-base-200"
          style={`padding-left: ${paddingLeft}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            {isSpecial
              ? <path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
              : <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            }
          </svg>
          <span class="flex-1 truncate">{node.name}</span>
          {node.testCount > 0 && <span class="badge badge-xs badge-ghost">{node.testCount}</span>}
        </summary>
        <div id={`folder-cases-${node.id}`}>
          <p class="text-xs text-base-content/30 pl-8 py-1">Loading...</p>
        </div>
        {hasChildren && (
          <ul class="space-y-0.5">
            {node.children.map((child) => (
              <SuiteFolderItem node={child} projectId={projectId} suiteId={suiteId} depth={depth + 1} />
            ))}
          </ul>
        )}
      </details>
    </li>
  );
};
