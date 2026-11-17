const VALID_ROLES = ['buyer', 'seller', 'dealer', 'garage', 'provider', 'admin'];
const VALID_CONDITIONS = ['new', 'reconditioned', 'used'];
const VALID_LISTING_STATUSES = ['active', 'pending', 'reserved', 'sold', 'rejected'];
const VALID_RESERVATION_STATUSES = [
  'pending',
  'confirmed',
  'inspection_scheduled',
  'completed',
  'cancelled'
];

function sanitizeString(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validateRegistration(body = {}) {
  const errors = [];
  const name = sanitizeString(body.name, 120);
  const email = sanitizeString(body.email, 160).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const role = sanitizeString(body.role || 'buyer', 30).toLowerCase();
  const phone = sanitizeString(body.phone || '', 30);
  const businessName = sanitizeString(body.businessName || '', 150);
  const licenseNo = sanitizeString(body.licenseNo || '', 80);

  if (!name || name.length < 2) {
    errors.push('Full name must be at least 2 characters.');
  }
  if (!isValidEmail(email)) {
    errors.push('A valid email address is required.');
  }
  if (!password || password.length < 6) {
    errors.push('Password must be at least 6 characters.');
  }
  const publicSelfRegisterRoles = ['buyer', 'seller', 'dealer', 'garage', 'provider'];
  if (!publicSelfRegisterRoles.includes(role)) {
    errors.push(`Role must be one of: ${publicSelfRegisterRoles.join(', ')}.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    data: { name, email, password, role, phone, businessName, licenseNo }
  };
}

function validateListing(body = {}, isUpdate = false) {
  const errors = [];
  const clean = {};

  if (!isUpdate || body.title !== undefined) {
    clean.title = sanitizeString(body.title, 160);
    if (!clean.title || clean.title.length < 4) {
      errors.push('Listing title must be at least 4 characters.');
    }
  }

  if (!isUpdate || body.make !== undefined) {
    clean.make = sanitizeString(body.make, 80);
    if (!clean.make) errors.push('Vehicle make is required.');
  }

  if (!isUpdate || body.model !== undefined) {
    clean.model = sanitizeString(body.model, 80);
    if (!clean.model) errors.push('Vehicle model is required.');
  }

  if (!isUpdate || body.year !== undefined) {
    const year = Number(body.year);
    const maxYear = new Date().getFullYear() + 1;
    if (!Number.isInteger(year) || year < 1970 || year > maxYear) {
      errors.push(`Year must be between 1970 and ${maxYear}.`);
    } else {
      clean.year = year;
    }
  }

  if (!isUpdate || body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) {
      errors.push('Price must be a positive number.');
    } else {
      clean.price = Math.round(price);
    }
  }

  if (!isUpdate || body.condition !== undefined) {
    const condition = sanitizeString(body.condition || 'used', 30).toLowerCase();
    if (!VALID_CONDITIONS.includes(condition)) {
      errors.push(`Condition must be one of: ${VALID_CONDITIONS.join(', ')}.`);
    } else {
      clean.condition = condition;
    }
  }

  if (body.mileage !== undefined) {
    const mileage = Number(body.mileage);
    clean.mileage = Number.isFinite(mileage) && mileage >= 0 ? Math.round(mileage) : 0;
  } else if (!isUpdate) {
    clean.mileage = 0;
  }

  if (body.fuelType !== undefined || !isUpdate) {
    clean.fuelType = sanitizeString(body.fuelType || 'Octane / Petrol', 50);
  }
  if (body.transmission !== undefined || !isUpdate) {
    clean.transmission = sanitizeString(body.transmission || 'Automatic', 50);
  }
  if (body.bodyType !== undefined || !isUpdate) {
    clean.bodyType = sanitizeString(body.bodyType || 'Sedan', 50);
  }
  if (body.color !== undefined || !isUpdate) {
    clean.color = sanitizeString(body.color || 'Pearl White', 50);
  }
  if (body.engineCc !== undefined || !isUpdate) {
    const cc = Number(body.engineCc);
    clean.engineCc = Number.isFinite(cc) && cc > 0 ? Math.round(cc) : 1500;
  }
  if (body.location !== undefined || !isUpdate) {
    clean.location = sanitizeString(body.location || 'Dhaka', 100);
  }
  if (body.chassisNo !== undefined || !isUpdate) {
    clean.chassisNo = sanitizeString(body.chassisNo || '', 80);
  }
  if (body.registrationYear !== undefined || !isUpdate) {
    clean.registrationYear = sanitizeString(String(body.registrationYear || ''), 20);
  }
  if (body.description !== undefined || !isUpdate) {
    clean.description = sanitizeString(body.description || '', 3000);
  }
  if (body.images !== undefined || !isUpdate) {
    if (Array.isArray(body.images)) {
      clean.images = body.images
        .map((img) => sanitizeString(img, 500000))
        .filter(Boolean)
        .slice(0, 8);
    } else if (typeof body.images === 'string' && body.images.trim()) {
      clean.images = body.images
        .split(',')
        .map((s) => sanitizeString(s, 500000))
        .filter(Boolean)
        .slice(0, 8);
    } else if (!isUpdate) {
      clean.images = [];
    }
  }
  if (body.features !== undefined || !isUpdate) {
    if (Array.isArray(body.features)) {
      clean.features = body.features.map((f) => sanitizeString(f, 80)).filter(Boolean).slice(0, 20);
    } else if (typeof body.features === 'string') {
      clean.features = body.features
        .split(',')
        .map((f) => sanitizeString(f, 80))
        .filter(Boolean)
        .slice(0, 20);
    } else if (!isUpdate) {
      clean.features = [];
    }
  }
  if (body.status !== undefined) {
    const status = sanitizeString(body.status, 30).toLowerCase();
    if (!VALID_LISTING_STATUSES.includes(status)) {
      errors.push(`Status must be one of: ${VALID_LISTING_STATUSES.join(', ')}.`);
    } else {
      clean.status = status;
    }
  }

  return { valid: errors.length === 0, errors, data: clean };
}

function validateInquiry(body = {}) {
  const errors = [];
  const listingId = sanitizeString(body.listingId, 80);
  const message = sanitizeString(body.message, 1500);
  const phone = sanitizeString(body.phone || '', 40);

  if (!listingId) errors.push('Listing ID is required.');
  if (!message || message.length < 3) errors.push('Message must be at least 3 characters.');

  return {
    valid: errors.length === 0,
    errors,
    data: { listingId, message, phone }
  };
}

function validateReservation(body = {}) {
  const errors = [];
  const listingId = sanitizeString(body.listingId, 80);
  const preferredDate = sanitizeString(body.preferredDate || '', 40);
  const notes = sanitizeString(body.notes || '', 1000);
  const depositAmount = Number(body.depositAmount || 10000);
  const inspectionRequested = Boolean(body.inspectionRequested);

  if (!listingId) errors.push('Listing ID is required.');
  if (!Number.isFinite(depositAmount) || depositAmount < 0) {
    errors.push('Deposit amount must be a valid non-negative number.');
  }

  return {
    valid: errors.length === 0,
    errors,
    data: {
      listingId,
      preferredDate,
      notes,
      depositAmount: Math.round(depositAmount),
      inspectionRequested
    }
  };
}

module.exports = {
  VALID_ROLES,
  VALID_CONDITIONS,
  VALID_LISTING_STATUSES,
  VALID_RESERVATION_STATUSES,
  sanitizeString,
  isValidEmail,
  validateRegistration,
  validateListing,
  validateInquiry,
  validateReservation
};
