import { Hono } from 'hono';
import { db } from '../db/index.js';
import { folders, projects, testCases } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import type { AuthEnv } from '../middleware/auth.js';

const folderRoutes = new Hono<AuthEnv>();

folderRoutes.post('/:projectId/folders', async (c) => {
  const projectId = c.req.param('projectId');
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0) return c.notFound();

  const body = await c.req.parseBody();
  const name = (body.name as string || '').trim();
  const parentId = (body.parentId as string || '').trim() || null;

  if (!name) {
    return c.redirect(`/projects/${projectId}/test-cases`);
  }

  let path = `/${name}`;
  if (parentId) {
    const parent = await db.select().from(folders).where(eq(folders.id, parentId)).limit(1);
    if (parent.length > 0) {
      path = `${parent[0].path}/${name}`;
    }
  }

  await db.insert(folders).values({ projectId, parentId, name, path });
  return c.redirect(`/projects/${projectId}/test-cases`);
});

folderRoutes.post('/:projectId/folders/:folderId/rename', async (c) => {
  const projectId = c.req.param('projectId');
  const folderId = c.req.param('folderId');
  const body = await c.req.parseBody();
  const name = (body.name as string || '').trim();

  if (!name) {
    return c.redirect(`/projects/${projectId}/test-cases`);
  }

  const folder = await db.select().from(folders).where(eq(folders.id, folderId)).limit(1);
  if (folder.length === 0) return c.notFound();

  const oldPath = folder[0].path;
  const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
  const newPath = parentPath ? `${parentPath}/${name}` : `/${name}`;

  await db.update(folders).set({ name, path: newPath, updatedAt: new Date() }).where(eq(folders.id, folderId));

  // Update child folder paths
  const allFolders = await db.select().from(folders).where(eq(folders.projectId, projectId));
  for (const child of allFolders) {
    if (child.path.startsWith(oldPath + '/')) {
      const updatedPath = newPath + child.path.substring(oldPath.length);
      await db.update(folders).set({ path: updatedPath, updatedAt: new Date() }).where(eq(folders.id, child.id));
    }
  }

  return c.redirect(`/projects/${projectId}/test-cases?folder=${folderId}`);
});

folderRoutes.post('/:projectId/folders/:folderId/move', async (c) => {
  const projectId = c.req.param('projectId');
  const folderId = c.req.param('folderId');
  const body = await c.req.parseBody();
  const newParentId = (body.parentId as string || '').trim() || null;

  const folder = await db.select().from(folders).where(eq(folders.id, folderId)).limit(1);
  if (folder.length === 0) return c.notFound();

  if (newParentId === folderId) {
    return c.redirect(`/projects/${projectId}/test-cases?folder=${folderId}`);
  }

  const allProjectFolders = await db.select().from(folders).where(eq(folders.projectId, projectId));
  const descendants = getDescendantIds(folderId, allProjectFolders);
  if (newParentId && descendants.includes(newParentId)) {
    return c.redirect(`/projects/${projectId}/test-cases?folder=${folderId}`);
  }

  let newPath: string;
  if (newParentId) {
    const parent = await db.select().from(folders).where(eq(folders.id, newParentId)).limit(1);
    newPath = parent.length > 0 ? `${parent[0].path}/${folder[0].name}` : `/${folder[0].name}`;
  } else {
    newPath = `/${folder[0].name}`;
  }

  const oldPath = folder[0].path;
  await db.update(folders).set({ parentId: newParentId, path: newPath, updatedAt: new Date() }).where(eq(folders.id, folderId));

  for (const child of allProjectFolders) {
    if (child.path.startsWith(oldPath + '/')) {
      const updatedPath = newPath + child.path.substring(oldPath.length);
      await db.update(folders).set({ path: updatedPath, updatedAt: new Date() }).where(eq(folders.id, child.id));
    }
  }

  return c.redirect(`/projects/${projectId}/test-cases?folder=${folderId}`);
});

folderRoutes.post('/:projectId/folders/:folderId/delete', async (c) => {
  const projectId = c.req.param('projectId');
  const folderId = c.req.param('folderId');

  const folder = await db.select().from(folders).where(eq(folders.id, folderId)).limit(1);
  if (folder.length === 0) return c.notFound();

  // Move test cases in this folder (and child folders) to unfiled
  const allFolders = await db.select().from(folders).where(eq(folders.projectId, projectId));
  const descendantIds = getDescendantIds(folderId, allFolders);
  const folderIdsToDelete = [folderId, ...descendantIds];

  for (const id of folderIdsToDelete) {
    await db.update(testCases).set({ folderId: null }).where(eq(testCases.folderId, id));
    await db.delete(folders).where(eq(folders.id, id));
  }

  return c.redirect(`/projects/${projectId}/test-cases`);
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

export { folderRoutes };
