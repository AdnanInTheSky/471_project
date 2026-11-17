const { getDb, getConnectionMode, resetLocalDbToSeed } = require('../lib/db');

async function runSeed() {
  const seed = resetLocalDbToSeed();
  const db = await getDb();
  const mode = getConnectionMode();

  if (mode === 'mongodb-atlas') {
    for (const [colName, docs] of Object.entries(seed)) {
      const col = db.collection(colName);
      for (const doc of docs) {
        await col.updateOne({ _id: doc._id }, { $set: doc }, { upsert: true });
      }
    }
    console.log('Seeded MongoDB Atlas database successfully.');
  } else {
    console.log('Seeded local datastore (.data/motosheba-local.json) successfully.');
  }
}

if (require.main === module) {
  runSeed().catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}

module.exports = { runSeed };
