import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { createSessionToken } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { Layout } from '../views/layout.js';
import { LoginPage } from '../views/auth/login.js';

const auth = new Hono();

auth.get('/login', (c) => {
  return c.html(
    <Layout title="Login">
      <LoginPage />
    </Layout>
  );
});

auth.get('/google', (c) => {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL!;
  const state = crypto.randomUUID();

  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
    sameSite: 'Lax',
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account',
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

auth.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error || !code) {
    return c.redirect('/auth/login?error=oauth_failed');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_CALLBACK_URL!,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return c.redirect('/auth/login?error=token_exchange_failed');
  }

  const tokens = (await tokenRes.json()) as { access_token: string; id_token: string };

  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoRes.ok) {
    return c.redirect('/auth/login?error=userinfo_failed');
  }

  const googleUser = (await userInfoRes.json()) as {
    id: string;
    email: string;
    name: string;
    picture: string;
  };

  const existing = await db.select().from(users).where(eq(users.email, googleUser.email)).limit(1);

  let dbUser;
  if (existing.length > 0) {
    dbUser = existing[0];
    await db.update(users)
      .set({ lastLoginAt: new Date(), name: googleUser.name, avatarUrl: googleUser.picture })
      .where(eq(users.id, dbUser.id));
  } else {
    const [newUser] = await db.insert(users)
      .values({
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.picture,
      })
      .returning();
    dbUser = newUser;
  }

  const sessionToken = await createSessionToken({
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    avatarUrl: dbUser.avatarUrl,
  });

  setCookie(c, 'session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
    sameSite: 'Lax',
  });

  deleteCookie(c, 'oauth_state');
  return c.redirect('/');
});

auth.get('/logout', (c) => {
  deleteCookie(c, 'session');
  return c.redirect('/auth/login');
});

export { auth as authRoutes };
