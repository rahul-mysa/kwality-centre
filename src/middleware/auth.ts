import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import * as jose from 'jose';
import type { User } from '../views/layout.js';

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
};

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  // Bypass auth in development — remove this when Google OAuth is configured
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
