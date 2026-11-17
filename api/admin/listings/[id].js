const { getDb, toIdQuery, normalizeDoc } = require('../../../lib/db');
const { requireAuth, parseBody, sendJson, logAudit } = require('../../../lib/auth');
const { VALID_LISTING_STATUSES, sanitizeString } = require('../../../lib/validate');

function getListingId(req) {
  if (req.query && req.query.id) return String(req.query.id);
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('id')) return url.searchParams.get('id');
  const parts = url.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const admin = await requireAuth(req, res, ['admin']);
  if (!admin) return;

  try {
    const db = await getDb();
    const id = getListingId(req);
    if (!id) {
      return sendJson(res, 400, { error: 'Listing ID is required.' });
    }

    const existing = await db.collection('listings').findOne(toIdQuery(id));
    if (!existing) {
      return sendJson(res, 404, { error: 'Listing not found.' });
    }

    const body = await parseBody(req);
    const status = sanitizeString(body.status || '', 30).toLowerCase();
    const moderationNotes = sanitizeString(body.moderationNotes || '', 500);

    if (!VALID_LISTING_STATUSES.includes(status)) {
      return sendJson(res, 400, {
        error: `Status must be one of: ${VALID_LISTING_STATUSES.join(', ')}.`
      });
    }

    const now = new Date().toISOString();
    await db.collection('listings').updateOne(toIdQuery(id), {
      $set: {
        status,
        moderationNotes: moderationNotes || `Moderated as ${status} by administrator.`,
        updatedAt: now
      }
    });

    await logAudit(db, {
      actor: admin,
      action: 'MODERATE_LISTING',
      targetType: 'listing',
      targetId: id,
      details: `Moderated listing "${existing.title}" -> ${status}${moderationNotes ? ' (' + moderationNotes + ')' : ''}`
    });

    const updated = await db.collection('listings').findOne(toIdQuery(id));
    return sendJson(res, 200, {
      message: `Listing status updated to ${status}.`,
      listing: normalizeDoc(updated)
    });
  } catch (err) {
    return sendJson(res, 500, { error: 'Moderation update failed: ' + err.message });
  }
};
