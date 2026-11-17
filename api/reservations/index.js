const { getDb, toIdQuery, normalizeDoc } = require('../../lib/db');
const { requireAuth, parseBody, sendJson, logAudit } = require('../../lib/auth');
const { validateReservation } = require('../../lib/validate');

module.exports = async function handler(req, res) {
  const db = await getDb();

  if (req.method === 'GET') {
    const user = await requireAuth(req, res, ['buyer', 'seller', 'dealer', 'admin']);
    if (!user) return;

    try {
      const filter = {};
      if (user.role === 'buyer') {
        filter.buyerId = String(user._id);
      } else if (user.role === 'seller' || user.role === 'dealer') {
        filter.$or = [{ sellerId: String(user._id) }, { buyerId: String(user._id) }];
      }

      const docs = await db
        .collection('reservations')
        .find(filter)
        .sort({ updatedAt: -1 })
        .toArray();

      return sendJson(res, 200, { reservations: docs.map(normalizeDoc) });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to load reservations: ' + err.message });
    }
  }

  if (req.method === 'POST') {
    const user = await requireAuth(req, res, ['buyer', 'seller', 'dealer', 'admin']);
    if (!user) return;

    try {
      const body = await parseBody(req);
      const validation = validateReservation(body);
      if (!validation.valid) {
        return sendJson(res, 400, {
          error: validation.errors.join(' '),
          errors: validation.errors
        });
      }

      const { listingId, preferredDate, notes, depositAmount, inspectionRequested } = validation.data;
      const listing = await db.collection('listings').findOne(toIdQuery(listingId));
      if (!listing) {
        return sendJson(res, 404, { error: 'Listing not found.' });
      }

      if (listing.status === 'sold') {
        return sendJson(res, 400, { error: 'This vehicle has already been sold.' });
      }

      const now = new Date().toISOString();
      const initialTimelineEntry = {
        status: 'pending',
        note: notes
          ? `Reservation placed (${notes})`
          : `Reservation requested with BDT ${depositAmount.toLocaleString()} hold intent.`,
        actorId: String(user._id),
        actorName: user.name,
        at: now
      };

      const reservationDoc = {
        listingId: String(listing._id),
        listingTitle: listing.title,
        listingPrice: listing.price,
        buyerId: String(user._id),
        buyerName: user.name,
        buyerEmail: user.email,
        sellerId: String(listing.sellerId),
        sellerName: listing.sellerName,
        depositAmount,
        preferredDate: preferredDate || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        inspectionRequested,
        notes,
        status: 'pending',
        timeline: [initialTimelineEntry],
        createdAt: now,
        updatedAt: now
      };

      const result = await db.collection('reservations').insertOne(reservationDoc);
      const created = normalizeDoc({ ...reservationDoc, _id: result.insertedId });

      await logAudit(db, {
        actor: user,
        action: 'CREATE_RESERVATION',
        targetType: 'reservation',
        targetId: created._id,
        details: `Created reservation for "${listing.title}" (deposit BDT ${depositAmount.toLocaleString()})`
      });

      return sendJson(res, 201, {
        message: 'Reservation request submitted.',
        reservation: created
      });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to create reservation: ' + err.message });
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
};
