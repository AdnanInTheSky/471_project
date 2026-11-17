const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb, toIdQuery, normalizeDoc } = require('./db');

const COOKIE_NAME = 'motosheba_token';
const JWT_EXPIRES_IN = '7d';

function getJwtSecret() {
  return process.env.JWT_SECRET || 'motosheba-dev-secret-key-change-in-production-2026';
}

async function hashPassword(plainText) {
  return bcrypt.hash(String(plainText), 10);
}

async function verifyPassword(plainText, passwordHash) {
  if (!plainText || !passwordHash) return false;
  return bcrypt.compare(String(plainText), String(passwordHash));
}

function signToken(user) {
  const payload = {
    sub: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    verified: Boolean(user.verified)
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch (err) {
    return null;
  }
}

function parseCookies(req) {
  const header = (req && req.headers && req.headers.cookie) || '';
  const cookies = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const key = pair.slice(0, idx).trim();
      const val = decodeURIComponent(pair.slice(idx + 1).trim());
      cookies[key] = val;
    }
  });
  return cookies;
}

function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = 7 * 24 * 60 * 60;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAuthCookie(res) {
  const parts = [
    `${COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

async function getAuthUser(req) {
  const cookies = parseCookies(req);
  let token = cookies[COOKIE_NAME];

  if (!token && req.headers && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded || !decoded.sub) return null;

  const db = await getDb();
  const userDoc = await db.collection('users').findOne(toIdQuery(decoded.sub));
  if (!userDoc) return null;

  const user = normalizeDoc(userDoc);
  delete user.passwordHash;
  return user;
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

async function requireAuth(req, res, allowedRoles = []) {
  const user = await getAuthUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'Authentication required. Please log in.' });
    return null;
  }
  if (user.status === 'suspended') {
    sendJson(res, 403, { error: 'Your account has been suspended. Contact an administrator.' });
    return null;
  }
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    if (!allowedRoles.includes(user.role)) {
      sendJson(res, 403, {
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${user.role}.`
      });
      return null;
    }
  }
  return user;
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

async function logAudit(db, { actor, action, targetType = '', targetId = '', details = '' }) {
  try {
    await db.collection('auditLogs').insertOne({
      actorId: actor ? String(actor._id) : 'system',
      actorEmail: actor ? actor.email : 'system',
      actorRole: actor ? actor.role : 'system',
      action,
      targetType,
      targetId: String(targetId || ''),
      details: String(details || ''),
      at: new Date().toISOString()
    });
  } catch (err) {
    // Non-fatal
  }
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  setAuthCookie,
  clearAuthCookie,
  getAuthUser,
  requireAuth,
  parseBody,
  sendJson,
  logAudit
};
