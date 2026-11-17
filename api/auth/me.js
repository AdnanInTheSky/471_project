const { getDb, toIdQuery, normalizeDoc } = require('../../lib/db');
const {
  getAuthUser,
  requireAuth,
  parseBody,
  sendJson,
  logAudit
} = require('../../lib/auth');
const { sanitizeString } = require('../../lib/validate');

module.exports = async function handler(req, res) {
  const db = await getDb();

  if (req.method === 'GET') {
    const user = await getAuthUser(req);
    if (!user) {
      return sendJson(res, 200, { authenticated: false, user: null, profile: null });
    }
    const profileDoc = await db.collection('profiles').findOne({ userId: String(user._id) });
    return sendJson(res, 200, {
      authenticated: true,
      user,
      profile: profileDoc ? normalizeDoc(profileDoc) : null
    });
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const user = await requireAuth(req, res);
    if (!user) return;

    const body = await parseBody(req);
    const now = new Date().toISOString();

    const userUpdates = {};
    if (body.name !== undefined) {
      const cleanName = sanitizeString(body.name, 120);
      if (cleanName.length >= 2) userUpdates.name = cleanName;
    }
    if (body.phone !== undefined) {
      userUpdates.phone = sanitizeString(body.phone, 40);
    }

    if (Object.keys(userUpdates).length > 0) {
      await db.collection('users').updateOne(toIdQuery(user._id), { $set: userUpdates });
    }

    let profile = await db.collection('profiles').findOne({ userId: String(user._id) });

    if (['seller', 'dealer', 'garage'].includes(user.role) || body.businessName !== undefined || body.staff !== undefined) {
      const profileUpdates = {
        userId: String(user._id),
        role: user.role,
        updatedAt: now
      };
      if (body.businessName !== undefined) {
        profileUpdates.businessName = sanitizeString(body.businessName, 160);
      }
      if (body.licenseNo !== undefined) {
        profileUpdates.licenseNo = sanitizeString(body.licenseNo, 80);
      }
      if (body.tinNo !== undefined) {
        profileUpdates.tinNo = sanitizeString(body.tinNo, 60);
      }
      if (body.address !== undefined) {
        profileUpdates.address = sanitizeString(body.address, 250);
      }
      if (body.city !== undefined) {
        profileUpdates.city = sanitizeString(body.city, 80);
      }
      if (body.phone !== undefined) {
        profileUpdates.phone = sanitizeString(body.phone, 40);
      }
      if (body.bio !== undefined) {
        profileUpdates.bio = sanitizeString(body.bio, 1200);
      }
      if (Array.isArray(body.staff)) {
        profileUpdates.staff = body.staff.slice(0, 30).map((member, idx) => ({
          id: sanitizeString(member.id || `st-${Date.now()}-${idx}`, 40),
          name: sanitizeString(member.name, 100),
          email: sanitizeString(member.email, 120),
          phone: sanitizeString(member.phone, 40),
          title: sanitizeString(member.title || 'Sales Executive', 80),
          status: member.status === 'inactive' ? 'inactive' : 'active',
          addedAt: member.addedAt || now
        })).filter((m) => m.name);
      }

      if (body.submitForVerification) {
        profileUpdates.verificationStatus = 'pending';
        profileUpdates.verificationNotes = 'Submitted by user for administrator verification.';
      } else if (!profile) {
        profileUpdates.verificationStatus = profileUpdates.licenseNo ? 'pending' : 'unsubmitted';
      }

      await db.collection('profiles').updateOne(
        { userId: String(user._id) },
        { $set: profileUpdates },
        { upsert: true }
      );

      profile = await db.collection('profiles').findOne({ userId: String(user._id) });

      await logAudit(db, {
        actor: user,
        action: body.submitForVerification ? 'SUBMIT_VERIFICATION' : 'UPDATE_PROFILE',
        targetType: 'profile',
        targetId: profile ? profile._id : user._id,
        details: body.submitForVerification
          ? `Submitted ${user.role} profile (${profileUpdates.businessName || user.name}) for verification`
          : `Updated ${user.role} profile settings`
      });
    }

    const updatedUserDoc = await db.collection('users').findOne(toIdQuery(user._id));
    const updatedUser = normalizeDoc(updatedUserDoc);
    delete updatedUser.passwordHash;

    return sendJson(res, 200, {
      message: 'Profile updated successfully.',
      user: updatedUser,
      profile: profile ? normalizeDoc(profile) : null
    });
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
};
