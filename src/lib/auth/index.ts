import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { users, sessions, auditLog, loginAttempts } from '@/lib/db/schema';
import { eq, and, gt, sql, desc } from 'drizzle-orm';
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
  allowedIps: string | null;
  sipUsername: string | null;
  sipPassword: string | null;
  sipAuthUser: string | null;
  sipDisplayName: string | null;
}

// ─── IP Whitelist Check (matches v1 exactly) ────────────
// Only enforced for agents and processors. Admins bypass.
// Supports exact IPs and CIDR ranges, comma-separated.
function checkIpWhitelist(user: { role: string; allowedIps: string | null }, clientIp: string): boolean {
  if (user.role === 'admin') return true;
  const raw = (user.allowedIps || '').trim();
  if (!raw) return true; // No whitelist = allow all

  for (const entry of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    if (entry.includes('/')) {
      // CIDR check
      if (ipInCidr(clientIp, entry)) return true;
    } else {
      if (clientIp === entry) return true;
    }
  }
  return false;
}

function ipInCidr(ip: string, cidr: string): boolean {
  try {
    const [subnet, bitsStr] = cidr.split('/');
    const bits = parseInt(bitsStr);
    const ipNum = ipToNumber(ip);
    const subNum = ipToNumber(subnet);
    if (ipNum === null || subNum === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipNum & mask) === (subNum & mask);
  } catch { return false; }
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

async function getClientIp(): Promise<string> {
  const hdrs = await headers();
  return hdrs.get('x-forwarded-for')?.split(',')[0]?.trim()
    || hdrs.get('x-real-ip')
    || 'unknown';
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
      sessionCreatedAt: sessions.createdAt,
      id: users.id,
      username: users.username,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      isActive: users.isActive,
      leadsVisibility: users.leadsVisibility,
      allowedIps: users.allowedIps,
      sipUsername: users.sipUsername,
      sipPassword: users.sipPassword,
      sipAuthUser: users.sipAuthUser,
      sipDisplayName: users.sipDisplayName,
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

  // Force-logout: admin can remotely kick a user by setting force_logout_at
  // If force_logout_at is AFTER the session was created, invalidate the session
  if (row.forceLogoutAt && row.sessionCreatedAt) {
    const forceTime = new Date(row.forceLogoutAt).getTime();
    const sessionTime = new Date(row.sessionCreatedAt).getTime();
    if (forceTime > sessionTime) {
      // Delete the session and return null
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      return null;
    }
  }

  // IP whitelist check (only for agents and processors)
  const clientIp = await getClientIp();
  if (!checkIpWhitelist({ role: row.role, allowedIps: row.allowedIps }, clientIp)) {
    // Log the blocked attempt
    await audit(row.id, row.username, 'ip_blocked', 'user', row.id,
      `Blocked IP: ${clientIp} — not in whitelist: ${row.allowedIps || ''}`, clientIp);
    // Delete session
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    isActive: row.isActive,
    leadsVisibility: row.leadsVisibility || 'all',
    allowedIps: row.allowedIps,
    sipUsername: row.sipUsername,
    sipPassword: row.sipPassword,
    sipAuthUser: row.sipAuthUser,
    sipDisplayName: row.sipDisplayName,
  };
}

// ─── Require auth (redirect to login if not authenticated) ──
// v1 permission model:
// - admin: full access to everything
// - processor: can view/edit all leads, some admin pages (data manager, call history)
// - agent: can only see own leads, no admin pages
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

  if (Number(recentAttempts[0]?.count) >= 5) {
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
    await audit(null, username, 'login_failed', 'user', undefined, `Failed login from ${ipAddress}`, ipAddress);
    return { success: false, error: 'Invalid username or password.' };
  }

  if (!user[0].isActive) {
    return { success: false, error: 'Account is deactivated.' };
  }

  // IP whitelist check on login
  if (!checkIpWhitelist({ role: user[0].role, allowedIps: user[0].allowedIps }, ipAddress)) {
    await audit(user[0].id, user[0].username, 'ip_blocked', 'user', user[0].id,
      `Login blocked — IP ${ipAddress} not in whitelist: ${user[0].allowedIps || ''}`, ipAddress);
    return { success: false, error: 'Access denied from this IP address.' };
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
    // Get user before deleting session for audit
    const user = await getUser();
    if (user) {
      await audit(user.id, user.username, 'logout', 'user', user.id);
    }
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }
  cookieStore.delete(SESSION_COOKIE);
  redirect('/login');
}

// ─── Force logout all users ─────────────────────────────
export async function forceLogoutAll() {
  await db.update(users).set({ forceLogoutAt: new Date() });
  // Delete all sessions
  await db.delete(sessions);
}

// ─── Force logout single user ───────────────────────────
export async function forceLogoutUser(userId: number) {
  await db.update(users).set({ forceLogoutAt: new Date() }).where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
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
  try {
    if (!ipAddress) {
      ipAddress = await getClientIp();
    }
    await db.insert(auditLog).values({
      userId,
      username,
      action,
      entityType,
      entityId: entityId ? BigInt(entityId) as any : null,
      details,
      ipAddress,
    });
  } catch (e) {
    // Don't crash if audit logging fails
    console.error('Audit log error:', e);
  }
}

// ─── Generate CSRF token ───────────────────────────────
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
