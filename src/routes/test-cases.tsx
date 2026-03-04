import { Hono } from 'hono';
import { db } from '../db/index.js';
import { testCases, testSteps, projects, folders } from '../db/schema.js';
import { eq, desc, asc, ilike, and, count, sql, isNull, inArray, type SQL } from 'drizzle-orm';
import { Layout, type Breadcrumb } from '../views/layout.js';
import { TestCaseListView } from '../views/test-cases/list.js';
import { TestCaseFormView } from '../views/test-cases/form.js';
import { TestCaseDetailView } from '../views/test-cases/detail.js';
import { type FolderNode } from '../views/test-cases/folder-tree.js';
import { type AuthEnv, requireEditor, requireAdmin } from '../middleware/auth.js';

const testCaseRoutes = new Hono<AuthEnv>();

async function buildFolderTree(projectId: string): Promise<{ tree: FolderNode[]; flat: typeof allFolders; rootCount: number; totalCount: number }> {
  const allFolders = await db.select().from(folders).where(eq(folders.projectId, projectId));

  const folderCounts = await db
    .select({ folderId: testCases.folderId, count: count() })
    .from(testCases)
    .where(eq(testCases.projectId, projectId))
    .groupBy(testCases.folderId);

  const countMap = new Map<string | null, number>();
  let totalCount = 0;
  for (const row of folderCounts) {
    countMap.set(row.folderId, row.count);
    totalCount += row.count;
  }
  const rootCount = countMap.get(null) || 0;

  const nodeMap = new Map<string, FolderNode>();
  for (const f of allFolders) {
    nodeMap.set(f.id, { id: f.id, name: f.name, path: f.path, children: [], testCount: countMap.get(f.id) || 0 });
  }

  const tree: FolderNode[] = [];
  for (const f of allFolders) {
    const node = nodeMap.get(f.id)!;
    if (f.parentId && nodeMap.has(f.parentId)) {
      nodeMap.get(f.parentId)!.children.push(node);
    } else {
      tree.push(node);
    }
  }

  tree.sort((a, b) => a.name.localeCompare(b.name));
  const sortChildren = (nodes: FolderNode[]) => {
    for (const n of nodes) {
      n.children.sort((a, b) => a.name.localeCompare(b.name));
      sortChildren(n.children);
    }
  };
  sortChildren(tree);

  return { tree, flat: allFolders, rootCount, totalCount };
}

