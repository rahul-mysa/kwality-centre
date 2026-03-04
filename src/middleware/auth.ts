import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import * as jose from 'jose';
import type { User, UserRole } from '../views/layout.js';

export type AuthEnv = {
  Variables: {
    user: User;
  };
};

const getSecret = () => new TextEncoder().encode(process.env.SESSION_SECRET || 'dev-secret-change-me');

export async function createSessionToken(user: User): Promise<string> {
  return new jose.SignJWT({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<User | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      avatarUrl: (payload.avatarUrl as string) || null,
      role: (payload.role as UserRole) || 'viewer',
    };
  } catch {
    return null;
  }
}

const DEV_USER: User = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'dev@kwality.local',
  name: 'Dev User',
  avatarUrl: null,
  role: 'admin',
};

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  if (process.env.NODE_ENV !== 'production' && !process.env.GOOGLE_CLIENT_ID) {
    c.set('user', DEV_USER);
    await next();
    return;
  }

  const token = getCookie(c, 'session');

  if (!token) {
    return c.redirect('/auth/login');
  }

  const user = await verifySessionToken(token);
  if (!user) {
    return c.redirect('/auth/login');
  }

  c.set('user', user);
  await next();
});

export const requireEditor = createMiddleware<AuthEnv>(async (c, next) => {
  const user = c.get('user');
  if (user.role === 'viewer') {
    return c.html('<div class="p-8 text-center"><h2 class="text-xl font-bold text-error">Access Denied</h2><p class="mt-2 text-base-content/60">You need Editor or Admin access to perform this action.</p><a href="/" class="btn btn-sm btn-primary mt-4">Go Home</a></div>', 403);
  }
  await next();
});

export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.html('<div class="p-8 text-center"><h2 class="text-xl font-bold text-error">Access Denied</h2><p class="mt-2 text-base-content/60">You need Admin access to perform this action.</p><a href="/" class="btn btn-sm btn-primary mt-4">Go Home</a></div>', 403);
  }
  await next();
});
