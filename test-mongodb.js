// test-mongodb.js - MongoClient ping test (uses MONGODB_URI from .env)
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env.MONGODB_URI || "mongodb+srv://josephjuniorottowilson_db_user:<db_password>@cluster0.tvdktss.mongodb.net/wfms?retryWrites=true&w=majority";

console.log('🔍 Testing MongoDB Connection...');

if (!uri || uri.includes('<db_password>')) {
  console.error('❌ MONGODB_URI not set or contains placeholder. Please set `MONGODB_URI` in .env');
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    console.log('✅ Pinged your deployment. You successfully connected to MongoDB!');
  } catch (err) {
    console.error('❌ Connection failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    try { await client.close(); } catch (e) { /* ignore */ }
  }
}

run().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});