const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// ─── In-memory cloud backup state ────────────────────────────────────────────
let cloudBackupConfig = {
  uri: null,          // MongoDB Atlas / cloud URI
  status: 'NOT_CONFIGURED',  // NOT_CONFIGURED | CONNECTED | SYNCING | FAILED
  lastSync: null,
  lastError: null,
  syncedCollections: [],
  totalDocsSynced: 0,
};

let cloudConnection = null; // Separate mongoose connection for cloud

// ─── GET /api/database/stats ─────────────────────────────────────────────────
// Returns per-collection document counts and DB-level stats
router.get('/stats', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    // Get DB-level stats
    const dbStats = await db.command({ dbStats: 1 });

    // Get all collections and their counts
    const collections = await db.listCollections().toArray();
    const collectionStats = [];

    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      let colStats = null;
      try {
        colStats = await db.command({ collStats: col.name });
      } catch (_) { /* ignore */ }
      const indexes = await db.collection(col.name).indexes().catch(() => []);
      collectionStats.push({
        name: col.name,
        documentCount: count,
        sizeBytes: colStats?.size || 0,
        avgDocSize: colStats?.avgObjSize || 0,
        indexes: indexes.length || colStats?.nindexes || 0,
      });
    }

    res.json({
      database: dbStats.db,
      totalCollections: dbStats.collections,
      totalDocuments: collectionStats.reduce((sum, c) => sum + c.documentCount, 0),
      dataSize: dbStats.dataSize,
      storageSize: dbStats.storageSize,
      indexSize: dbStats.indexSize,
      collections: collectionStats.sort((a, b) => b.documentCount - a.documentCount),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/database/collections/:name/documents ──────────────────────────
// Browse documents in any collection (paginated)
router.get('/collections/:name/documents', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const { name } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    const collection = db.collection(name);
    const totalDocs = await collection.countDocuments();
    const documents = await collection
      .find({})
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({
      collection: name,
      page,
      limit,
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      documents,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/database/backup/status ─────────────────────────────────────────
router.get('/backup/status', (req, res) => {
  res.json(cloudBackupConfig);
});

// ─── POST /api/database/backup/configure ─────────────────────────────────────
// User pastes their MongoDB Atlas URI and we connect + verify
router.post('/backup/configure', async (req, res) => {
  try {
    const { uri } = req.body;
    if (!uri || !uri.startsWith('mongodb')) {
      return res.status(400).json({ error: 'Invalid MongoDB URI. Must start with mongodb:// or mongodb+srv://' });
    }

    // Close existing cloud connection if any
    if (cloudConnection) {
      await cloudConnection.close().catch(() => {});
      cloudConnection = null;
    }

    cloudBackupConfig.status = 'CONNECTING';
    cloudBackupConfig.uri = uri;
    cloudBackupConfig.lastError = null;

    // Create a separate mongoose connection to the cloud
    cloudConnection = await mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    }).asPromise();

    cloudBackupConfig.status = 'CONNECTED';
    cloudBackupConfig.lastError = null;

    // Get the cloud DB name
    const cloudDbName = cloudConnection.db.databaseName;

    res.json({
      message: `Connected to cloud database: ${cloudDbName}`,
      status: 'CONNECTED',
      cloudDbName,
    });
  } catch (e) {
    cloudBackupConfig.status = 'FAILED';
    cloudBackupConfig.lastError = e.message;
    if (cloudConnection) {
      await cloudConnection.close().catch(() => {});
      cloudConnection = null;
    }
    res.status(500).json({ error: `Cloud connection failed: ${e.message}`, status: 'FAILED' });
  }
});

// ─── POST /api/database/backup/sync ──────────────────────────────────────────
// Replicate all local data to the cloud MongoDB
router.post('/backup/sync', async (req, res) => {
  try {
    if (!cloudConnection || cloudBackupConfig.status === 'NOT_CONFIGURED') {
      return res.status(400).json({ error: 'Cloud backup not configured. Set a URI first.' });
    }
    if (cloudBackupConfig.status === 'SYNCING') {
      return res.status(409).json({ error: 'Sync already in progress' });
    }

    cloudBackupConfig.status = 'SYNCING';
    cloudBackupConfig.syncedCollections = [];
    cloudBackupConfig.totalDocsSynced = 0;

    // Respond immediately
    res.json({ message: 'Backup sync started', status: 'SYNCING' });

    // Async replication
    const localDb = mongoose.connection.db;
    const cloudDb = cloudConnection.db;
    const collections = await localDb.listCollections().toArray();

    for (const col of collections) {
      try {
        const localCollection = localDb.collection(col.name);
        const cloudCollection = cloudDb.collection(col.name);
        const documents = await localCollection.find({}).toArray();

        if (documents.length > 0) {
          // Drop and replace in cloud for a clean backup
          await cloudCollection.deleteMany({});
          await cloudCollection.insertMany(documents);
        }

        cloudBackupConfig.syncedCollections.push({
          name: col.name,
          documentCount: documents.length,
          syncedAt: new Date().toISOString(),
        });
        cloudBackupConfig.totalDocsSynced += documents.length;
      } catch (colErr) {
        cloudBackupConfig.syncedCollections.push({
          name: col.name,
          error: colErr.message,
        });
      }
    }

    cloudBackupConfig.status = 'CONNECTED';
    cloudBackupConfig.lastSync = new Date().toISOString();
  } catch (e) {
    cloudBackupConfig.status = 'FAILED';
    cloudBackupConfig.lastError = e.message;
  }
});

// ─── POST /api/database/backup/disconnect ────────────────────────────────────
router.post('/backup/disconnect', async (req, res) => {
  try {
    if (cloudConnection) {
      await cloudConnection.close().catch(() => {});
      cloudConnection = null;
    }
    cloudBackupConfig = {
      uri: null,
      status: 'NOT_CONFIGURED',
      lastSync: null,
      lastError: null,
      syncedCollections: [],
      totalDocsSynced: 0,
    };
    res.json({ message: 'Cloud backup disconnected', status: 'NOT_CONFIGURED' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
