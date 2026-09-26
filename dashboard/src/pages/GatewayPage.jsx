import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CardTitle, RateMeter, formatNumber, Modal, Spinner } from '../components/UI';
import * as api from '../api';

export default function GatewayPage() {
  const { rateLimitConfig, setRateLimitConfig, rateLimitStats, toast, projects, fetchRateLimitConfig } = useApp();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const openEdit = () => {
    setForm({ ...rateLimitConfig });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.updateRateLimitConfig(form);
      setRateLimitConfig(data.config);
      toast('Rate limit updated!', 'success');
      setEditing(false);
    } catch (e) {
      toast(e.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalReceived = (rateLimitStats?.received ?? 0);
  const totalAllowed  = (rateLimitStats?.allowed  ?? 0);
  const totalBlocked  = (rateLimitStats?.rateLimited ?? 0);
  const blockRate     = totalReceived > 0 ? ((totalBlocked / totalReceived) * 100).toFixed(1) : '0.0';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gateway &amp; Rate Limiter</h1>
          <div className="page-sub">Token-bucket rate limiter sits before load balancer</div>
        </div>
        <button className="btn btn-primary" onClick={openEdit}>✏️ Edit Limit</button>
      </div>

      <div className="content-area">
        {/* Architecture reminder */}
        <div style={{ marginBottom: 20, padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'var(--accent)', fontSize: 16 }}>ℹ</span>
          <span>
            <strong style={{ color: 'var(--text-secondary)' }}>Flow:</strong> User → <strong style={{ color: 'var(--accent)' }}>Rate Limiter</strong> → Allowed? → Load Balancer → Healthy Instance · Rejected → HTTP 429
          </span>
        </div>

        <div className="grid-2 mb-4">
          {/* Config card */}
          <div className="card">
            <CardTitle icon="🛡">Rate Limit Configuration</CardTitle>

            <div className="flex items-center gap-3 mb-4">
              <span className={`badge ${rateLimitConfig.enabled ? 'green' : 'gray'}`}>
                {rateLimitConfig.enabled ? '● ACTIVE' : '○ DISABLED'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Token-bucket algorithm</span>
            </div>

            {[
              { label: 'Algorithm', value: 'Token Bucket' },
              { label: 'Requests / Second', value: `${rateLimitConfig.requestsPerSecond}`, highlight: true },
              { label: 'Burst Capacity', value: `${rateLimitConfig.burst} tokens` },
              { label: 'Key Strategy', value: rateLimitConfig.key === 'ip' ? 'Per IP Address' : 'Global' },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                <strong style={{ fontFamily: 'JetBrains Mono', color: row.highlight ? 'var(--accent)' : 'var(--text-primary)', fontSize: row.highlight ? 15 : 13 }}>
                  {row.value}
                </strong>
              </div>
            ))}

            <div className="mt-4">
              <RateMeter
                label="Current throughput"
                current={Math.min(rateLimitConfig.requestsPerSecond, totalAllowed)}
                max={rateLimitConfig.requestsPerSecond}
              />
            </div>
          </div>

          {/* Stats card */}
          <div className="card">
            <CardTitle icon="📊">Rate Limit Statistics</CardTitle>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Received', value: formatNumber(totalReceived), color: 'var(--text-primary)' },
                { label: 'Allowed', value: formatNumber(totalAllowed), color: 'var(--green)' },
                { label: 'Rate Limited', value: formatNumber(totalBlocked), color: 'var(--yellow)' },
                { label: 'Block Rate', value: `${blockRate}%`, color: parseFloat(blockRate) > 50 ? 'var(--red)' : parseFloat(blockRate) > 20 ? 'var(--yellow)' : 'var(--green)' },
              ].map((s) => (
                <div key={s.label} style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: 'JetBrains Mono', marginTop: 6 }}>{s.value}</div>
                </div>
              ))}
            </div>

            {totalBlocked > 0 && (
              <div style={{ marginTop: 16, padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>⚡ {formatNumber(totalBlocked)} requests returned HTTP 429</span>
                <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>These never reached the load balancer or application instances</div>
              </div>
            )}
          </div>
        </div>

        {/* Demo quick-set */}
        <div className="card">
          <CardTitle icon="⚡">Quick Demo Controls</CardTitle>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Instantly change the rate limit to demonstrate the system response. Current: <strong style={{ color: 'var(--accent)' }}>{rateLimitConfig.requestsPerSecond} req/s</strong>
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {[10, 20, 50, 100, 200, 500].map((rps) => (
              <button
                key={rps}
                className={`btn btn-ghost ${rateLimitConfig.requestsPerSecond === rps ? 'btn-primary' : ''}`}
                style={rateLimitConfig.requestsPerSecond === rps ? {} : {}}
                onClick={async () => {
                  try {
                    const { data } = await api.updateRateLimitConfig({ ...rateLimitConfig, requestsPerSecond: rps, burst: rps * 2 });
                    setRateLimitConfig(data.config);
                    toast(`Rate limit set to ${rps} req/s`, 'success');
                  } catch (e) {
                    toast('Failed to update', 'error');
                  }
                }}
              >
                {rps} req/s
              </button>
            ))}
            <button
              className={`btn ${rateLimitConfig.enabled ? 'btn-warning' : 'btn-success'}`}
              onClick={async () => {
                try {
                  const { data } = await api.updateRateLimitConfig({ ...rateLimitConfig, enabled: !rateLimitConfig.enabled });
                  setRateLimitConfig(data.config);
                  toast(`Rate limiting ${data.config.enabled ? 'enabled' : 'disabled'}`, 'info');
                } catch (e) {
                  toast('Failed', 'error');
                }
              }}
            >
              {rateLimitConfig.enabled ? '⏸ Disable' : '▶ Enable'}
            </button>
          </div>
        </div>

        {/* Gateway route table */}
        <div className="card mt-4">
          <CardTitle icon="⬟">Gateway Routes</CardTitle>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            All traffic to deployed projects flows through <span className="mono" style={{ color: 'var(--accent)' }}>localhost:4000/apps/:name/*</span>
          </div>
          {projects.filter(p => p.status === 'RUNNING').length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {projects.filter(p => p.status === 'RUNNING').map((p) => (
                <div key={p.name} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--green)', fontWeight: 700 }}>●</span>
                  <span className="mono" style={{ color: 'var(--accent)' }}>localhost:4000/apps/{p.name}/*</span>
                  <span style={{ color: 'var(--text-muted)' }}>→</span>
                  <span style={{ color: 'var(--text-secondary)' }}>round-robin across healthy instances</span>
                  <a href={`http://localhost:4000/apps/${p.name}/`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 11 }}>Open ↗</a>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No running projects</div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={editing}
        onClose={() => setEditing(false)}
        title="🛡 Edit Rate Limit"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><Spinner size={12} /> Saving…</> : '✓ Apply'}
            </button>
          </>
        }
      >
        {form && (
          <div>
            <div className="form-group flex items-center gap-3 mb-4">
              <label className="switch">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                <span className="slider" />
              </label>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Rate Limiting {form.enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Requests per Second</label>
                <input className="form-input" type="number" min="1" value={form.requestsPerSecond} onChange={(e) => setForm({ ...form, requestsPerSecond: Number(e.target.value) })} />
              </div>
              <div className="form-group">
                <label className="form-label">Burst Capacity</label>
                <input className="form-input" type="number" min="1" value={form.burst} onChange={(e) => setForm({ ...form, burst: Number(e.target.value) })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Key Strategy</label>
              <select className="form-select" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })}>
                <option value="ip">Per IP Address</option>
                <option value="global">Global</option>
              </select>
            </div>
            <div style={{ padding: '10px 12px', background: 'var(--bg-base)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              💡 Changes apply immediately. Existing token buckets are reset.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
