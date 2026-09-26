const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const dns = require('dns');

// Ensure DNS resolvers can resolve Atlas SRV records
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (_) {}

// ─── Local Replica & Cloud Backup State ─────────────────────────────────────
let localReplicaConfig = {
  name: 'resilify_replica',
  status: 'STANDBY', // STANDBY | SYNCING | SYNCHRONIZED | ERROR
  lastSync: null,
  totalDocsSynced: 0,
  collections: [],
  autoSyncIntervalSeconds: 30,
};

let cloudBackupConfig = {
  uri: null,          // MongoDB Atlas / cloud URI
  status: 'NOT_CONFIGURED',  // NOT_CONFIGURED | CONNECTED | SYNCING | FAILED
  lastSync: null,
  lastError: null,
  syncedCollections: [],
  totalDocsSynced: 0,
};

let cloudConnection = null; // Separate mongoose connection for cloud
let localReplicaConnection = null; // Separate connection to local replica DB

// Initialize local replica connection
async function getLocalReplicaConnection() {
  if (!localReplicaConnection || localReplicaConnection.readyState !== 1) {
    try {
      const baseUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/resilify';
      const replicaUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/resilify_replica$1');
      localReplicaConnection = await mongoose.createConnection(replicaUri, {
        serverSelectionTimeoutMS: 5000,
      }).asPromise();
    } catch (e) {
      console.warn('[LocalReplica] Connect warning:', e.message);
    }
  }
  return localReplicaConnection;
}

// Core replication function: Primary DB -> Target DB
async function replicateDatabase(targetConnection, targetConfig) {
  const localDb = mongoose.connection.db;
  if (!localDb || !targetConnection || !targetConnection.db) return false;

  const targetDb = targetConnection.db;
  const collections = await localDb.listCollections().toArray();
  const syncedCols = [];
  let totalDocs = 0;

  for (const col of collections) {
    // Skip internal system collections
    if (col.name.startsWith('system.')) continue;
    try {
      const sourceCol = localDb.collection(col.name);
      const targetCol = targetDb.collection(col.name);
      const docs = await sourceCol.find({}).toArray();

      if (docs.length > 0) {
        await targetCol.deleteMany({});
        await targetCol.insertMany(docs);
      } else {
        await targetCol.deleteMany({});
      }

      syncedCols.push({
        name: col.name,
        documentCount: docs.length,
        syncedAt: new Date().toISOString(),
      });
      totalDocs += docs.length;
    } catch (err) {
      syncedCols.push({ name: col.name, error: err.message });
    }
  }

  targetConfig.collections = syncedCols;
  targetConfig.totalDocsSynced = totalDocs;
  targetConfig.lastSync = new Date().toISOString();
  return true;
}

// Auto-replication background loop (runs every 30s)
setInterval(async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      // 1. Sync to local shadow replica
      const repConn = await getLocalReplicaConnection();
      if (repConn) {
        localReplicaConfig.status = 'SYNCING';
        await replicateDatabase(repConn, localReplicaConfig);
        localReplicaConfig.status = 'SYNCHRONIZED';
      }

      // 2. Sync to cloud replica if configured and connected
      if (cloudConnection && cloudBackupConfig.status === 'CONNECTED') {
        cloudBackupConfig.status = 'SYNCING';
        await replicateDatabase(cloudConnection, cloudBackupConfig);
        cloudBackupConfig.syncedCollections = cloudBackupConfig.collections || [];
        cloudBackupConfig.status = 'CONNECTED';
      }
    }
  } catch (err) {
    console.warn('[AutoReplicate] Background sync error:', err.message);
  }
}, 30000);

// Run initial local replica sync immediately after startup
setTimeout(async () => {
  try {
    const repConn = await getLocalReplicaConnection();
    if (repConn && mongoose.connection.readyState === 1) {
      await replicateDatabase(repConn, localReplicaConfig);
      localReplicaConfig.status = 'SYNCHRONIZED';
      console.log(`[LocalReplica] Initial shadow replica initialized: ${localReplicaConfig.totalDocsSynced} docs synced to resilify_replica`);
    }
  } catch (_) {}
}, 2000);

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

