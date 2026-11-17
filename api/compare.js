const { getDb, toIdQuery, normalizeDoc } = require('../lib/db');
const { sendJson } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const rawIds = url.searchParams.get('ids') || '';
    const ids = rawIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);

    const db = await getDb();

    if (ids.length === 0) {
      return sendJson(res, 200, { listings: [] });
    }

    const found = await Promise.all(
      ids.map((id) => db.collection('listings').findOne(toIdQuery(id)))
    );

    const listings = found.filter(Boolean).map(normalizeDoc);
    return sendJson(res, 200, { listings });
  } catch (err) {
    return sendJson(res, 500, { error: 'Failed to compare listings: ' + err.message });
  }
};
