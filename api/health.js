const { getDb, getConnectionMode } = require('../lib/db');
const { sendJson } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const db = await getDb();
    const [usersCount, listingsCount, inquiriesCount, reservationsCount] = await Promise.all([
      db.collection('users').countDocuments({}),
      db.collection('listings').countDocuments({}),
      db.collection('inquiries').countDocuments({}),
      db.collection('reservations').countDocuments({})
    ]);

    return sendJson(res, 200, {
      status: 'ok',
      service: 'MotoSheba API',
      phase: 'Phase 0 & Phase 1 (Marketplace Foundation)',
      database: {
        connected: true,
        mode: getConnectionMode()
      },
      counts: {
        users: usersCount,
        listings: listingsCount,
        inquiries: inquiriesCount,
        reservations: reservationsCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return sendJson(res, 500, {
      status: 'error',
      error: err.message
    });
  }
};
