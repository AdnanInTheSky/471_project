const { getDb, normalizeDoc } = require('../../lib/db');
const { requireAuth, sendJson } = require('../../lib/auth');
const { sanitizeString } = require('../../lib/validate');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const admin = await requireAuth(req, res, ['admin']);
  if (!admin) return;

  try {
    const db = await getDb();
    const url = new URL(req.url, 'http://localhost');
    const action = sanitizeString(url.searchParams.get('action') || '', 60);
    const targetType = sanitizeString(url.searchParams.get('targetType') || '', 40);
    const limit = Math.min(200, Math.max(10, Number(url.searchParams.get('limit') || 100)));

    const filter = {};
    if (action) filter.action = action;
    if (targetType) filter.targetType = targetType;

    const logs = await db
      .collection('auditLogs')
      .find(filter)
      .sort({ at: -1 })
      .limit(limit)
      .toArray();

    return sendJson(res, 200, {
      auditLogs: logs.map(normalizeDoc)
    });
  } catch (err) {
    return sendJson(res, 500, { error: 'Failed to load audit logs: ' + err.message });
  }
};
