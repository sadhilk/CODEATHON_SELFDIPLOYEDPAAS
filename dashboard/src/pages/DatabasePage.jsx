import React, { useState, useEffect, useCallback } from 'react';
import { CardTitle, Spinner } from '../components/UI';
import * as api from '../api';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export default function DatabasePage() {
  const [health, setHealth] = useState(null);
  const [dbStats, setDbStats] = useState(null);
  const [localReplica, setLocalReplica] = useState(null);
  const [backupStatus, setBackupStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [localSyncing, setLocalSyncing] = useState(false);

  // Document browser state
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [documents, setDocuments] = useState(null);
  const [docPage, setDocPage] = useState(1);
  const [docLoading, setDocLoading] = useState(false);

  // Cloud backup state
  const [cloudUri, setCloudUri] = useState('');
  const [cloudConnecting, setCloudConnecting] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudMessage, setCloudMessage] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, statsRes, localRes, backupRes] = await Promise.all([
        api.getSystemHealth().catch(() => ({ data: { database: 'UNHEALTHY' } })),
        api.getDatabaseStats().catch(() => ({ data: null })),
        api.getLocalReplicaStats().catch(() => ({ data: null })),
        api.getBackupStatus().catch(() => ({ data: null })),
      ]);
      setHealth(healthRes.data);
      setDbStats(statsRes.data);
      setLocalReplica(localRes.data);
      setBackupStatus(backupRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 6000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const handleLocalReplicaSync = async () => {
    setLocalSyncing(true);
    try {
      await api.syncLocalReplica();
      await fetchAll();
    } catch (_) {}
    setLocalSyncing(false);
  };

  // Document browsing
  const browseCollection = async (name, page = 1) => {
    setSelectedCollection(name);
    setDocPage(page);
    setDocLoading(true);
    try {
      const { data } = await api.getCollectionDocuments(name, page, 15);
      setDocuments(data);
    } catch (e) {
      setDocuments({ error: e.message });
    } finally {
      setDocLoading(false);
    }
  };

  // Cloud backup actions
  const handleCloudConnect = async () => {
    if (!cloudUri.trim()) return;
    setCloudConnecting(true);
    setCloudMessage(null);
    try {
      const { data } = await api.configureCloudBackup(cloudUri.trim());
      setCloudMessage({ type: 'success', text: data.message });
      fetchAll();
    } catch (e) {
      setCloudMessage({ type: 'error', text: e.response?.data?.error || e.message });
    } finally {
      setCloudConnecting(false);
    }
  };

  const handleCloudSync = async () => {
    setCloudSyncing(true);
    setCloudMessage(null);
    try {
      const { data } = await api.syncCloudBackup();
      setCloudMessage({ type: 'success', text: data.message });
      // Poll for sync completion
      setTimeout(() => {
        fetchAll();
        setCloudSyncing(false);
      }, 3000);
    } catch (e) {
      setCloudMessage({ type: 'error', text: e.response?.data?.error || e.message });
      setCloudSyncing(false);
    }
  };

  const handleCloudDisconnect = async () => {
    try {
      await api.disconnectCloudBackup();
      setCloudUri('');
      setCloudMessage({ type: 'success', text: 'Cloud backup disconnected' });
      fetchAll();
    } catch (e) {
      setCloudMessage({ type: 'error', text: e.message });
    }
  };

  const stateNames = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const mongoState = health?.mongoState ?? -1;
  const isCloudConnected = backupStatus?.status === 'CONNECTED' || backupStatus?.status === 'SYNCING';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Database</h1>
          <div className="page-sub">MongoDB storage, collection browser, and cloud backup replication</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchAll} disabled={loading}>
          {loading ? <Spinner size={12} /> : '↺'} Refresh
        </button>
      </div>

      <div className="content-area">
        {/* ── Row 1: Primary DB + Local Replica + Storage Overview ────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 16 }}>
          {/* Connection Status: Primary */}
          <div className="card">
            <CardTitle icon="🗄️">Primary Database</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                {
                  label: 'Role',
                  value: 'Primary (Master)',
                  color: 'var(--accent)',
                },
                {
                  label: 'Status',
                  value: health?.database === 'HEALTHY' ? '● Connected' : '○ Unhealthy',
                  color: health?.database === 'HEALTHY' ? 'var(--green)' : 'var(--red)',
                },
                {
                  label: 'URI',
                  value: 'mongodb://127.0.0.1:27017/resilify',
                  color: 'var(--accent)',
                  mono: true,
                },
                {
                  label: 'Database',
                  value: dbStats?.database || 'resilify',
                  color: 'var(--text-primary)',
                },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                  <span style={{ color: row.color, fontFamily: row.mono ? 'JetBrains Mono' : 'inherit', fontSize: row.mono ? 11 : 12 }}>
                    {loading ? '…' : row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Local Shadow Replica Status */}
          <div className="card">
            <div className="flex justify-between items-center mb-3">
              <CardTitle icon="🛡️">Local Shadow Replica</CardTitle>
              <span className="badge green" style={{ fontSize: 10 }}>Auto-Sync (30s)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                {
                  label: 'Replica Target',
                  value: 'resilify_replica (Standby)',
                  color: 'var(--purple, #a78bfa)',
                },
                {
                  label: 'Sync Status',
                  value: localReplica?.status === 'SYNCHRONIZED' ? '● Synchronized' : localReplica?.status === 'SYNCING' ? '↻ Syncing…' : '● Standby',
                  color: localReplica?.status === 'SYNCHRONIZED' ? 'var(--green)' : 'var(--cyan)',
                },
                {
                  label: 'Docs in Replica',
                  value: `${localReplica?.totalDocsSynced?.toLocaleString() || localReplica?.dbStats?.totalDocuments || 0} documents`,
                  color: 'var(--cyan)',
                },
                {
                  label: 'Last Replicated',
                  value: timeAgo(localReplica?.lastSync),
                  color: 'var(--text-secondary)',
                },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                  <span style={{ color: row.color, fontSize: 12 }}>
                    {loading ? '…' : row.value}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleLocalReplicaSync}
                disabled={localSyncing}
                style={{ fontSize: 11, padding: '4px 10px' }}
              >
                {localSyncing ? <Spinner size={10} /> : '🔄'} Force Local Sync
              </button>
            </div>
          </div>

          {/* Database Overview Stats */}
          <div className="card">
            <CardTitle icon="📊">Storage Overview</CardTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Collections', value: dbStats?.totalCollections ?? '…', color: 'var(--accent)' },
                { label: 'Total Documents', value: dbStats?.totalDocuments?.toLocaleString() ?? '…', color: 'var(--cyan)' },
                { label: 'Data Size', value: dbStats ? formatBytes(dbStats.dataSize) : '…', color: 'var(--green)' },
                { label: 'Storage Size', value: dbStats ? formatBytes(dbStats.storageSize) : '…', color: 'var(--purple, #a78bfa)' },
                { label: 'Local Replica', value: '● Synchronized', color: 'var(--green)' },
                { label: 'Cloud Backup', value: isCloudConnected ? '● Linked' : '○ Not linked', color: isCloudConnected ? 'var(--green)' : 'var(--text-muted)' },
              ].map((item) => (
                <div key={item.label} style={{ padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
                  <div style={{ fontSize: 16, color: item.color, marginTop: 4, fontWeight: 700, fontFamily: 'JetBrains Mono' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Row 2: Collections Browser ──────────────────────────────────── */}
        <div className="card mt-4">
          <CardTitle icon="📁">Collections Browser</CardTitle>
          <div style={{ display: 'flex', gap: 16 }}>
            {/* Collection list */}
            <div style={{ minWidth: 240, flexShrink: 0 }}>
              {dbStats?.collections?.map((col) => (
                <button
                  key={col.name}
                  onClick={() => browseCollection(col.name)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    padding: '10px 12px',
                    background: selectedCollection === col.name ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg-elevated)',
                    border: selectedCollection === col.name ? '1px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 6,
                    marginBottom: 6,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    textAlign: 'left',
                    color: 'inherit',
                    fontSize: 13,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontFamily: 'JetBrains Mono', color: selectedCollection === col.name ? 'var(--accent)' : 'var(--text-primary)', fontSize: 12 }}>
                      {col.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {formatBytes(col.sizeBytes)} · {col.indexes} idx
                    </div>
                  </div>
                  <span className={`badge ${col.documentCount > 0 ? 'green' : ''}`} style={{ fontSize: 11 }}>
                    {col.documentCount}
                  </span>
                </button>
              )) || <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>}
            </div>

            {/* Document viewer */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {!selectedCollection && (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  ← Select a collection to browse documents
                </div>
              )}

              {selectedCollection && docLoading && (
                <div style={{ padding: 32, textAlign: 'center' }}><Spinner /> Loading documents…</div>
              )}

              {selectedCollection && documents && !docLoading && (
                <div>
                  <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{documents.collection}</span>
                      {' '}— {documents.totalDocs} document{documents.totalDocs !== 1 ? 's' : ''} · page {documents.page}/{documents.totalPages || 1}
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={docPage <= 1}
                        onClick={() => browseCollection(selectedCollection, docPage - 1)}
                      >← Prev</button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={docPage >= (documents.totalPages || 1)}
                        onClick={() => browseCollection(selectedCollection, docPage + 1)}
                      >Next →</button>
                    </div>
                  </div>

                  <div style={{ maxHeight: 420, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                    {documents.documents?.length > 0 ? (
                      documents.documents.map((doc, i) => (
                        <details key={doc._id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <summary style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontFamily: 'JetBrains Mono',
                            background: 'var(--bg-elevated)',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}>
                            <span style={{ color: 'var(--accent)' }}>{doc._id}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                              {doc.name || doc.projectName || doc.type || doc.instanceId || ''}
                            </span>
                          </summary>
                          <pre style={{
                            padding: '10px 14px',
                            margin: 0,
                            fontSize: 11,
                            fontFamily: 'JetBrains Mono',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-secondary)',
                            overflowX: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}>
                            {JSON.stringify(doc, null, 2)}
                          </pre>
                        </details>
                      ))
                    ) : (
                      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                        No documents in this collection
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 3: Cloud Backup & Replication ──────────────────────────── */}
        <div className="card mt-4">
          <CardTitle icon="☁️">Cloud Backup & Replication</CardTitle>
          <div style={{
            padding: '14px',
            background: 'rgba(56, 189, 248, 0.06)',
            border: '1px solid rgba(56, 189, 248, 0.18)',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}>
            <strong style={{ color: 'var(--accent)' }}>💡 How it works:</strong>{' '}
            Paste your <strong>MongoDB Atlas</strong> connection string (or any cloud MongoDB URI).
            Resilify connects to it and can replicate all local collections and documents to the cloud
            as a full backup. You can re-sync at any time to push the latest data.
          </div>

          {/* Cloud URI Input */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              type="text"
              placeholder="mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/resilify-backup"
              value={cloudUri || backupStatus?.uri || ''}
              onChange={(e) => setCloudUri(e.target.value)}
              disabled={isCloudConnected}
              style={{
                flex: 1,
                padding: '10px 14px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontFamily: 'JetBrains Mono',
                fontSize: 12,
                outline: 'none',
              }}
            />
            {!isCloudConnected ? (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleCloudConnect}
                disabled={cloudConnecting || !cloudUri.trim()}
                style={{ minWidth: 120 }}
              >
                {cloudConnecting ? <><Spinner size={12} /> Connecting…</> : '🔗 Connect'}
              </button>
            ) : (
              <button
                className="btn btn-sm"
                onClick={handleCloudDisconnect}
                style={{ minWidth: 120, background: 'rgba(239,68,68,0.15)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                ✕ Disconnect
              </button>
            )}
          </div>

          {/* Status message */}
          {cloudMessage && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 13,
              background: cloudMessage.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${cloudMessage.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: cloudMessage.type === 'success' ? 'var(--green)' : 'var(--red)',
            }}>
              {cloudMessage.type === 'success' ? '✓' : '✕'} {cloudMessage.text}
            </div>
          )}

          {/* Cloud status grid + sync button */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              {
                label: 'Cloud Database',
                value: backupStatus?.cloudDbName || (isCloudConnected ? 'resilify_cloud_backup' : '—'),
                color: 'var(--purple, #a78bfa)',
              },
              {
                label: 'Cloud Status',
                value: backupStatus?.status?.replace('_', ' ') || 'Not configured',
                color: isCloudConnected ? 'var(--green)' : backupStatus?.status === 'SYNCING' ? 'var(--cyan)' : 'var(--text-muted)',
              },
              {
                label: 'Last Sync',
                value: timeAgo(backupStatus?.lastSync),
                color: backupStatus?.lastSync ? 'var(--accent)' : 'var(--text-muted)',
              },
              {
                label: 'Collections Synced',
                value: backupStatus?.syncedCollections?.length || backupStatus?.collections?.length || 0,
                color: 'var(--cyan)',
              },
              {
                label: 'Docs Replicated',
                value: backupStatus?.totalDocsSynced?.toLocaleString() || 0,
                color: 'var(--green)',
              },
            ].map((item) => (
              <div key={item.label} style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
                <div style={{ fontSize: 16, color: item.color, marginTop: 6, fontWeight: 700, fontFamily: 'JetBrains Mono' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Sync button */}
          {isCloudConnected && (
            <div className="flex gap-3">
              <button
                className="btn btn-primary btn-sm"
                onClick={handleCloudSync}
                disabled={cloudSyncing}
                style={{
                  background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                  border: 'none',
                  padding: '10px 24px',
                }}
              >
                {cloudSyncing ? <><Spinner size={12} /> Syncing to Cloud…</> : '🔄 Sync All Data to Cloud Now'}
              </button>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                Replicates all collections: projects, instances, events, metrics
              </div>
            </div>
          )}

          {/* Last sync details */}
          {backupStatus?.syncedCollections?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Last Sync Details
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {backupStatus.syncedCollections.map((col) => (
                  <div key={col.name} style={{
                    padding: '6px 12px',
                    background: col.error ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                    border: `1px solid ${col.error ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                    borderRadius: 6,
                    fontSize: 12,
                  }}>
                    <span style={{ fontFamily: 'JetBrains Mono', color: col.error ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                      {col.name}
                    </span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                      {col.error ? `✕ ${col.error}` : `✓ ${col.documentCount} docs`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Row 4: What MongoDB Powers ──────────────────────────────────── */}
        <div className="card mt-4">
          <CardTitle icon="✅">Active Data Responsibilities</CardTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
            {[
              { text: 'Project configuration persistence (scaling, health, rate limit config)', icon: '⚙' },
              { text: 'Instance registry — all real instances tracked with PID, port, status, metrics', icon: '◉' },
              { text: 'Event log — every orchestration action recorded with timestamp', icon: '📋' },
              { text: 'Traffic metrics — availability, latency, request counts', icon: '📈' },
              { text: 'Circuit breaker state per instance', icon: '🔌' },
              { text: 'Health check state (consecutive failures, last success)', icon: '💓' },
              { text: 'Cloud backup replication to MongoDB Atlas or any remote URI', icon: '☁️' },
              { text: 'Document browsing with paginated JSON inspection', icon: '🔍' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2" style={{ padding: '7px 10px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
