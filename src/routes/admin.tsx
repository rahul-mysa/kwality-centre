import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { Layout } from '../views/layout.js';
import { type AuthEnv, requireAdmin } from '../middleware/auth.js';
import type { FC } from 'hono/jsx';

const adminRoutes = new Hono<AuthEnv>();

adminRoutes.use('*', requireAdmin);

type UserRow = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: 'admin' | 'editor' | 'viewer';
  lastLoginAt: Date;
};

const RoleBadge: FC<{ role: string }> = ({ role }) => {
  const colors: Record<string, string> = {
    admin: 'badge-error',
    editor: 'badge-info',
    viewer: 'badge-ghost',
  };
  return <span class={`badge badge-sm ${colors[role] || 'badge-ghost'}`}>{role}</span>;
};

const UserManagementView: FC<{ users: UserRow[]; currentUserId: string }> = ({ users: allUsers, currentUserId }) => (
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Manage Users</h1>
        <p class="text-sm text-base-content/60 mt-1">Control who can view, edit, or administer Kwality Centre</p>
      </div>
    </div>

    <div class="bg-base-100 rounded-lg border border-base-300">
      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="bg-base-200/50">
              <th>User</th>
              <th>Email</th>
              <th>Current Role</th>
              <th>Last Login</th>
              <th class="w-48">Change Role</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.map((u) => (
              <tr key={u.id} class="hover:bg-base-200/30">
                <td>
                  <div class="flex items-center gap-2">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt="" class="w-8 h-8 rounded-full" />
                    ) : (
                      <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span class="font-medium">{u.name}</span>
                  </div>
                </td>
                <td class="text-sm text-base-content/70">{u.email}</td>
                <td><RoleBadge role={u.role} /></td>
                <td class="text-sm text-base-content/60">
                  {u.lastLoginAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td>
                  {u.id === currentUserId ? (
                    <span class="text-xs text-base-content/40 italic">You (cannot change)</span>
                  ) : (
                    <form method="post" action={`/admin/users/${u.id}/role`} class="flex items-center gap-2">
                      <select name="role" class="select select-bordered select-xs w-28">
                        <option value="viewer" selected={u.role === 'viewer'}>Viewer</option>
                        <option value="editor" selected={u.role === 'editor'}>Editor</option>
                        <option value="admin" selected={u.role === 'admin'}>Admin</option>
                      </select>
                      <button type="submit" class="btn btn-xs btn-primary">Save</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div class="mt-6 bg-base-100 rounded-lg border border-base-300 p-4">
      <h3 class="font-semibold mb-2">Role Permissions</h3>
      <div class="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p class="font-medium flex items-center gap-2"><RoleBadge role="viewer" /> Viewer</p>
          <ul class="mt-1 text-base-content/60 space-y-0.5 ml-4 list-disc">
            <li>View all projects, test cases, runs</li>
            <li>Cannot create, edit, or delete anything</li>
          </ul>
        </div>
        <div>
          <p class="font-medium flex items-center gap-2"><RoleBadge role="editor" /> Editor</p>
          <ul class="mt-1 text-base-content/60 space-y-0.5 ml-4 list-disc">
            <li>Everything a Viewer can do</li>
            <li>Create & edit projects, test cases, suites</li>
            <li>Create & execute test runs</li>
          </ul>
        </div>
        <div>
          <p class="font-medium flex items-center gap-2"><RoleBadge role="admin" /> Admin</p>
          <ul class="mt-1 text-base-content/60 space-y-0.5 ml-4 list-disc">
            <li>Everything an Editor can do</li>
            <li>Delete projects, test cases, suites, runs</li>
            <li>Import from Xray</li>
            <li>Manage user roles</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
);

adminRoutes.get('/users', async (c) => {
  const user = c.get('user');

  const allUsers = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    avatarUrl: users.avatarUrl,
    role: users.role,
    lastLoginAt: users.lastLoginAt,
  })
    .from(users)
    .orderBy(asc(users.name));

  return c.html(
    <Layout title="Manage Users" user={user} activePage="admin-users" breadcrumbs={[{ label: "Admin" }, { label: "Users" }]}>
      <UserManagementView users={allUsers} currentUserId={user.id} />
    </Layout>
  );
});

adminRoutes.post('/users/:userId/role', async (c) => {
  const userId = c.req.param('userId');
  const currentUser = c.get('user');
  const body = await c.req.parseBody();
  const newRole = body.role as string;

  if (!['admin', 'editor', 'viewer'].includes(newRole)) {
    return c.redirect('/admin/users');
  }

  if (userId === currentUser.id) {
    return c.redirect('/admin/users');
  }

  const targetUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (targetUser.length === 0) {
    return c.redirect('/admin/users');
  }

  await db.update(users)
    .set({ role: newRole as 'admin' | 'editor' | 'viewer' })
    .where(eq(users.id, userId));

  return c.redirect(`/admin/users?toast=${encodeURIComponent(`Updated ${targetUser[0].name} to ${newRole}`)}`);
});

export { adminRoutes };
