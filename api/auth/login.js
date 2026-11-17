const { getDb, normalizeDoc } = require('../../lib/db');
const {
  verifyPassword,
  signToken,
  setAuthCookie,
  parseBody,
  sendJson,
  logAudit
} = require('../../lib/auth');
const { sanitizeString } = require('../../lib/validate');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await parseBody(req);
    const email = sanitizeString(body.email, 160).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return sendJson(res, 400, { error: 'Email and password are required.' });
    }

    const db = await getDb();
    const userDoc = await db.collection('users').findOne({ email });
    if (!userDoc) {
      return sendJson(res, 401, { error: 'Invalid email or password.' });
    }

    if (userDoc.status === 'suspended') {
      return sendJson(res, 403, {
        error: 'This account has been suspended by an administrator.'
      });
    }

    const valid = await verifyPassword(password, userDoc.passwordHash);
    if (!valid) {
      return sendJson(res, 401, { error: 'Invalid email or password.' });
    }

    const user = normalizeDoc(userDoc);
    delete user.passwordHash;

    const token = signToken(user);
    setAuthCookie(res, token);

    await logAudit(db, {
      actor: user,
      action: 'USER_LOGIN',
      targetType: 'user',
      targetId: user._id,
      details: `User signed in (${user.role})`
    });

    return sendJson(res, 200, {
      message: 'Signed in successfully.',
      user
    });
  } catch (err) {
    return sendJson(res, 500, { error: 'Login failed: ' + err.message });
  }
};
