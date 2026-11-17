const { getDb, normalizeDoc } = require('../../lib/db');
const {
  getAuthUser,
  requireAuth,
  parseBody,
  sendJson,
  logAudit
} = require('../../lib/auth');
const { validateListing, sanitizeString } = require('../../lib/validate');

module.exports = async function handler(req, res) {
  const db = await getDb();

  if (req.method === 'GET') {
    try {
      const url = new URL(req.url, 'http://localhost');
      const q = sanitizeString(url.searchParams.get('q') || '', 120);
      const make = sanitizeString(url.searchParams.get('make') || '', 60);
      const model = sanitizeString(url.searchParams.get('model') || '', 60);
      const condition = sanitizeString(url.searchParams.get('condition') || '', 30).toLowerCase();
      const fuelType = sanitizeString(url.searchParams.get('fuelType') || '', 50);
      const bodyType = sanitizeString(url.searchParams.get('bodyType') || '', 50);
      const location = sanitizeString(url.searchParams.get('location') || '', 80);
      const sellerId = sanitizeString(url.searchParams.get('sellerId') || '', 60);
      const status = sanitizeString(url.searchParams.get('status') || '', 30);
      const verifiedOnly = url.searchParams.get('verifiedOnly') === '1' || url.searchParams.get('verifiedOnly') === 'true';
      const mine = url.searchParams.get('mine') === '1' || url.searchParams.get('mine') === 'true';
      const minPrice = Number(url.searchParams.get('minPrice') || 0);
      const maxPrice = Number(url.searchParams.get('maxPrice') || 0);
      const minYear = Number(url.searchParams.get('minYear') || 0);
      const maxYear = Number(url.searchParams.get('maxYear') || 0);
      const sort = url.searchParams.get('sort') || 'newest';
      const page = Math.max(1, Number(url.searchParams.get('page') || 1));
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 12)));

      const filter = {};

      if (mine) {
        const user = await requireAuth(req, res, ['seller', 'dealer', 'admin']);
        if (!user) return;
        if (user.role !== 'admin') {
          filter.sellerId = String(user._id);
        }
        if (status) filter.status = status;
      } else if (sellerId) {
        filter.sellerId = sellerId;
        if (status) {
          filter.status = status;
        } else {
          filter.status = { $in: ['active', 'reserved'] };
        }
      } else {
        const user = await getAuthUser(req);
        if (status && user && user.role === 'admin') {
          filter.status = status;
        } else {
          filter.status = { $in: ['active', 'reserved'] };
        }
      }

      if (q) {
        filter.$text = { $search: q };
      }
      if (make) {
        filter.make = { $regex: `^${make}$`, $options: 'i' };
      }
      if (model) {
        filter.model = { $regex: model, $options: 'i' };
      }
      if (condition) {
        filter.condition = condition;
      }
      if (fuelType) {
        filter.fuelType = { $regex: fuelType, $options: 'i' };
      }
      if (bodyType) {
        filter.bodyType = { $regex: `^${bodyType}$`, $options: 'i' };
      }
      if (location) {
        filter.location = { $regex: location, $options: 'i' };
      }
      if (verifiedOnly) {
        filter.sellerVerified = true;
      }

      if (minPrice > 0 || maxPrice > 0) {
        filter.price = {};
        if (minPrice > 0) filter.price.$gte = minPrice;
        if (maxPrice > 0) filter.price.$lte = maxPrice;
      }

      if (minYear > 0 || maxYear > 0) {
        filter.year = {};
        if (minYear > 0) filter.year.$gte = minYear;
        if (maxYear > 0) filter.year.$lte = maxYear;
      }

      let sortSpec = { createdAt: -1 };
      if (sort === 'price_asc') sortSpec = { price: 1 };
      else if (sort === 'price_desc') sortSpec = { price: -1 };
      else if (sort === 'year_desc') sortSpec = { year: -1 };
      else if (sort === 'mileage_asc') sortSpec = { mileage: 1 };

      const skip = (page - 1) * limit;
      const [total, docs] = await Promise.all([
        db.collection('listings').countDocuments(filter),
        db.collection('listings').find(filter).sort(sortSpec).skip(skip).limit(limit).toArray()
      ]);

      return sendJson(res, 200, {
        listings: docs.map(normalizeDoc),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit))
        }
      });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to load listings: ' + err.message });
    }
  }

  if (req.method === 'POST') {
    const user = await requireAuth(req, res, ['seller', 'dealer', 'admin']);
    if (!user) return;

    try {
      const body = await parseBody(req);
      const validation = validateListing(body, false);
      if (!validation.valid) {
        return sendJson(res, 400, {
          error: validation.errors.join(' '),
          errors: validation.errors
        });
      }

      const profile = await db.collection('profiles').findOne({ userId: String(user._id) });
      const now = new Date().toISOString();
      const sellerName = (profile && profile.businessName) || user.name;
      const sellerVerified = Boolean(
        user.verified || (profile && profile.verificationStatus === 'verified')
      );

      const defaultImages = [
        'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=900&q=80'
      ];

      const listingDoc = {
        ...validation.data,
        images: validation.data.images.length > 0 ? validation.data.images : defaultImages,
        sellerId: String(user._id),
        sellerName,
        sellerRole: user.role,
        sellerVerified,
        status: validation.data.status || 'active',
        moderationNotes: sellerVerified
          ? 'Auto-published by verified account.'
          : 'Published; queued for routine admin review.',
        createdAt: now,
        updatedAt: now
      };

      const result = await db.collection('listings').insertOne(listingDoc);
      const created = normalizeDoc({ ...listingDoc, _id: result.insertedId });

      await logAudit(db, {
        actor: user,
        action: 'CREATE_LISTING',
        targetType: 'listing',
        targetId: created._id,
        details: `Created listing "${created.title}" at BDT ${created.price.toLocaleString()}`
      });

      return sendJson(res, 201, {
        message: 'Listing published successfully.',
        listing: created
      });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to create listing: ' + err.message });
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
};
