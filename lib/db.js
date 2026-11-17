require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');

let cachedClient = null;
let cachedDb = null;
let indexesEnsured = false;
let connectionMode = 'uninitialized';

const LOCAL_DB_DIR = path.join(process.cwd(), '.data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'motosheba-local.json');

function hasRealMongoUri() {
  const uri = (process.env.MONGODB_URI || '').trim();
  if (!uri) return false;
  if (uri.includes('<username>') || uri.includes('<password>') || uri.includes('cluster0.example')) {
    return false;
  }
  return uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://');
}

function generateId() {
  return new ObjectId().toString();
}

function toIdQuery(id) {
  if (!id) return { _id: '__none__' };
  const str = String(id);
  if (ObjectId.isValid(str) && str.length === 24) {
    return { $or: [{ _id: new ObjectId(str) }, { _id: str }] };
  }
  return { _id: str };
}

function normalizeDoc(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const copy = { ...doc };
  if (copy._id) copy._id = String(copy._id);
  return copy;
}

function createInitialSeedData() {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 172800000).toISOString();
  const passwordHash = bcrypt.hashSync('password123', 10);

  const adminId = '6738a0000000000000000001';
  const dealer1Id = '6738a0000000000000000002';
  const dealer2Id = '6738a0000000000000000003';
  const seller1Id = '6738a0000000000000000004';
  const buyer1Id = '6738a0000000000000000005';

  const users = [
    {
      _id: adminId,
      name: 'MotoSheba Admin',
      email: 'admin@motosheba.com',
      phone: '+8801711000001',
      passwordHash,
      role: 'admin',
      status: 'active',
      verified: true,
      createdAt: twoDaysAgo
    },
    {
      _id: dealer1Id,
      name: 'Rahim Motors Ltd.',
      email: 'dealer@motosheba.com',
      phone: '+8801711223344',
      passwordHash,
      role: 'dealer',
      status: 'active',
      verified: true,
      createdAt: twoDaysAgo
    },
    {
      _id: dealer2Id,
      name: 'Chittagong Auto Imports',
      email: 'ctgdealer@motosheba.com',
      phone: '+8801819556677',
      passwordHash,
      role: 'dealer',
      status: 'active',
      verified: false,
      createdAt: yesterday
    },
    {
      _id: seller1Id,
      name: 'Tanvir Ahmed',
      email: 'seller@motosheba.com',
      phone: '+8801911334455',
      passwordHash,
      role: 'seller',
      status: 'active',
      verified: true,
      createdAt: twoDaysAgo
    },
    {
      _id: buyer1Id,
      name: 'Nusrat Jahan',
      email: 'buyer@motosheba.com',
      phone: '+8801611778899',
      passwordHash,
      role: 'buyer',
      status: 'active',
      verified: true,
      createdAt: yesterday
    }
  ];

  const profiles = [
    {
      _id: '6738b0000000000000000001',
      userId: dealer1Id,
      role: 'dealer',
      businessName: 'Rahim Motors Ltd. (Tejgaon Flagship)',
      licenseNo: 'TRAD/DNCC/049182/2023',
      tinNo: '491827364512',
      address: '214 Bir Uttam Mir Shawkat Sarak, Tejgaon, Dhaka 1208',
      city: 'Dhaka',
      phone: '+8801711223344',
      bio: 'BARVIDA member showroom specializing in JDM auction grade 4.5+ reconditioned Toyota and Honda vehicles with transparent auction sheets.',
      verificationStatus: 'verified',
      verificationNotes: 'Trade license and BARVIDA membership verified by admin.',
      staff: [
        {
          id: 'st-1',
          name: 'Kamrul Hasan',
          email: 'kamrul@rahimmotors.com',
          phone: '+8801711223345',
          title: 'Senior Sales Executive',
          status: 'active',
          addedAt: twoDaysAgo
        },
        {
          id: 'st-2',
          name: 'Farhana Yeasmin',
          email: 'farhana@rahimmotors.com',
          phone: '+8801711223346',
          title: 'Finance & Documentation Desk',
          status: 'active',
          addedAt: yesterday
        }
      ],
      updatedAt: yesterday
    },
    {
      _id: '6738b0000000000000000002',
      userId: dealer2Id,
      role: 'dealer',
      businessName: 'Chittagong Auto Imports',
      licenseNo: 'TRAD/CCC/088120/2025',
      tinNo: '778891234500',
      address: 'Agrabad Access Road, Chattogram',
      city: 'Chattogram',
      phone: '+8801819556677',
      bio: 'Direct port importer of Japanese SUVs and hybrid sedans.',
      verificationStatus: 'pending',
      verificationNotes: 'Awaiting trade license verification review.',
      staff: [],
      updatedAt: yesterday
    },
    {
      _id: '6738b0000000000000000003',
      userId: seller1Id,
      role: 'seller',
      businessName: 'Tanvir Ahmed (Private Owner)',
      licenseNo: 'NID-3918472619',
      tinNo: '',
      address: 'Road 11, Banani, Dhaka',
      city: 'Dhaka',
      phone: '+8801911334455',
      bio: 'Private car owner selling personal family-driven vehicle with full BRTA smart card.',
      verificationStatus: 'verified',
      verificationNotes: 'NID and BRTA smart card verified.',
      staff: [],
      updatedAt: twoDaysAgo
    }
  ];

  const listings = [
    {
      _id: '6738c0000000000000000001',
      sellerId: dealer1Id,
      sellerName: 'Rahim Motors Ltd.',
      sellerRole: 'dealer',
      sellerVerified: true,
      title: '2021 Toyota Corolla Cross Z Leather Package Hybrid',
      make: 'Toyota',
      model: 'Corolla Cross',
      year: 2021,
      price: 4350000,
      mileage: 18500,
      fuelType: 'Hybrid (Octane)',
      transmission: 'Automatic (e-CVT)',
      bodyType: 'SUV',
      color: 'Platinum White Pearl',
      engineCc: 1800,
      condition: 'reconditioned',
      location: 'Dhaka',
      chassisNo: 'ZVG11-1029384',
      registrationYear: 'Unregistered',
      description: 'Auction Grade 4.5B Japanese reconditioned unit. Full Z Leather Package, panoramic moonroof, kick sensor power back door, Toyota Safety Sense, 360 camera, original auction sheet verified.',
      images: [
        'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=900&q=80'
      ],
      features: ['Panoramic Roof', 'Toyota Safety Sense', 'Leather Seats', '360 Camera', 'Power Tailgate', 'Apple CarPlay'],
      status: 'active',
      moderationNotes: 'Verified auction sheet attached.',
      createdAt: twoDaysAgo,
      updatedAt: twoDaysAgo
    },
    {
      _id: '6738c0000000000000000002',
      sellerId: dealer1Id,
      sellerName: 'Rahim Motors Ltd.',
      sellerRole: 'dealer',
      sellerVerified: true,
      title: '2020 Honda Civic FE Turbo RS Sedan',
      make: 'Honda',
      model: 'Civic',
      year: 2020,
      price: 3890000,
      mileage: 24200,
      fuelType: 'Octane / Petrol',
      transmission: 'Automatic (CVT)',
      bodyType: 'Sedan',
      color: 'Sonic Gray Pearl',
      engineCc: 1500,
      condition: 'reconditioned',
      location: 'Dhaka',
      chassisNo: 'FC1-8847291',
      registrationYear: '2023',
      description: '1.5L VTEC Turbo RS trim with paddle shifters, Honda Sensing suite, Bose 12-speaker premium audio, 18-inch matte black alloy wheels, and complete dealership service record.',
      images: [
        'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=900&q=80'
      ],
      features: ['1.5L VTEC Turbo', 'Honda Sensing', 'Sunroof', 'Paddle Shifters', 'LED Headlights', 'Digital Cluster'],
      status: 'active',
      moderationNotes: 'Approved.',
      createdAt: twoDaysAgo,
      updatedAt: twoDaysAgo
    },
    {
      _id: '6738c0000000000000000003',
      sellerId: seller1Id,
      sellerName: 'Tanvir Ahmed',
      sellerRole: 'seller',
      sellerVerified: true,
      title: '2018 Toyota Premio F-EX Package Push Start',
      make: 'Toyota',
      model: 'Premio',
      year: 2018,
      price: 3450000,
      mileage: 41000,
      fuelType: 'Octane / Petrol',
      transmission: 'Automatic',
      bodyType: 'Sedan',
      color: 'Red Mica Metallic',
      engineCc: 1500,
      condition: 'used',
      location: 'Dhaka',
      chassisNo: 'NZT260-3194820',
      registrationYear: '2021',
      description: 'Self-driven family sedan registered in 2021 (Dhaka Metro-Ga). Beige leather interior, power driver seat, wooden steering, idle stop, original papers and smart card ready for immediate name transfer.',
      images: [
        'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=900&q=80'
      ],
      features: ['Push Start', 'Beige Interior', 'Power Seat', 'Wooden Steering', 'Idle Stop', 'Smart Card Ready'],
      status: 'active',
      moderationNotes: 'Smart card verified.',
      createdAt: yesterday,
      updatedAt: yesterday
    },
    {
      _id: '6738c0000000000000000004',
      sellerId: dealer1Id,
      sellerName: 'Rahim Motors Ltd.',
      sellerRole: 'dealer',
      sellerVerified: true,
      title: '2022 Toyota Land Cruiser Prado TX-L 7-Seater',
      make: 'Toyota',
      model: 'Land Cruiser Prado',
      year: 2022,
      price: 12800000,
      mileage: 11200,
      fuelType: 'Octane / Petrol',
      transmission: 'Automatic (6-Speed)',
      bodyType: 'SUV',
      color: 'Attitude Black Mica',
      engineCc: 2700,
      condition: 'reconditioned',
      location: 'Dhaka',
      chassisNo: 'TRJ150W-9928172',
      registrationYear: 'Unregistered',
      description: '7-seater TX-L Modellista aero kit, ventilated beige leather seats, sunroof, 3rd-row electric folding seats, surround view monitor, auction grade 5A.',
      images: [
        'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=900&q=80'
      ],
      features: ['7 Seater', 'Modellista Kit', 'Ventilated Seats', 'Sunroof', '4WD', 'Auction Grade 5'],
      status: 'active',
      moderationNotes: 'Approved.',
      createdAt: yesterday,
      updatedAt: yesterday
    },
    {
      _id: '6738c0000000000000000005',
      sellerId: dealer1Id,
      sellerName: 'Rahim Motors Ltd.',
      sellerRole: 'dealer',
      sellerVerified: true,
      title: '2019 Nissan X-Trail Hybrid 20Xi 4WD',
      make: 'Nissan',
      model: 'X-Trail',
      year: 2019,
      price: 3320000,
      mileage: 34000,
      fuelType: 'Hybrid (Octane)',
      transmission: 'Automatic',
      bodyType: 'SUV',
      color: 'Dark Olive',
      engineCc: 2000,
      condition: 'reconditioned',
      location: 'Dhaka',
      chassisNo: 'HT32-449182',
      registrationYear: '2023',
      description: 'Intelligent 4x4 hybrid SUV with ProPILOT adaptive cruise control, panoramic sunroof, 360 Around View Monitor, emergency braking, and waterproof leather seats.',
      images: [
        'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=900&q=80'
      ],
      features: ['Intelligent 4WD', 'ProPILOT', 'Panoramic Sunroof', '360 Camera', 'Emergency Braking'],
      status: 'active',
      moderationNotes: 'Approved.',
      createdAt: yesterday,
      updatedAt: yesterday
    },
    {
      _id: '6738c0000000000000000006',
      sellerId: dealer2Id,
      sellerName: 'Chittagong Auto Imports',
      sellerRole: 'dealer',
      sellerVerified: false,
      title: '2020 MitsubishiOutlander PHEV G-Plus Package',
      make: 'Mitsubishi',
      model: 'Outlander PHEV',
      year: 2020,
      price: 4100000,
      mileage: 29500,
      fuelType: 'Plug-in Hybrid',
      transmission: 'Automatic',
      bodyType: 'SUV',
      color: 'Sterling Silver',
      engineCc: 2400,
      condition: 'reconditioned',
      location: 'Chattogram',
      chassisNo: 'GG3W-009281',
      registrationYear: 'Unregistered',
      description: 'Twin-motor S-AWC plug-in hybrid just cleared from Chattogram port. Fast charger support, Bilstein suspension, Rockford Fosgate sound.',
      images: [
        'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80'
      ],
      features: ['Plug-in Hybrid', 'S-AWC 4WD', 'Bilstein Shocks', 'Sunroof', 'Power Tailgate'],
      status: 'pending',
      moderationNotes: 'Pending initial listing review for unverified dealer.',
      createdAt: now,
      updatedAt: now
    }
  ];

  const inquiries = [
    {
      _id: '6738d0000000000000000001',
      listingId: '6738c0000000000000000001',
      listingTitle: '2021 Toyota Corolla Cross Z Leather Package Hybrid',
      buyerId: buyer1Id,
      buyerName: 'Nusrat Jahan',
      buyerEmail: 'buyer@motosheba.com',
      buyerPhone: '+8801611778899',
      sellerId: dealer1Id,
      sellerName: 'Rahim Motors Ltd.',
      message: 'Assalamu Alaikum, is the original Japanese auction sheet verifiable online, and can I bring a third-party inspector this Saturday?',
      replies: [
        {
          id: 'rep-1',
          authorId: dealer1Id,
          authorName: 'Rahim Motors Ltd.',
          authorRole: 'dealer',
          message: 'Walaikum Assalam! Yes, chassis ZVG11-1029384 is verifiable in the TrueReport archive and you are welcome to bring any inspector between 10 AM and 7 PM.',
          at: yesterday
        }
      ],
      status: 'replied',
      createdAt: twoDaysAgo,
      updatedAt: yesterday
    },
    {
      _id: '6738d0000000000000000002',
      listingId: '6738c0000000000000000003',
      listingTitle: '2018 Toyota Premio F-EX Package Push Start',
      buyerId: buyer1Id,
      buyerName: 'Nusrat Jahan',
      buyerEmail: 'buyer@motosheba.com',
      buyerPhone: '+8801611778899',
      sellerId: seller1Id,
      sellerName: 'Tanvir Ahmed',
      message: 'Is the tax token and fitness updated through 2027? Also is the price slightly negotiable?',
      replies: [],
      status: 'open',
      createdAt: yesterday,
      updatedAt: yesterday
    }
  ];

  const reservations = [
    {
      _id: '6738e0000000000000000001',
      listingId: '6738c0000000000000000001',
      listingTitle: '2021 Toyota Corolla Cross Z Leather Package Hybrid',
      listingPrice: 4350000,
      buyerId: buyer1Id,
      buyerName: 'Nusrat Jahan',
      buyerEmail: 'buyer@motosheba.com',
      sellerId: dealer1Id,
      sellerName: 'Rahim Motors Ltd.',
      depositAmount: 25000,
      preferredDate: '2026-11-21',
      inspectionRequested: true,
      notes: 'Requesting 48-hour hold for physical showroom inspection and hybrid battery health scan.',
      status: 'confirmed',
      timeline: [
        {
          status: 'pending',
          note: 'Reservation requested by buyer with BDT 25,000 token hold intent.',
          actorId: buyer1Id,
          actorName: 'Nusrat Jahan',
          at: twoDaysAgo
        },
        {
          status: 'confirmed',
          note: 'Dealer confirmed vehicle hold and scheduled Saturday 11:00 AM inspection bay.',
          actorId: dealer1Id,
          actorName: 'Rahim Motors Ltd.',
          at: yesterday
        }
      ],
      createdAt: twoDaysAgo,
      updatedAt: yesterday
    }
  ];

  const auditLogs = [
    {
      _id: '6738f0000000000000000001',
      actorId: adminId,
      actorEmail: 'admin@motosheba.com',
      actorRole: 'admin',
      action: 'VERIFY_PROFILE',
      targetType: 'profile',
      targetId: '6738b0000000000000000001',
      details: 'Approved dealer verification for Rahim Motors Ltd. (TRAD/DNCC/049182/2023)',
      at: twoDaysAgo
    },
    {
      _id: '6738f0000000000000000002',
      actorId: adminId,
      actorEmail: 'admin@motosheba.com',
      actorRole: 'admin',
      action: 'VERIFY_PROFILE',
      targetType: 'profile',
      targetId: '6738b0000000000000000003',
      details: 'Approved private seller verification for Tanvir Ahmed',
      at: twoDaysAgo
    },
    {
      _id: '6738f0000000000000000003',
      actorId: dealer1Id,
      actorEmail: 'dealer@motosheba.com',
      actorRole: 'dealer',
      action: 'RESERVATION_STATUS_CHANGE',
      targetType: 'reservation',
      targetId: '6738e0000000000000000001',
      details: 'Status updated from pending to confirmed',
      at: yesterday
    }
  ];

  return {
    users,
    profiles,
    listings,
    inquiries,
    reservations,
    auditLogs
  };
}

