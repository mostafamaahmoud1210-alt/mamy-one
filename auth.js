const crypto = require('node:crypto');
const { db, hashPassword, verifyPassword, getCairoNow } = require('./db');

// Secure secret generated per server instance or persisted
const JWT_SECRET = process.env.JWT_SECRET || 'mamy-one-nursery-secure-secret-2026-cairo-token';

/**
 * Sign a payload into a secure HMAC-SHA256 token
 */
function createToken(payload, expiresInHours = 24) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + (expiresInHours * 3600);
  const fullPayload = { ...payload, exp };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify and decode an HMAC-SHA256 token
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Check if a user has a specific permission
 */
function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return true;

  let perms = [];
  try {
    perms = Array.isArray(user.permissions) ? user.permissions : JSON.parse(user.permissions || '[]');
  } catch (e) {
    perms = [];
  }

  if (perms.includes('*')) return true;
  return perms.includes(permission);
}

/**
 * Authenticate request helper from Authorization header
 */
async function authenticateRequest(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader) return null;

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  const decoded = verifyToken(token);
  if (!decoded || !decoded.userId) return null;

  // Verify user in DB and ensure active
  const user = await db.prepare('SELECT id, username, full_name, role, permissions, is_active FROM users WHERE id = ?').get(decoded.userId);
  if (!user || user.is_active !== 1) return null;

  try {
    user.permissions = JSON.parse(user.permissions || '[]');
  } catch (e) {
    user.permissions = [];
  }

  return user;
}

module.exports = {
  createToken,
  verifyToken,
  hasPermission,
  authenticateRequest,
  hashPassword,
  verifyPassword
};
