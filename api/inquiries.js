const { getDb, toIdQuery, normalizeDoc } = require('../lib/db');
const { requireAuth, parseBody, sendJson, logAudit } = require('../lib/auth');
const { validateInquiry, sanitizeString } = require('../lib/validate');

module.exports = async function handler(req, res) {
  const db = await getDb();

  if (req.method === 'GET') {
    const user = await requireAuth(req, res, ['buyer', 'seller', 'dealer', 'admin']);
    if (!user) return;

    try {
      const url = new URL(req.url, 'http://localhost');
      const listingId = sanitizeString(url.searchParams.get('listingId') || '', 60);
      const filter = {};

      if (user.role === 'buyer') {
        filter.buyerId = String(user._id);
      } else if (user.role === 'seller' || user.role === 'dealer') {
        filter.$or = [{ sellerId: String(user._id) }, { buyerId: String(user._id) }];
      }
      if (listingId) {
        filter.listingId = listingId;
      }

      const docs = await db
        .collection('inquiries')
        .find(filter)
        .sort({ updatedAt: -1 })
        .toArray();

      return sendJson(res, 200, { inquiries: docs.map(normalizeDoc) });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to load inquiries: ' + err.message });
    }
  }

  if (req.method === 'POST') {
    const user = await requireAuth(req, res, ['buyer', 'seller', 'dealer', 'admin']);
    if (!user) return;

    try {
      const body = await parseBody(req);
      const validation = validateInquiry(body);
      if (!validation.valid) {
        return sendJson(res, 400, {
          error: validation.errors.join(' '),
          errors: validation.errors
        });
      }

      const { listingId, message, phone } = validation.data;
      const listing = await db.collection('listings').findOne(toIdQuery(listingId));
      if (!listing) {
        return sendJson(res, 404, { error: 'Listing not found.' });
      }

      const now = new Date().toISOString();
      const inquiryDoc = {
        listingId: String(listing._id),
        listingTitle: listing.title,
        buyerId: String(user._id),
        buyerName: user.name,
        buyerEmail: user.email,
        buyerPhone: phone || user.phone || '',
        sellerId: String(listing.sellerId),
        sellerName: listing.sellerName,
        message,
        replies: [],
        status: 'open',
        createdAt: now,
        updatedAt: now
      };

      const result = await db.collection('inquiries').insertOne(inquiryDoc);
      const created = normalizeDoc({ ...inquiryDoc, _id: result.insertedId });

      await logAudit(db, {
        actor: user,
        action: 'CREATE_INQUIRY',
        targetType: 'inquiry',
        targetId: created._id,
        details: `Buyer inquiry submitted for "${listing.title}"`
      });

      return sendJson(res, 201, {
        message: 'Inquiry sent to seller.',
        inquiry: created
      });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to submit inquiry: ' + err.message });
    }
  }

  if (req.method === 'PATCH') {
    const user = await requireAuth(req, res, ['buyer', 'seller', 'dealer', 'admin']);
    if (!user) return;

    try {
      const body = await parseBody(req);
      const inquiryId = sanitizeString(body.inquiryId || body.id, 60);
      const replyMessage = sanitizeString(body.replyMessage || '', 1500);
      const newStatus = sanitizeString(body.status || '', 30);

      if (!inquiryId) {
        return sendJson(res, 400, { error: 'Inquiry ID is required.' });
      }

      const existing = await db.collection('inquiries').findOne(toIdQuery(inquiryId));
      if (!existing) {
        return sendJson(res, 404, { error: 'Inquiry not found.' });
      }

      const isParticipant =
        user.role === 'admin' ||
        String(existing.sellerId) === String(user._id) ||
        String(existing.buyerId) === String(user._id);

      if (!isParticipant) {
        return sendJson(res, 403, { error: 'You are not authorized to update this inquiry.' });
      }

      const now = new Date().toISOString();
      const replies = Array.isArray(existing.replies) ? [...existing.replies] : [];

      if (replyMessage) {
        replies.push({
          id: `rep-${Date.now()}`,
          authorId: String(user._id),
          authorName: user.name,
          authorRole: user.role,
          message: replyMessage,
          at: now
        });
      }

      const status =
        newStatus && ['open', 'replied', 'closed'].includes(newStatus)
          ? newStatus
          : replyMessage
          ? 'replied'
          : existing.status;

      await db.collection('inquiries').updateOne(toIdQuery(inquiryId), {
        $set: {
          replies,
          status,
          updatedAt: now
        }
      });

      const updated = await db.collection('inquiries').findOne(toIdQuery(inquiryId));
      return sendJson(res, 200, {
        message: 'Inquiry updated.',
        inquiry: normalizeDoc(updated)
      });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to update inquiry: ' + err.message });
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
};