testCaseRoutes.get('/:projectId/test-cases', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const search = c.req.query('search') || '';
  const priority = c.req.query('priority') || '';
  const type = c.req.query('type') || '';
  const status = c.req.query('status') || '';
  const folderFilter = c.req.query('folder') || '';
  const subfolders = c.req.query('subfolders') === 'true';
  const sortBy = c.req.query('sort') || 'updated_at';
  const sortDir = c.req.query('dir') || 'desc';
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(Math.max(parseInt(c.req.query('pageSize') || '25'), 10), 100);

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const conditions: SQL[] = [eq(testCases.projectId, projectId)];
  if (search) conditions.push(ilike(testCases.title, `%${search}%`));
  if (priority) conditions.push(eq(testCases.priority, priority as any));
  if (type) conditions.push(eq(testCases.type, type as any));
  if (status) conditions.push(eq(testCases.status, status as any));

  if (folderFilter === 'root') {
    conditions.push(isNull(testCases.folderId));
  } else if (folderFilter) {
    if (subfolders) {
      const allProjectFolders = await db.select().from(folders).where(eq(folders.projectId, projectId));
      const descendantIds = getDescendantIds(folderFilter, allProjectFolders);
      const idsToMatch = [folderFilter, ...descendantIds];
      conditions.push(inArray(testCases.folderId, idsToMatch));
    } else {
      conditions.push(eq(testCases.folderId, folderFilter));
    }
  }

  const where = and(...conditions);

  const [totalResult] = await db.select({ count: count() }).from(testCases).where(where);
  const total = totalResult.count;
  const totalPages = Math.ceil(total / pageSize);

  const sortColumn = sortBy === 'title' ? testCases.title
    : sortBy === 'priority' ? testCases.priority
    : sortBy === 'status' ? testCases.status
    : sortBy === 'type' ? testCases.type
    : sortBy === 'created_at' ? testCases.createdAt
    : testCases.updatedAt;
  const orderFn = sortDir === 'asc' ? asc : desc;

  const rawCases = await db
    .select({
      id: testCases.id,
      title: testCases.title,
      priority: testCases.priority,
      type: testCases.type,
      status: testCases.status,
      tags: testCases.tags,
      xrayKey: testCases.xrayKey,
      createdAt: testCases.createdAt,
      updatedAt: testCases.updatedAt,
      folderId: testCases.folderId,
    })
    .from(testCases)
    .where(where)
    .orderBy(orderFn(sortColumn))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const caseIds = rawCases.map((c) => c.id);
  let stepCountMap = new Map<string, number>();
  if (caseIds.length > 0) {
    const stepCounts = await db
      .select({ testCaseId: testSteps.testCaseId, count: count() })
      .from(testSteps)
      .where(inArray(testSteps.testCaseId, caseIds))
      .groupBy(testSteps.testCaseId);
    stepCountMap = new Map(stepCounts.map((r) => [r.testCaseId, r.count]));
  }
  const cases = rawCases.map((c) => ({ ...c, stepCount: stepCountMap.get(c.id) || 0 }));

  const { tree: folderTree, rootCount, totalCount } = await buildFolderTree(projectId);

  const isHtmx = c.req.header('HX-Request') === 'true';
  const content = (
    <TestCaseListView
      project={project[0]}
      testCases={cases}
      total={total}
      page={page}
      totalPages={totalPages}
      pageSize={pageSize}
      filters={{ search, priority, type, status, sort: sortBy, dir: sortDir, folder: folderFilter, subfolders: subfolders ? 'true' : '', pageSize: String(pageSize) }}
      folderTree={folderTree}
      activeFolderId={folderFilter || null}
      rootCount={rootCount}
      totalCount={totalCount}
    />
  );

  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };

  if (isHtmx) {
    return c.html(content);
  }

  return c.html(
    <Layout title={`Test Cases — ${project[0].name}`} user={user} activeProject={activeProject} activePage="test-cases" breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project[0].name, href: `/projects/${projectId}` }, { label: "Test Cases" }]}>
      {content}
    </Layout>
  );
});

function getDescendantIds(parentId: string, allFolders: { id: string; parentId: string | null }[]): string[] {
  const children = allFolders.filter((f) => f.parentId === parentId);
  const result: string[] = [];
  for (const child of children) {
    result.push(child.id);
    result.push(...getDescendantIds(child.id, allFolders));
  }
  return result;
}

testCaseRoutes.get('/:projectId/test-cases/new', requireEditor, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const projectFolders = await db.select().from(folders).where(eq(folders.projectId, projectId));
  const preselectedFolder = c.req.query('folder') || '';

  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
  return c.html(
    <Layout title={`New Test Case — ${project[0].name}`} user={user} activeProject={activeProject} activePage="test-cases" breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project[0].name, href: `/projects/${projectId}` }, { label: "Test Cases", href: `/projects/${projectId}/test-cases` }, { label: "New" }]}>
      <TestCaseFormView project={project[0]} folders={projectFolders} preselectedFolderId={preselectedFolder} />
    </Layout>
  );
});

testCaseRoutes.post('/:projectId/test-cases', requireEditor, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const body = await c.req.parseBody({ all: true });
  const title = (body.title as string || '').trim();
  const description = (body.description as string || '').trim();
  const preconditions = (body.preconditions as string || '').trim();
  const priority = body.priority as string || 'medium';
  const type = body.type as string || 'functional';
  const status = body.status as string || 'draft';
  const folderId = (body.folderId as string || '').trim() || null;
  const tagsStr = (body.tags as string || '').trim();
  const tags = tagsStr ? tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

  const stepActions = Array.isArray(body['step_action']) ? body['step_action'] as string[] : body['step_action'] ? [body['step_action'] as string] : [];
  const stepData = Array.isArray(body['step_data']) ? body['step_data'] as string[] : body['step_data'] ? [body['step_data'] as string] : [];
  const stepExpected = Array.isArray(body['step_expected']) ? body['step_expected'] as string[] : body['step_expected'] ? [body['step_expected'] as string] : [];

  if (!title) {
    const projectFolders = await db.select().from(folders).where(eq(folders.projectId, projectId));
    const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
    return c.html(
      <Layout title="New Test Case" user={user} activeProject={activeProject} activePage="test-cases" breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project[0].name, href: `/projects/${projectId}` }, { label: "Test Cases", href: `/projects/${projectId}/test-cases` }, { label: "New" }]}>
        <TestCaseFormView project={project[0]} folders={projectFolders} error="Title is required" values={body as any} />
      </Layout>
    );
  }

  const [tc] = await db.insert(testCases).values({
    projectId,
    title,
    description: description || null,
    preconditions: preconditions || null,
    priority: priority as any,
    type: type as any,
    status: status as any,
    tags: tags.length > 0 ? tags : null,
    folderId,
    createdBy: user.id,
  }).returning();

  const steps = stepActions
    .map((action, i) => ({
      testCaseId: tc.id,
      stepNumber: i + 1,
      action: (action || '').trim(),
      data: (stepData[i] || '').trim() || null,
      expectedResult: (stepExpected[i] || '').trim() || null,
    }))
    .filter((s) => s.action);

  if (steps.length > 0) {
    await db.insert(testSteps).values(steps);
  }

  return c.redirect(`/projects/${projectId}/test-cases/${tc.id}?toast=Test case created`);
});

