import { Hono } from 'hono';
import { db } from '../db/index.js';
import { projects, testCases, testRuns, testSuites } from '../db/schema.js';
import { eq, desc, count, sql } from 'drizzle-orm';
import { Layout, type Breadcrumb } from '../views/layout.js';
import { ProjectListView } from '../views/projects/list.js';
import { ProjectFormView } from '../views/projects/form.js';
import { ProjectDetailView } from '../views/projects/detail.js';
import { type AuthEnv, requireEditor, requireAdmin } from '../middleware/auth.js';

const projectRoutes = new Hono<AuthEnv>();

projectRoutes.get('/', async (c) => {
  const user = c.get('user');
  const rawProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .orderBy(desc(projects.updatedAt));

  const caseCounts = await db.select({ projectId: testCases.projectId, count: count() }).from(testCases).groupBy(testCases.projectId);
  const caseMap = new Map(caseCounts.map((r) => [r.projectId, r.count]));

  const suiteCounts = await db.select({ projectId: testSuites.projectId, count: count() }).from(testSuites).groupBy(testSuites.projectId);
  const suiteMap = new Map(suiteCounts.map((r) => [r.projectId, r.count]));

  const runCounts = await db.select({ projectId: testRuns.projectId, count: count() }).from(testRuns).groupBy(testRuns.projectId);
  const runMap = new Map(runCounts.map((r) => [r.projectId, r.count]));

  const allProjects = rawProjects.map((p) => ({
    ...p,
    testCaseCount: caseMap.get(p.id) || 0,
    suiteCount: suiteMap.get(p.id) || 0,
    runCount: runMap.get(p.id) || 0,
  }));

  return c.html(
    <Layout title="Projects" user={user} activePage="projects" breadcrumbs={[{ label: "Projects" }]}>
      <ProjectListView projects={allProjects} />
    </Layout>
  );
});

projectRoutes.get('/new', requireEditor, (c) => {
  const user = c.get('user');
  return c.html(
    <Layout title="New Project" user={user} activePage="projects" breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "New Project" }]}>
      <ProjectFormView />
    </Layout>
  );
});

projectRoutes.post('/', requireEditor, async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();
  const name = (body.name as string || '').trim();
  const description = (body.description as string || '').trim();
  const githubOwner = (body.githubOwner as string || '').trim() || null;
  const githubRepo = (body.githubRepo as string || '').trim() || null;
  const githubBranch = (body.githubBranch as string || '').trim() || null;
  const githubTestPath = (body.githubTestPath as string || '').trim() || null;

  if (!name) {
    return c.html(
      <Layout title="New Project" user={user} activePage="projects" breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "New Project" }]}>
        <ProjectFormView error="Project name is required" values={{ name, description, githubOwner: githubOwner || '', githubRepo: githubRepo || '', githubBranch: githubBranch || 'main', githubTestPath: githubTestPath || '' }} />
      </Layout>
    );
  }

  const [project] = await db.insert(projects).values({
    name,
    description: description || null,
    githubOwner,
    githubRepo,
    githubBranch: githubBranch || 'main',
    githubTestPath,
    createdBy: user.id,
  }).returning();

  return c.redirect(`/projects/${project.id}?toast=Project created`);
});

projectRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

  if (project.length === 0) {
    return c.notFound();
  }

  const [caseCount] = await db.select({ count: count() }).from(testCases).where(eq(testCases.projectId, projectId));
  const [runCount] = await db.select({ count: count() }).from(testRuns).where(eq(testRuns.projectId, projectId));

  const recentRuns = await db
    .select()
    .from(testRuns)
    .where(eq(testRuns.projectId, projectId))
    .orderBy(desc(testRuns.createdAt))
    .limit(5);

  const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
  return c.html(
    <Layout title={project[0].name} user={user} activeProject={activeProject} activePage="overview" breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project[0].name }]}>
      <ProjectDetailView
        project={project[0]}
        testCaseCount={caseCount.count}
        runCount={runCount.count}
        recentRuns={recentRuns}
      />
    </Layout>
  );
});

projectRoutes.get('/:id/edit', requireEditor, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

  if (project.length === 0) {
    return c.notFound();
  }

  const p = project[0];
  const activeProject = { id: p.id, name: p.name, hasGithub: !!(p.githubOwner && p.githubRepo && p.githubTestPath) };
  return c.html(
    <Layout title={`Edit ${p.name}`} user={user} activeProject={activeProject} activePage="overview" breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: p.name, href: `/projects/${projectId}` }, { label: "Edit" }]}>
      <ProjectFormView
        project={p}
        values={{ name: p.name, description: p.description || '', githubOwner: p.githubOwner || '', githubRepo: p.githubRepo || '', githubBranch: p.githubBranch || 'main', githubTestPath: p.githubTestPath || '' }}
      />
    </Layout>
  );
});

projectRoutes.post('/:id', requireEditor, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');
  const body = await c.req.parseBody();
  const name = (body.name as string || '').trim();
  const description = (body.description as string || '').trim();
  const githubOwner = (body.githubOwner as string || '').trim() || null;
  const githubRepo = (body.githubRepo as string || '').trim() || null;
  const githubBranch = (body.githubBranch as string || '').trim() || null;
  const githubTestPath = (body.githubTestPath as string || '').trim() || null;

  if (!name) {
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const activeProject = { id: project[0].id, name: project[0].name, hasGithub: !!(project[0].githubOwner && project[0].githubRepo && project[0].githubTestPath) };
    return c.html(
      <Layout title="Edit Project" user={user} activeProject={activeProject} activePage="overview" breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project[0].name, href: `/projects/${projectId}` }, { label: "Edit" }]}>
        <ProjectFormView
          project={project[0]}
          error="Project name is required"
          values={{ name, description, githubOwner: githubOwner || '', githubRepo: githubRepo || '', githubBranch: githubBranch || 'main', githubTestPath: githubTestPath || '' }}
        />
      </Layout>
    );
  }

  await db.update(projects)
    .set({ name, description: description || null, githubOwner, githubRepo, githubBranch: githubBranch || 'main', githubTestPath, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  return c.redirect(`/projects/${projectId}?toast=Project updated`);
});

projectRoutes.post('/:id/delete', requireAdmin, async (c) => {
  const projectId = c.req.param('id');
  await db.delete(projects).where(eq(projects.id, projectId));
  return c.redirect('/projects?toast=Project deleted');
});

export { projectRoutes };
