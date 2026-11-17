const { getDb, normalizeDoc } = require('../../lib/db');
const {
  hashPassword,
  signToken,
  setAuthCookie,
  parseBody,
  sendJson,
  logAudit
} = require('../../lib/auth');
const { validateRegistration } = require('../../lib/validate');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await parseBody(req);
    const validation = validateRegistration(body);
    if (!validation.valid) {
      return sendJson(res, 400, { error: validation.errors.join(' '), errors: validation.errors });
    }

    const { name, email, password, role, phone, businessName, licenseNo } = validation.data;
    const db = await getDb();

    const existing = await db.collection('users').findOne({ email });
    if (existing) {
      return sendJson(res, 409, { error: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    const isBuyer = role === 'buyer';

    const userDoc = {
      name,
      email,
      phone,
      passwordHash,
      role,
      status: 'active',
      verified: isBuyer,
      createdAt: now
    };

    const insertResult = await db.collection('users').insertOne(userDoc);
    const userId = String(insertResult.insertedId);

    if (['seller', 'dealer', 'garage'].includes(role)) {
      await db.collection('profiles').insertOne({
        userId,
        role,
        businessName: businessName || name,
        licenseNo: licenseNo || '',
        tinNo: '',
        address: '',
        city: 'Dhaka',
        phone: phone || '',
        bio: '',
        verificationStatus: licenseNo ? 'pending' : 'unsubmitted',
        verificationNotes: licenseNo ? 'Submitted during registration.' : '',
        staff: [],
        updatedAt: now
      });
    }

    const createdUser = normalizeDoc({ ...userDoc, _id: userId });
    delete createdUser.passwordHash;

    await logAudit(db, {
      actor: createdUser,
      action: 'USER_REGISTER',
      targetType: 'user',
      targetId: userId,
      details: `Registered new ${role} account (${email})`
    });

    const token = signToken(createdUser);
    setAuthCookie(res, token);

    return sendJson(res, 201, {
      message: 'Account created successfully.',
      user: createdUser
    });
  } catch (err) {
    return sendJson(res, 500, { error: 'Registration failed: ' + err.message });
  }
};