// ─── GET /api/database/local-replica/stats ──────────────────────────────────
router.get('/local-replica/stats', async (req, res) => {
  try {
    const repConn = await getLocalReplicaConnection();
    let dbStats = null;
    let collections = [];
    if (repConn && repConn.db) {
      dbStats = await repConn.db.command({ dbStats: 1 }).catch(() => null);
      const cols = await repConn.db.listCollections().toArray().catch(() => []);
      for (const col of cols) {
        if (col.name.startsWith('system.')) continue;
        const count = await repConn.db.collection(col.name).countDocuments().catch(() => 0);
        collections.push({ name: col.name, count });
      }
    }
    res.json({
      ...localReplicaConfig,
      dbStats: dbStats ? {
        dataSize: dbStats.dataSize,
        storageSize: dbStats.storageSize,
        totalCollections: dbStats.collections,
        totalDocuments: dbStats.objects,
      } : null,
      liveCollections: collections,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/database/local-replica/sync ──────────────────────────────────
router.post('/local-replica/sync', async (req, res) => {
  try {
    const repConn = await getLocalReplicaConnection();
    if (!repConn) {
      return res.status(503).json({ error: 'Local replica connection unavailable' });
    }
    localReplicaConfig.status = 'SYNCING';
    await replicateDatabase(repConn, localReplicaConfig);
    localReplicaConfig.status = 'SYNCHRONIZED';
    res.json({
      message: `Synchronized ${localReplicaConfig.totalDocsSynced} documents to resilify_replica`,
      config: localReplicaConfig,
    });
  } catch (e) {
    localReplicaConfig.status = 'ERROR';
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/database/backup/status ─────────────────────────────────────────
router.get('/backup/status', (req, res) => {
  res.json(cloudBackupConfig);
});

async function resolveAtlasUri(uri) {
  if (!uri || !uri.startsWith('mongodb+srv://')) {
    return uri;
  }
  try {
    const { Resolver } = require('dns').promises;
    const resolver = new Resolver();
    try {
      resolver.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
    } catch (_) {}

    const parsed = new URL(uri.replace(/^mongodb\+srv:\/\//, 'http://'));
    const auth = parsed.username
      ? `${parsed.username}${parsed.password ? ':' + parsed.password : ''}@`
      : '';
    const rawPath = parsed.pathname || '';
    const pathname = (!rawPath || rawPath === '/') ? '/resilify_cloud_backup' : rawPath;

    const srvRecords = await resolver.resolveSrv(`_mongodb._tcp.${hostname}`).catch(() => []);
    if (!srvRecords || srvRecords.length === 0) {
      return uri;
    }

    const hosts = srvRecords.map((s) => `${s.name}:${s.port}`).join(',');
    let extraParams = 'ssl=true&authSource=admin';
    try {
      const txtRecords = await resolver.resolveTxt(hostname);
      if (txtRecords && txtRecords.length > 0) {
        const flatTxt = txtRecords.flat().join('&');
        extraParams = `ssl=true&${flatTxt}`;
      }
    } catch (_) {}

    const search = parsed.search ? `${parsed.search}&${extraParams}` : `?${extraParams}`;
    return `mongodb://${auth}${hosts}${pathname}${search}`;
  } catch (err) {
    console.warn('[CloudBackup] Atlas SRV auto-resolve fallback:', err.message);
    return uri;
  }
}

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

    // Auto-resolve SRV if local network blocks SRV queries
    const effectiveUri = await resolveAtlasUri(uri.trim());

    // Create a separate mongoose connection to the cloud
    cloudConnection = await mongoose.createConnection(effectiveUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    }).asPromise();

    cloudBackupConfig.status = 'CONNECTED';
    cloudBackupConfig.lastError = null;

    // Get the cloud DB name
    const cloudDbName = cloudConnection.db.databaseName;
    cloudBackupConfig.cloudDbName = cloudDbName;

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
