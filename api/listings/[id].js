const { getDb, toIdQuery, normalizeDoc } = require('../../lib/db');
const { requireAuth, parseBody, sendJson, logAudit } = require('../../lib/auth');
const { validateListing } = require('../../lib/validate');

function getListingId(req) {
  if (req.query && req.query.id) return String(req.query.id);
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('id')) return url.searchParams.get('id');
  const parts = url.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

module.exports = async function handler(req, res) {
  const db = await getDb();
  const id = getListingId(req);

  if (!id) {
    return sendJson(res, 400, { error: 'Listing ID is required.' });
  }

  if (req.method === 'GET') {
    try {
      const doc = await db.collection('listings').findOne(toIdQuery(id));
      if (!doc) {
        return sendJson(res, 404, { error: 'Listing not found.' });
      }
      const listing = normalizeDoc(doc);
      const sellerProfile = await db
        .collection('profiles')
        .findOne({ userId: String(listing.sellerId) });

      return sendJson(res, 200, {
        listing,
        sellerProfile: sellerProfile ? normalizeDoc(sellerProfile) : null
      });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to load listing: ' + err.message });
    }
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const user = await requireAuth(req, res, ['seller', 'dealer', 'admin']);
    if (!user) return;

    try {
      const existing = await db.collection('listings').findOne(toIdQuery(id));
      if (!existing) {
        return sendJson(res, 404, { error: 'Listing not found.' });
      }

      if (user.role !== 'admin' && String(existing.sellerId) !== String(user._id)) {
        return sendJson(res, 403, { error: 'You can only edit your own listings.' });
      }

      const body = await parseBody(req);
      const validation = validateListing(body, true);
      if (!validation.valid) {
        return sendJson(res, 400, {
          error: validation.errors.join(' '),
          errors: validation.errors
        });
      }

      const updates = {
        ...validation.data,
        updatedAt: new Date().toISOString()
      };

      await db.collection('listings').updateOne(toIdQuery(id), { $set: updates });
      const updated = await db.collection('listings').findOne(toIdQuery(id));

      await logAudit(db, {
        actor: user,
        action: 'UPDATE_LISTING',
        targetType: 'listing',
        targetId: id,
        details: `Updated listing "${updated.title}" (status: ${updated.status})`
      });

      return sendJson(res, 200, {
        message: 'Listing updated successfully.',
        listing: normalizeDoc(updated)
      });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to update listing: ' + err.message });
    }
  }

  if (req.method === 'DELETE') {
    const user = await requireAuth(req, res, ['seller', 'dealer', 'admin']);
    if (!user) return;

    const existing = await db.collection('listings').findOne(toIdQuery(id));
    if (!existing) {
      return sendJson(res, 404, { error: 'Listing not found.' });
    }

    if (user.role !== 'admin' && String(existing.sellerId) !== String(user._id)) {
      return sendJson(res, 403, { error: 'You can only delete your own listings.' });
    }

    await db.collection('listings').deleteOne(toIdQuery(id));
    await logAudit(db, {
      actor: user,
      action: 'DELETE_LISTING',
      targetType: 'listing',
      targetId: id,
      details: `Deleted listing "${existing.title}"`
    });

    return sendJson(res, 200, { message: 'Listing deleted.' });
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
};