function loadLocalData() {
  try {
    if (!fs.existsSync(LOCAL_DB_DIR)) {
      fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(LOCAL_DB_FILE)) {
      const seed = createInitialSeedData();
      fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
      return seed;
    }
    const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return createInitialSeedData();
  }
}

function saveLocalData(store) {
  try {
    if (!fs.existsSync(LOCAL_DB_DIR)) {
      fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    // Ignore write failure in read-only serverless environment
  }
}

function matchesQuery(doc, query = {}) {
  if (!query || Object.keys(query).length === 0) return true;

  for (const [key, cond] of Object.entries(query)) {
    if (key === '$or' && Array.isArray(cond)) {
      if (!cond.some((sub) => matchesQuery(doc, sub))) return false;
      continue;
    }
    if (key === '$and' && Array.isArray(cond)) {
      if (!cond.every((sub) => matchesQuery(doc, sub))) return false;
      continue;
    }
    if (key === '$text' && cond && cond.$search) {
      const terms = String(cond.$search)
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      const hay = `${doc.title || ''} ${doc.description || ''} ${doc.make || ''} ${doc.model || ''} ${doc.location || ''}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
      continue;
    }

    const val = key === '_id' ? String(doc._id) : doc[key];

    if (cond && typeof cond === 'object' && !(cond instanceof RegExp) && !ObjectId.isValid(cond)) {
      if (cond.$in && Array.isArray(cond.$in)) {
        const strList = cond.$in.map((x) => String(x));
        if (!strList.includes(String(val))) return false;
        continue;
      }
      if (cond.$regex !== undefined) {
        const flags = cond.$options || 'i';
        const re = cond.$regex instanceof RegExp ? cond.$regex : new RegExp(cond.$regex, flags);
        if (!re.test(String(val || ''))) return false;
        continue;
      }
      if (cond.$gte !== undefined && !(Number(val) >= Number(cond.$gte))) return false;
      if (cond.$lte !== undefined && !(Number(val) <= Number(cond.$lte))) return false;
      if (cond.$gt !== undefined && !(Number(val) > Number(cond.$gt))) return false;
      if (cond.$lt !== undefined && !(Number(val) < Number(cond.$lt))) return false;
      if (cond.$ne !== undefined && String(val) === String(cond.$ne)) return false;
      continue;
    }

    if (cond instanceof RegExp) {
      if (!cond.test(String(val || ''))) return false;
      continue;
    }

    if (String(val) !== String(cond)) {
      return false;
    }
  }
  return true;
}

class LocalCollection {
  constructor(store, name) {
    this.store = store;
    this.name = name;
    if (!Array.isArray(this.store[name])) {
      this.store[name] = [];
    }
  }

  get rows() {
    return this.store[this.name];
  }

  async createIndex() {
    return 'local_idx_ok';
  }

  async findOne(query = {}) {
    const found = this.rows.find((doc) => matchesQuery(doc, query));
    return found ? normalizeDoc(found) : null;
  }

  find(query = {}) {
    let results = this.rows.filter((doc) => matchesQuery(doc, query)).map(normalizeDoc);

    const cursor = {
      sort(sortSpec = {}) {
        const entries = Object.entries(sortSpec);
        if (entries.length > 0) {
          results.sort((a, b) => {
            for (const [field, dir] of entries) {
              const av = a[field];
              const bv = b[field];
              if (av === bv) continue;
              const cmp = av > bv ? 1 : -1;
              return dir === -1 ? -cmp : cmp;
            }
            return 0;
          });
        }
        return cursor;
      },
      skip(n = 0) {
        if (n > 0) results = results.slice(n);
        return cursor;
      },
      limit(n = 0) {
        if (n > 0) results = results.slice(0, n);
        return cursor;
      },
      async toArray() {
        return results;
      }
    };
    return cursor;
  }

  async countDocuments(query = {}) {
    return this.rows.filter((doc) => matchesQuery(doc, query)).length;
  }

  async insertOne(doc) {
    const newDoc = {
      ...doc,
      _id: doc._id ? String(doc._id) : generateId()
    };
    this.rows.push(newDoc);
    saveLocalData(this.store);
    return { acknowledged: true, insertedId: newDoc._id };
  }

  async updateOne(query, update, options = {}) {
    const idx = this.rows.findIndex((doc) => matchesQuery(doc, query));
    if (idx === -1) {
      if (options.upsert) {
        const base = {};
        for (const [k, v] of Object.entries(query)) {
          if (!k.startsWith('$')) base[k] = v;
        }
        const merged = {
          ...base,
          ...(update.$set || {}),
          _id: base._id ? String(base._id) : generateId()
        };
        this.rows.push(merged);
        saveLocalData(this.store);
        return { matchedCount: 0, modifiedCount: 0, upsertedId: merged._id };
      }
      return { matchedCount: 0, modifiedCount: 0 };
    }

    const target = { ...this.rows[idx] };
    if (update.$set) {
      Object.assign(target, update.$set);
    }
    if (update.$push) {
      for (const [k, v] of Object.entries(update.$push)) {
        const arr = Array.isArray(target[k]) ? [...target[k]] : [];
        arr.push(v);
        target[k] = arr;
      }
    }
    this.rows[idx] = target;
    saveLocalData(this.store);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async deleteOne(query) {
    const idx = this.rows.findIndex((doc) => matchesQuery(doc, query));
    if (idx === -1) return { deletedCount: 0 };
    this.rows.splice(idx, 1);
    saveLocalData(this.store);
    return { deletedCount: 1 };
  }
}

let localStoreSingleton = null;

function getLocalDb() {
  if (!localStoreSingleton) {
    localStoreSingleton = loadLocalData();
  }
  return {
    isLocalFallback: true,
    collection(name) {
      return new LocalCollection(localStoreSingleton, name);
    },
    async command(cmd) {
      return { ok: 1, cmd };
    }
  };
}

async function ensureIndexes(db) {
  if (indexesEnsured) return;
  try {
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('profiles').createIndex({ userId: 1 });
    await db.collection('listings').createIndex(
      { title: 'text', description: 'text' },
      { name: 'listings_text_idx' }
    );
    await db.collection('listings').createIndex(
      { make: 1, model: 1, price: 1 },
      { name: 'listings_make_model_price_idx' }
    );
    await db.collection('inquiries').createIndex({ listingId: 1 });
    await db.collection('reservations').createIndex({ listingId: 1 });
    await db.collection('auditLogs').createIndex({ at: -1 });
    indexesEnsured = true;
  } catch (err) {
    // Ignore non-fatal index errors on restricted tiers
    indexesEnsured = true;
  }
}

async function getDb() {
  if (cachedDb) return cachedDb;

  if (hasRealMongoUri()) {
    try {
      const uri = process.env.MONGODB_URI.trim();
      const dbName = (process.env.MONGODB_DB || 'motosheba').trim();
      if (!cachedClient) {
        cachedClient = new MongoClient(uri, {
          maxPoolSize: 10,
          minPoolSize: 1,
          serverSelectionTimeoutMS: 5000
        });
        await cachedClient.connect();
      }
      cachedDb = cachedClient.db(dbName);
      connectionMode = 'mongodb-atlas';
      await ensureIndexes(cachedDb);
      return cachedDb;
    } catch (err) {
      console.warn('MongoDB Atlas connection failed, falling back to local datastore:', err.message);
    }
  }

  cachedDb = getLocalDb();
  connectionMode = 'local-json-store';
  await ensureIndexes(cachedDb);
  return cachedDb;
}

function getConnectionMode() {
  return connectionMode;
}

function resetLocalDbToSeed() {
  localStoreSingleton = createInitialSeedData();
  saveLocalData(localStoreSingleton);
  return localStoreSingleton;
}

module.exports = {
  getDb,
  getConnectionMode,
  toIdQuery,
  normalizeDoc,
  generateId,
  resetLocalDbToSeed,
  ObjectId
};
