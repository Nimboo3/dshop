import { prisma } from '../../config/database';
import { logger } from '../../lib/logger';
import { encrypt, decrypt, hash } from '../../lib/crypto';
import { Session } from '@prisma/client';

const log = logger.child({ module: 'session-service' });

export interface SessionData {
  id: string;
  shop: string;
  state: string;
  isOnline: boolean;
  scope?: string;
  accessToken?: string;
  expires?: Date;
  userId?: bigint;
  firstName?: string;
  lastName?: string;
  email?: string;
  accountOwner?: boolean;
  locale?: string;
  collaborator?: boolean;
  emailVerified?: boolean;
}

/**
 * Store a session in the database
 */
export async function storeSession(sessionData: SessionData): Promise<Session> {
  const { 
    id, shop, state, isOnline, scope, accessToken, expires,
    userId, firstName, lastName, email, accountOwner, locale,
    collaborator, emailVerified
  } = sessionData;
  
  log.debug({ sessionId: id, shop }, 'Storing session');
  
  // Encrypt access token if present
  const encryptedToken = accessToken ? encrypt(accessToken) : '';
  
  const session = await prisma.session.upsert({
    where: { id },
    create: {
      id,
      shop,
      state,
      isOnline,
      scope,
      accessToken: encryptedToken,
      expires,
      userId,
      firstName,
      lastName,
      email,
      accountOwner: accountOwner ?? false,
      locale,
      collaborator: collaborator ?? false,
      emailVerified: emailVerified ?? false,
    },
    update: {
      state,
      isOnline,
      scope,
      accessToken: encryptedToken,
      expires,
      userId,
      firstName,
      lastName,
      email,
      accountOwner: accountOwner ?? false,
      locale,
      collaborator: collaborator ?? false,
      emailVerified: emailVerified ?? false,
    },
  });
  
  return session;
}

/**
 * Load a session from the database
 */
export async function loadSession(id: string): Promise<SessionData | null> {
  const session = await prisma.session.findUnique({
    where: { id },
  });
  
  if (!session) {
    return null;
  }
  
  // Check if session is expired
  if (session.expires && session.expires < new Date()) {
    log.debug({ sessionId: id }, 'Session expired');
    await deleteSession(id);
    return null;
  }
  
  // Decrypt access token
  let decryptedToken: string | undefined;
  if (session.accessToken) {
    try {
      decryptedToken = decrypt(session.accessToken);
    } catch (error) {
      log.error({ sessionId: id, error }, 'Failed to decrypt session access token');
      return null;
    }
  }
  
  return {
    id: session.id,
    shop: session.shop,
    state: session.state,
    isOnline: session.isOnline,
    scope: session.scope || undefined,
    accessToken: decryptedToken,
    expires: session.expires || undefined,
  };
}

/**
 * Delete a session from the database
 */
export async function deleteSession(id: string): Promise<boolean> {
  try {
    await prisma.session.delete({
      where: { id },
    });
    log.debug({ sessionId: id }, 'Session deleted');
    return true;
  } catch (error) {
    // Session might not exist
    return false;
  }
}

/**
 * Delete all sessions for a shop
 */
export async function deleteSessionsForShop(shop: string): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { shop },
  });
  
  log.debug({ shop, count: result.count }, 'Sessions deleted for shop');
  return result.count;
}

/**
 * Find sessions for a shop
 */
export async function findSessionsForShop(shop: string): Promise<Session[]> {
  return prisma.session.findMany({
    where: { shop },
  });
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      expires: {
        lt: new Date(),
      },
    },
  });
  
  log.info({ count: result.count }, 'Expired sessions cleaned up');
  return result.count;
}

/**
 * Validate a session's access token (decrypts and compares)
 */
export async function validateSessionToken(id: string, accessToken: string): Promise<boolean> {
  const session = await prisma.session.findUnique({
    where: { id },
    select: { accessToken: true },
  });
  
  if (!session || !session.accessToken) {
    return false;
  }
  
  try {
    const decryptedToken = decrypt(session.accessToken);
    return decryptedToken === accessToken;
  } catch {
    return false;
  }
}

/**
 * Custom session storage for Shopify API
 * Implements the SessionStorage interface
 */
export const sessionStorage = {
  storeSession: async (session: SessionData): Promise<boolean> => {
    try {
      await storeSession(session);
      return true;
    } catch (error) {
      log.error({ error }, 'Failed to store session');
      return false;
    }
  },
  
  loadSession: async (id: string): Promise<SessionData | undefined> => {
    const session = await loadSession(id);
    return session || undefined;
  },
  
  deleteSession: async (id: string): Promise<boolean> => {
    return deleteSession(id);
  },
  
  deleteSessions: async (ids: string[]): Promise<boolean> => {
    try {
      await prisma.session.deleteMany({
        where: { id: { in: ids } },
      });
      return true;
    } catch (error) {
      return false;
    }
  },
  
  findSessionsByShop: async (shop: string): Promise<SessionData[]> => {
    const sessions = await findSessionsForShop(shop);
    return sessions.map(session => ({
      id: session.id,
      shop: session.shop,
      state: session.state,
      isOnline: session.isOnline,
      scope: session.scope || undefined,
      accessToken: session.accessToken || undefined, // Note: encrypted
      expires: session.expires || undefined,
    }));
  },
};
