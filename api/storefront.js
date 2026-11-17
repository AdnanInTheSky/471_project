const { getDb, toIdQuery, normalizeDoc } = require('../lib/db');
const { sendJson } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const db = await getDb();
    const url = new URL(req.url, 'http://localhost');
    const dealerId = url.searchParams.get('dealerId') || '';

    const allDealerProfiles = await db
      .collection('profiles')
      .find({ role: 'dealer' })
      .toArray();

    if (!dealerId) {
      const dealers = await Promise.all(
        allDealerProfiles.map(async (p) => {
          const userDoc = await db.collection('users').findOne(toIdQuery(p.userId));
          const activeCount = await db.collection('listings').countDocuments({
            sellerId: String(p.userId),
            status: 'active'
          });
          return {
            ...normalizeDoc(p),
            dealerName: userDoc ? userDoc.name : p.businessName,
            verified: Boolean(userDoc && userDoc.verified),
            activeListingsCount: activeCount
          };
        })
      );
      return sendJson(res, 200, { dealers });
    }

    const profileDoc =
      (await db.collection('profiles').findOne({ userId: String(dealerId) })) ||
      (await db.collection('profiles').findOne(toIdQuery(dealerId)));

    const targetUserId = profileDoc ? String(profileDoc.userId) : String(dealerId);
    const userDoc = await db.collection('users').findOne(toIdQuery(targetUserId));

    if (!userDoc && !profileDoc) {
      return sendJson(res, 404, { error: 'Dealer storefront not found.' });
    }

    const listings = await db
      .collection('listings')
      .find({ sellerId: targetUserId, status: { $in: ['active', 'reserved'] } })
      .sort({ createdAt: -1 })
      .toArray();

    return sendJson(res, 200, {
      storefront: {
        userId: targetUserId,
        name: (profileDoc && profileDoc.businessName) || (userDoc && userDoc.name) || 'Dealer Showroom',
        email: userDoc ? userDoc.email : '',
        phone: (profileDoc && profileDoc.phone) || (userDoc && userDoc.phone) || '',
        licenseNo: profileDoc ? profileDoc.licenseNo : '',
        tinNo: profileDoc ? profileDoc.tinNo : '',
        address: profileDoc ? profileDoc.address : '',
        city: profileDoc ? profileDoc.city : 'Dhaka',
        bio: profileDoc ? profileDoc.bio : '',
        verified: Boolean((userDoc && userDoc.verified) || (profileDoc && profileDoc.verificationStatus === 'verified')),
        verificationStatus: profileDoc ? profileDoc.verificationStatus : 'unsubmitted',
        staff: (profileDoc && Array.isArray(profileDoc.staff)) ? profileDoc.staff : []
      },
      listings: listings.map(normalizeDoc),
      allDealers: allDealerProfiles.map(normalizeDoc)
    });
  } catch (err) {
    return sendJson(res, 500, { error: 'Failed to load storefront: ' + err.message });
  }
};