testCaseRoutes.get('/:projectId/test-cases/:caseId', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const caseId = c.req.param('caseId');

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const tc = await db.select().from(testCases).where(eq(testCases.id, caseId)).limit(1);
  if (tc.length === 0) return c.notFound();

  const steps = await db.select().from(testSteps).where(eq(testSteps.testCaseId, caseId)).orderBy(asc(testSteps.stepNumber));

  let folderPath: string | null = null;
  if (tc[0].folderId) {
    const f = await db.select().from(folders).where(eq(folders.id, tc[0].folderId)).limit(1);
    if (f.length > 0) folderPath = f[0].path;
  }

  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };

  return c.html(
    <Layout title={`${tc[0].title} — ${project[0].name}`} user={user} activeProject={activeProject} activePage="test-cases" breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project[0].name, href: `/projects/${projectId}` }, { label: "Test Cases", href: `/projects/${projectId}/test-cases` }, { label: tc[0].title }]}>
      <TestCaseDetailView project={project[0]} testCase={tc[0]} steps={steps} folderPath={folderPath} />
    </Layout>
  );
});

testCaseRoutes.get('/:projectId/test-cases/:caseId/edit', requireEditor, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const caseId = c.req.param('caseId');

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const tc = await db.select().from(testCases).where(eq(testCases.id, caseId)).limit(1);
  if (tc.length === 0) return c.notFound();

  const steps = await db.select().from(testSteps).where(eq(testSteps.testCaseId, caseId)).orderBy(asc(testSteps.stepNumber));
  const projectFolders = await db.select().from(folders).where(eq(folders.projectId, projectId));
  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };

  return c.html(
    <Layout title={`Edit — ${tc[0].title}`} user={user} activeProject={activeProject} activePage="test-cases" breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project[0].name, href: `/projects/${projectId}` }, { label: "Test Cases", href: `/projects/${projectId}/test-cases` }, { label: tc[0].title, href: `/projects/${projectId}/test-cases/${caseId}` }, { label: "Edit" }]}>
      <TestCaseFormView project={project[0]} testCase={tc[0]} existingSteps={steps} folders={projectFolders} />
    </Layout>
  );
});

