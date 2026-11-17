const assert = require('assert');
const { Readable } = require('stream');
const { createServer } = require('../server');
const { resetLocalDbToSeed } = require('../lib/db');

async function invokeServer(server, path, { method = 'GET', body, cookie = '' } = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const req = new Readable({
      read() {
        if (bodyStr) this.push(Buffer.from(bodyStr));
        this.push(null);
      }
    });
    req.url = path;
    req.method = method;
    req.headers = {
      host: 'localhost:3000',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {})
    };

    const headers = {};
    const chunks = [];
    const res = {
      statusCode: 200,
      setHeader(k, v) {
        headers[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return headers[k.toLowerCase()];
      },
      write(chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      },
      end(chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        const raw = Buffer.concat(chunks).toString('utf8');
        let data = {};
        try {
          data = JSON.parse(raw);
        } catch (e) {
          data = { raw };
        }
        const setCookie = headers['set-cookie'] || '';
        resolve({
          status: res.statusCode,
          data,
          raw,
          cookie: (setCookie.split(';')[0] || '').trim() || cookie
        });
      },
      on() {},
      once() {},
      emit() {}
    };

    server.emit('request', req, res);
  });
}

async function runTests() {
  resetLocalDbToSeed();
  const server = createServer();
  const api = (path, opts) => invokeServer(server, path, opts);

  // 1. Health check
  const health = await api('/api/health');
  assert.strictEqual(health.status, 200, 'Health check should return 200');
  assert.strictEqual(health.data.status, 'ok');
  console.log('✓ GET /api/health passed');

  // 2. Register a new buyer
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Test Buyer',
      email: `buyer-${Date.now()}@example.com`,
      password: 'password123',
      role: 'buyer'
    }
  });
  assert.strictEqual(reg.status, 201, 'Registration should return 201');
  const buyerCookie = reg.cookie;
  console.log('✓ POST /api/auth/register passed');

  // 3. Role guard check: Buyer cannot create a listing or read admin queue
  const forbiddenListing = await api('/api/listings', {
    method: 'POST',
    cookie: buyerCookie,
    body: { title: 'Test Car', make: 'Toyota', model: 'Axio', year: 2020, price: 2500000, condition: 'used' }
  });
  assert.strictEqual(forbiddenListing.status, 403, 'Buyer must be blocked from POST /api/listings');

  const forbiddenAdmin = await api('/api/admin/queue', { cookie: buyerCookie });
  assert.strictEqual(forbiddenAdmin.status, 403, 'Buyer must be blocked from GET /api/admin/queue');
  console.log('✓ Role guards enforced on API routes');

  // 4. Login as verified dealer & create listing
  const dealerLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'dealer@motosheba.com', password: 'password123' }
  });
  assert.strictEqual(dealerLogin.status, 200);
  const dealerCookie = dealerLogin.cookie;

  const createListing = await api('/api/listings', {
    method: 'POST',
    cookie: dealerCookie,
    body: {
      title: '2021 Toyota Harrier Z Leather Package',
      make: 'Toyota',
      model: 'Harrier',
      year: 2021,
      price: 7850000,
      condition: 'reconditioned',
      mileage: 14000,
      location: 'Dhaka',
      features: ['Panoramic Roof', 'JBL Audio']
    }
  });
  assert.strictEqual(createListing.status, 201, 'Dealer should create listing');
  const newListingId = createListing.data.listing._id;
  console.log('✓ POST /api/listings & dealer auth passed');

  // 5. Search & Compare listings
  const listSearch = await api('/api/listings?make=Toyota&verifiedOnly=1');
  assert.strictEqual(listSearch.status, 200);
  assert(listSearch.data.listings.length >= 2, 'Search should return Toyota listings');

  const compareRes = await api(`/api/compare?ids=${newListingId},6738c0000000000000000001`);
  assert.strictEqual(compareRes.status, 200);
  assert.strictEqual(compareRes.data.listings.length, 2, 'Compare should return 2 listings');
  console.log('✓ GET /api/listings & GET /api/compare passed');

  // 6. Buyer creates inquiry & reservation, Dealer updates reservation status
  const inqRes = await api('/api/inquiries', {
    method: 'POST',
    cookie: buyerCookie,
    body: { listingId: newListingId, message: 'Is auction sheet available?' }
  });
  assert.strictEqual(inqRes.status, 201);

  const resvCreate = await api('/api/reservations', {
    method: 'POST',
    cookie: buyerCookie,
    body: { listingId: newListingId, depositAmount: 25000, notes: 'Weekend inspection hold' }
  });
  assert.strictEqual(resvCreate.status, 201);
  const reservationId = resvCreate.data.reservation._id;

  const resvUpdate = await api(`/api/reservations/${reservationId}`, {
    method: 'PATCH',
    cookie: dealerCookie,
    body: { status: 'confirmed', note: 'Confirmed showroom bay' }
  });
  assert.strictEqual(resvUpdate.status, 200);
  assert.strictEqual(resvUpdate.data.reservation.timeline.length, 2);
  console.log('✓ Inquiries & Reservations timeline workflow passed');

  // 7. Admin verification, listing moderation & audit log
  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@motosheba.com', password: 'password123' }
  });
  assert.strictEqual(adminLogin.status, 200);
  const adminCookie = adminLogin.cookie;

  const verifyRes = await api('/api/admin/verify/6738b0000000000000000002', {
    method: 'PATCH',
    cookie: adminCookie,
    body: { verificationStatus: 'verified', verificationNotes: 'Verified trade license.' }
  });
  assert.strictEqual(verifyRes.status, 200);
  assert.strictEqual(verifyRes.data.profile.verificationStatus, 'verified');

  const modRes = await api('/api/admin/listings/6738c0000000000000000006', {
    method: 'PATCH',
    cookie: adminCookie,
    body: { status: 'active', moderationNotes: 'Approved after dealer verification.' }
  });
  assert.strictEqual(modRes.status, 200);
  assert.strictEqual(modRes.data.listing.status, 'active');

  const auditRes = await api('/api/admin/audit', { cookie: adminCookie });
  assert.strictEqual(auditRes.status, 200);
  assert(auditRes.data.auditLogs.length >= 5, 'Audit log should record all sensitive actions');
  console.log('✓ Admin queue, verification, moderation & audit logs passed');

  // 8. Check all 18 HTML pages exist and are non-empty
  const fs = require('fs');
  const path = require('path');
  const pages = [
    'index.html',
    'login.html',
    'register.html',
    'profile.html',
    'listings.html',
    'listing.html',
    'compare.html',
    'my-listings.html',
    'inquiries.html',
    'reservations.html',
    'storefront.html',
    'inventory.html',
    'leads.html',
    'staff.html',
    'admin-verify.html',
    'admin-moderation.html',
    'admin-users.html',
    'admin-audit.html'
  ];
  for (const page of pages) {
    const full = path.join(__dirname, '..', 'public', page);
    assert(fs.existsSync(full), `Missing page: ${page}`);
    assert(fs.statSync(full).size > 500, `Page ${page} is unexpectedly small`);
  }
  console.log(`✓ All ${pages.length} HTML pages verified in /public`);

  resetLocalDbToSeed();
  console.log('\nALL PHASE 0 & PHASE 1 TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
