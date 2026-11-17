const { getDb, toIdQuery, normalizeDoc } = require('../../../lib/db');
const { requireAuth, parseBody, sendJson, logAudit } = require('../../../lib/auth');
const { sanitizeString, VALID_ROLES } = require('../../../lib/validate');

function getTargetId(req) {
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
    const id = getTargetId(req);
    if (!id) {
      return sendJson(res, 400, { error: 'Target ID is required.' });
    }

    const body = await parseBody(req);
    const now = new Date().toISOString();

    if (body.targetType === 'user') {
      const userDoc = await db.collection('users').findOne(toIdQuery(id));
      if (!userDoc) {
        return sendJson(res, 404, { error: 'User not found.' });
      }

      const updates = {};
      if (body.status && ['active', 'suspended'].includes(body.status)) {
        updates.status = body.status;
      }
      if (body.role && VALID_ROLES.includes(body.role)) {
        updates.role = body.role;
      }
      if (body.verified !== undefined) {
        updates.verified = Boolean(body.verified);
      }

      await db.collection('users').updateOne(toIdQuery(id), { $set: updates });
      const updatedUser = normalizeDoc(await db.collection('users').findOne(toIdQuery(id)));
      delete updatedUser.passwordHash;

      await logAudit(db, {
        actor: admin,
        action: 'ADMIN_USER_UPDATE',
        targetType: 'user',
        targetId: id,
        details: `Updated user ${updatedUser.email}: ${JSON.stringify(updates)}`
      });

      return sendJson(res, 200, {
        message: 'User updated.',
        user: updatedUser
      });
    }

    const profileDoc =
      (await db.collection('profiles').findOne(toIdQuery(id))) ||
      (await db.collection('profiles').findOne({ userId: String(id) }));

    if (!profileDoc) {
      return sendJson(res, 404, { error: 'Profile not found.' });
    }

    const verificationStatus = sanitizeString(body.verificationStatus || 'verified', 30);
    const verificationNotes = sanitizeString(body.verificationNotes || '', 500);

    if (!['verified', 'rejected', 'pending', 'unsubmitted'].includes(verificationStatus)) {
      return sendJson(res, 400, { error: 'Invalid verificationStatus.' });
    }

    const isVerified = verificationStatus === 'verified';

    await db.collection('profiles').updateOne(toIdQuery(profileDoc._id), {
      $set: {
        verificationStatus,
        verificationNotes:
          verificationNotes ||
          (isVerified ? 'Verified by MotoSheba Admin.' : `Marked ${verificationStatus} by admin.`),
        updatedAt: now
      }
    });

    await db.collection('users').updateOne(toIdQuery(profileDoc.userId), {
      $set: { verified: isVerified }
    });

    const sellerListings = await db
      .collection('listings')
      .find({ sellerId: String(profileDoc.userId) })
      .toArray();
    for (const item of sellerListings) {
      await db.collection('listings').updateOne(toIdQuery(item._id), {
        $set: { sellerVerified: isVerified }
      });
    }

    await logAudit(db, {
      actor: admin,
      action: isVerified ? 'VERIFY_PROFILE' : 'REJECT_PROFILE',
      targetType: 'profile',
      targetId: String(profileDoc._id),
      details: `${isVerified ? 'Approved' : 'Updated'} verification (${verificationStatus}) for "${profileDoc.businessName}"${verificationNotes ? ': ' + verificationNotes : ''}`
    });

    const updatedProfile = await db.collection('profiles').findOne(toIdQuery(profileDoc._id));
    return sendJson(res, 200, {
      message: `Profile marked as ${verificationStatus}.`,
      profile: normalizeDoc(updatedProfile)
    });
  } catch (err) {
    return sendJson(res, 500, { error: 'Verification action failed: ' + err.message });
  }
};
