import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { users, sessions, auditLog, loginAttempts } from '@/lib/db/schema';
import { eq, and, gt, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SESSION_COOKIE = 'crm_session';
const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours

type UserRole = 'admin' | 'processor' | 'agent';

export interface SessionUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  leadsVisibility: string | null;
  sipUsername: string | null;
}

// ─── Get current session user (server component) ────────
export async function getUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const result = await db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      id: users.id,
      username: users.username,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      isActive: users.isActive,
      leadsVisibility: users.leadsVisibility,
      sipUsername: users.sipUsername,
      forceLogoutAt: users.forceLogoutAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, sessionId),
        gt(sessions.expiresAt, new Date()),
      )
    )
    .limit(1);

  if (!result.length) return null;
  const row = result[0];

  // Check if user is still active
  if (!row.isActive) return null;

  // Check force logout
  if (row.forceLogoutAt && new Date(row.forceLogoutAt) > new Date(row.expiresAt)) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    isActive: row.isActive,
    leadsVisibility: row.leadsVisibility,
    sipUsername: row.sipUsername,
  };
}

// ─── Require auth (redirect to login if not authenticated) ──
export async function requireAuth(allowedRoles?: UserRole[]): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect('/login');
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    redirect('/');
  }
  return user;
}

// ─── Login ──────────────────────────────────────────────
export async function login(
  username: string,
  password: string,
  ipAddress: string,
): Promise<{ success: boolean; error?: string; sessionId?: string }> {
  // Rate limit check
  const recentAttempts = await db
    .select({ count: sql<number>`count(*)` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ipAddress, ipAddress),
        eq(loginAttempts.success, false),
        gt(loginAttempts.createdAt, new Date(Date.now() - 15 * 60 * 1000)),
      )
    );

  if (recentAttempts[0]?.count >= 5) {
    return { success: false, error: 'Too many failed attempts. Try again in 15 minutes.' };
  }

  // Find user
  const user = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user.length || !await bcrypt.compare(password, user[0].passwordHash)) {
    // Log failed attempt
    await db.insert(loginAttempts).values({
      ipAddress,
      username,
      success: false,
    });
    return { success: false, error: 'Invalid username or password.' };
  }

  if (!user[0].isActive) {
    return { success: false, error: 'Account is deactivated.' };
  }

  // Create session
  const sessionId = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

  await db.insert(sessions).values({
    id: sessionId,
    userId: user[0].id,
    ipAddress,
    expiresAt,
  });

  // Update last login
  await db
    .update(users)
    .set({ lastLoginAt: new Date(), lastLoginIp: ipAddress })
    .where(eq(users.id, user[0].id));

  // Log success
  await db.insert(loginAttempts).values({
    ipAddress,
    username,
    success: true,
  });

  // Audit
  await audit(user[0].id, user[0].username, 'login', 'user', user[0].id, `Login from ${ipAddress}`, ipAddress);

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_LIFETIME_MS / 1000,
    path: '/',
  });

  return { success: true, sessionId };
}

// ─── Logout ─────────────────────────────────────────────
export async function logout() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }
  cookieStore.delete(SESSION_COOKIE);
  redirect('/login');
}

// ─── Hash password ──────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// ─── Audit logging ──────────────────────────────────────
export async function audit(
  userId: number | null,
  username: string | null,
  action: string,
  entityType?: string,
  entityId?: number,
  details?: string,
  ipAddress?: string,
) {
  await db.insert(auditLog).values({
    userId,
    username,
    action,
    entityType,
    entityId: entityId ? BigInt(entityId) as any : null,
    details,
    ipAddress,
  });
}

// ─── Generate CSRF token ───────────────────────────────
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