testCaseRoutes.post('/:projectId/test-cases/:caseId', requireEditor, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const caseId = c.req.param('caseId');

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const body = await c.req.parseBody({ all: true });
  const title = (body.title as string || '').trim();
  const description = (body.description as string || '').trim();
  const preconditions = (body.preconditions as string || '').trim();
  const priority = body.priority as string || 'medium';
  const type = body.type as string || 'functional';
  const status = body.status as string || 'draft';
  const folderId = (body.folderId as string || '').trim() || null;
  const tagsStr = (body.tags as string || '').trim();
  const tags = tagsStr ? tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

  const stepActions = Array.isArray(body['step_action']) ? body['step_action'] as string[] : body['step_action'] ? [body['step_action'] as string] : [];
  const stepData = Array.isArray(body['step_data']) ? body['step_data'] as string[] : body['step_data'] ? [body['step_data'] as string] : [];
  const stepExpected = Array.isArray(body['step_expected']) ? body['step_expected'] as string[] : body['step_expected'] ? [body['step_expected'] as string] : [];

  if (!title) {
    const tc = await db.select().from(testCases).where(eq(testCases.id, caseId)).limit(1);
    const projectFolders = await db.select().from(folders).where(eq(folders.projectId, projectId));
    const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
    return c.html(
      <Layout title="Edit Test Case" user={user} activeProject={activeProject} activePage="test-cases" breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project[0].name, href: `/projects/${projectId}` }, { label: "Test Cases", href: `/projects/${projectId}/test-cases` }, { label: tc[0].title, href: `/projects/${projectId}/test-cases/${caseId}` }, { label: "Edit" }]}>
        <TestCaseFormView project={project[0]} testCase={tc[0]} folders={projectFolders} error="Title is required" values={body as any} />
      </Layout>
    );
  }

  await db.update(testCases).set({
    title,
    description: description || null,
    preconditions: preconditions || null,
    priority: priority as any,
    type: type as any,
    status: status as any,
    tags: tags.length > 0 ? tags : null,
    folderId,
    updatedAt: new Date(),
  }).where(eq(testCases.id, caseId));

  await db.delete(testSteps).where(eq(testSteps.testCaseId, caseId));

  const steps = stepActions
    .map((action, i) => ({
      testCaseId: caseId,
      stepNumber: i + 1,
      action: (action || '').trim(),
      data: (stepData[i] || '').trim() || null,
      expectedResult: (stepExpected[i] || '').trim() || null,
    }))
    .filter((s) => s.action);

  if (steps.length > 0) {
    await db.insert(testSteps).values(steps);
  }

  return c.redirect(`/projects/${projectId}/test-cases/${caseId}?toast=Test case updated`);
});

testCaseRoutes.post('/:projectId/test-cases/:caseId/delete', requireAdmin, async (c) => {
  const projectId = c.req.param('projectId');
  const caseId = c.req.param('caseId');
  await db.delete(testCases).where(eq(testCases.id, caseId));
  return c.redirect(`/projects/${projectId}/test-cases?toast=Test case deleted`);
});

testCaseRoutes.post('/:projectId/test-cases/bulk-delete', requireAdmin, async (c) => {
  const projectId = c.req.param('projectId');
  const body = await c.req.parseBody({ all: true });
  const ids = Array.isArray(body.ids) ? body.ids as string[] : body.ids ? [body.ids as string] : [];
  if (ids.length > 0) {
    await db.delete(testSteps).where(inArray(testSteps.testCaseId, ids));
    await db.delete(testCases).where(and(eq(testCases.projectId, projectId), inArray(testCases.id, ids)));
  }
  return c.redirect(`/projects/${projectId}/test-cases?toast=Test cases deleted`);
});

testCaseRoutes.post('/:projectId/test-cases/bulk-status', requireEditor, async (c) => {
  const projectId = c.req.param('projectId');
  const body = await c.req.parseBody({ all: true });
  const ids = Array.isArray(body.ids) ? body.ids as string[] : body.ids ? [body.ids as string] : [];
  const status = body.status as string;
  if (ids.length > 0 && ['draft', 'active', 'deprecated'].includes(status)) {
    await db.update(testCases).set({ status: status as any, updatedAt: new Date() }).where(and(eq(testCases.projectId, projectId), inArray(testCases.id, ids)));
  }
  return c.redirect(`/projects/${projectId}/test-cases?toast=Status updated`);
});

testCaseRoutes.post('/:projectId/test-cases/:caseId/duplicate', requireEditor, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const caseId = c.req.param('caseId');

  const original = await db.select().from(testCases).where(eq(testCases.id, caseId)).limit(1);
  if (original.length === 0) return c.notFound();

  const [copy] = await db.insert(testCases).values({
    projectId,
    title: `${original[0].title} (Copy)`,
    description: original[0].description,
    preconditions: original[0].preconditions,
    priority: original[0].priority,
    type: original[0].type,
    status: 'draft',
    tags: original[0].tags,
    folderId: original[0].folderId,
    createdBy: user.id,
  }).returning();

  const originalSteps = await db.select().from(testSteps).where(eq(testSteps.testCaseId, caseId)).orderBy(asc(testSteps.stepNumber));
  if (originalSteps.length > 0) {
    await db.insert(testSteps).values(
      originalSteps.map((s) => ({
        testCaseId: copy.id,
        stepNumber: s.stepNumber,
        action: s.action,
        data: s.data,
        expectedResult: s.expectedResult,
      }))
    );
  }

  return c.redirect(`/projects/${projectId}/test-cases/${copy.id}?toast=Test case duplicated`);
});

export { testCaseRoutes };
