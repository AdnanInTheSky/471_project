const { getDb, toIdQuery, normalizeDoc } = require('../../lib/db');
const { requireAuth, sendJson } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const admin = await requireAuth(req, res, ['admin']);
  if (!admin) return;

  try {
    const db = await getDb();
    const [profiles, users, listings] = await Promise.all([
      db.collection('profiles').find({}).sort({ updatedAt: -1 }).toArray(),
      db.collection('users').find({}).sort({ createdAt: -1 }).toArray(),
      db.collection('listings').find({}).sort({ createdAt: -1 }).toArray()
    ]);

    const userMap = {};
    const sanitizedUsers = users.map((u) => {
      const clean = normalizeDoc(u);
      delete clean.passwordHash;
      userMap[clean._id] = clean;
      return clean;
    });

    const enrichedProfiles = profiles.map((p) => {
      const norm = normalizeDoc(p);
      const owner = userMap[String(norm.userId)] || null;
      return {
        ...norm,
        ownerName: owner ? owner.name : norm.businessName,
        ownerEmail: owner ? owner.email : '',
        ownerStatus: owner ? owner.status : 'active',
        ownerVerified: owner ? Boolean(owner.verified) : false
      };
    });

    const normListings = listings.map(normalizeDoc);

    const stats = {
      pendingVerifications: enrichedProfiles.filter((p) => p.verificationStatus === 'pending').length,
      verifiedProfiles: enrichedProfiles.filter((p) => p.verificationStatus === 'verified').length,
      pendingListings: normListings.filter((l) => l.status === 'pending').length,
      activeListings: normListings.filter((l) => l.status === 'active').length,
      totalUsers: sanitizedUsers.length,
      suspendedUsers: sanitizedUsers.filter((u) => u.status === 'suspended').length
    };

    return sendJson(res, 200, {
      stats,
      profiles: enrichedProfiles,
      listings: normListings,
      users: sanitizedUsers
    });
  } catch (err) {
    return sendJson(res, 500, { error: 'Failed to load admin queue: ' + err.message });
  }
};
