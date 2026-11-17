const { getDb, toIdQuery, normalizeDoc } = require('../../lib/db');
const { requireAuth, parseBody, sendJson, logAudit } = require('../../lib/auth');
const { VALID_RESERVATION_STATUSES, sanitizeString } = require('../../lib/validate');

function getReservationId(req) {
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

  const user = await requireAuth(req, res, ['buyer', 'seller', 'dealer', 'admin']);
  if (!user) return;

  try {
    const db = await getDb();
    const id = getReservationId(req);
    if (!id) {
      return sendJson(res, 400, { error: 'Reservation ID is required.' });
    }

    const existing = await db.collection('reservations').findOne(toIdQuery(id));
    if (!existing) {
      return sendJson(res, 404, { error: 'Reservation not found.' });
    }

    const isSeller = String(existing.sellerId) === String(user._id);
    const isBuyer = String(existing.buyerId) === String(user._id);
    const isAdmin = user.role === 'admin';

    if (!isSeller && !isBuyer && !isAdmin) {
      return sendJson(res, 403, { error: 'You are not authorized to modify this reservation.' });
    }

    const body = await parseBody(req);
    const status = sanitizeString(body.status || '', 40).toLowerCase();
    const note = sanitizeString(body.note || '', 500);

    if (!VALID_RESERVATION_STATUSES.includes(status)) {
      return sendJson(res, 400, {
        error: `Status must be one of: ${VALID_RESERVATION_STATUSES.join(', ')}.`
      });
    }

    if (isBuyer && !isSeller && !isAdmin && status !== 'cancelled') {
      return sendJson(res, 403, {
        error: 'Buyers can only cancel their reservation; seller or dealer confirms milestones.'
      });
    }

    const now = new Date().toISOString();
    const timeline = Array.isArray(existing.timeline) ? [...existing.timeline] : [];
    timeline.push({
      status,
      note: note || `Status updated to ${status.replace('_', ' ')}`,
      actorId: String(user._id),
      actorName: user.name,
      at: now
    });

    await db.collection('reservations').updateOne(toIdQuery(id), {
      $set: {
        status,
        timeline,
        updatedAt: now
      }
    });

    if (status === 'confirmed' || status === 'inspection_scheduled') {
      await db.collection('listings').updateOne(toIdQuery(existing.listingId), {
        $set: { status: 'reserved', updatedAt: now }
      });
    } else if (status === 'completed') {
      await db.collection('listings').updateOne(toIdQuery(existing.listingId), {
        $set: { status: 'sold', updatedAt: now }
      });
    } else if (status === 'cancelled') {
      await db.collection('listings').updateOne(toIdQuery(existing.listingId), {
        $set: { status: 'active', updatedAt: now }
      });
    }

    await logAudit(db, {
      actor: user,
      action: 'RESERVATION_STATUS_CHANGE',
      targetType: 'reservation',
      targetId: id,
      details: `Reservation status changed from ${existing.status} to ${status}${note ? ': ' + note : ''}`
    });

    const updated = await db.collection('reservations').findOne(toIdQuery(id));
    return sendJson(res, 200, {
      message: `Reservation marked as ${status}.`,
      reservation: normalizeDoc(updated)
    });
  } catch (err) {
    return sendJson(res, 500, { error: 'Failed to update reservation: ' + err.message });
  }
};
