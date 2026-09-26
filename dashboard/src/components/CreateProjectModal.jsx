import React, { useState } from 'react';
import * as api from '../api';
import { useApp } from '../context/AppContext';
import { Modal } from './UI';

const DEFAULT_FORM = {
  name: '',
  entryFile: 'server.js',
  port: 3000,
  workingDir: '',
  env: '',
  'scaling.minInstances': 1,
  'scaling.maxInstances': 5,
  'scaling.requestsPerSecondThreshold': 50,
  'scaling.scaleUpSustainSeconds': 5,
  'scaling.scaleDownCooldownSeconds': 30,
  'health.endpoint': '/health',
  'health.intervalMs': 2000,
  'health.timeoutMs': 1000,
  'health.failureThreshold': 3,
  'rateLimit.enabled': true,
  'rateLimit.requestsPerSecond': 100,
  'rateLimit.burst': 200,
  'rateLimit.key': 'ip',
};

export default function CreateProjectModal({ isOpen, onClose, onCreated }) {
  const { toast } = useApp();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('basic');

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    if (!form.name || !form.workingDir) {
      toast('Project name and working directory are required', 'error');
      return;
    }

    // Parse env vars
    const envObj = {};
    if (form.env) {
      for (const line of form.env.split('\n')) {
        const [k, ...vs] = line.trim().split('=');
        if (k && vs.length) envObj[k.trim()] = vs.join('=').trim();
      }
    }

    const payload = {
      name: form.name,
      entryFile: form.entryFile,
      port: Number(form.port),
      workingDir: form.workingDir,
      env: envObj,
      scaling: {
        minInstances: Number(form['scaling.minInstances']),
        maxInstances: Number(form['scaling.maxInstances']),
        requestsPerSecondThreshold: Number(form['scaling.requestsPerSecondThreshold']),
        scaleUpSustainSeconds: Number(form['scaling.scaleUpSustainSeconds']),
        scaleDownCooldownSeconds: Number(form['scaling.scaleDownCooldownSeconds']),
      },
      health: {
        endpoint: form['health.endpoint'],
        intervalMs: Number(form['health.intervalMs']),
        timeoutMs: Number(form['health.timeoutMs']),
        failureThreshold: Number(form['health.failureThreshold']),
      },
      rateLimit: {
        enabled: form['rateLimit.enabled'],
        requestsPerSecond: Number(form['rateLimit.requestsPerSecond']),
        burst: Number(form['rateLimit.burst']),
        key: form['rateLimit.key'],
      },
    };

    setLoading(true);
    try {
      const { data } = await api.createProject(payload);
      toast(`Project "${data.name}" created!`, 'success');
      setForm(DEFAULT_FORM);
      onCreated(data);
      onClose();
    } catch (e) {
      toast(e.response?.data?.error || e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const tabs = ['basic', 'scaling', 'health', 'rateLimit'];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🚀 Create New Project"
      actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? '⏳ Creating…' : '✓ Create Project'}
          </button>
        </>
      }
    >
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'basic' ? 'Basic' : t === 'scaling' ? 'Scaling' : t === 'health' ? 'Health' : 'Rate Limit'}
          </button>
        ))}
      </div>

      {tab === 'basic' && (
        <div>
          <div className="form-group">
            <label className="form-label">Project Name *</label>
            <input className="form-input" placeholder="student-portal" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Entry File *</label>
              <input className="form-input" placeholder="server.js" value={form.entryFile} onChange={(e) => set('entryFile', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">App Port</label>
              <input className="form-input" type="number" placeholder="3000" value={form.port} onChange={(e) => set('port', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Working Directory *</label>
            <input className="form-input" placeholder="E:\LPUCODETHON\resilify\sample-app" value={form.workingDir} onChange={(e) => set('workingDir', e.target.value)} />
            <div className="form-hint">Absolute path to the application folder</div>
          </div>
          <div className="form-group">
            <label className="form-label">Environment Variables</label>
            <textarea className="form-textarea" placeholder={"NODE_ENV=production\nAPI_KEY=abc123"} value={form.env} onChange={(e) => set('env', e.target.value)} />
            <div className="form-hint">One per line: KEY=VALUE</div>
          </div>
        </div>
      )}

      {tab === 'scaling' && (
        <div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Min Instances</label>
              <input className="form-input" type="number" min="1" value={form['scaling.minInstances']} onChange={(e) => set('scaling.minInstances', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Max Instances</label>
              <input className="form-input" type="number" min="1" max="20" value={form['scaling.maxInstances']} onChange={(e) => set('scaling.maxInstances', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Scale-Up Threshold (req/s)</label>
            <input className="form-input" type="number" value={form['scaling.requestsPerSecondThreshold']} onChange={(e) => set('scaling.requestsPerSecondThreshold', e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Scale-Up Sustain (sec)</label>
              <input className="form-input" type="number" value={form['scaling.scaleUpSustainSeconds']} onChange={(e) => set('scaling.scaleUpSustainSeconds', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Scale-Down Cooldown (sec)</label>
              <input className="form-input" type="number" value={form['scaling.scaleDownCooldownSeconds']} onChange={(e) => set('scaling.scaleDownCooldownSeconds', e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {tab === 'health' && (
        <div>
          <div className="form-group">
            <label className="form-label">Health Endpoint</label>
            <input className="form-input" placeholder="/health" value={form['health.endpoint']} onChange={(e) => set('health.endpoint', e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Interval (ms)</label>
              <input className="form-input" type="number" value={form['health.intervalMs']} onChange={(e) => set('health.intervalMs', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Timeout (ms)</label>
              <input className="form-input" type="number" value={form['health.timeoutMs']} onChange={(e) => set('health.timeoutMs', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Failure Threshold</label>
            <input className="form-input" type="number" value={form['health.failureThreshold']} onChange={(e) => set('health.failureThreshold', e.target.value)} />
            <div className="form-hint">Consecutive failures before marking UNHEALTHY</div>
          </div>
        </div>
      )}

      {tab === 'rateLimit' && (
        <div>
          <div className="form-group flex items-center gap-2 mb-4">
            <label className="switch">
              <input type="checkbox" checked={form['rateLimit.enabled']} onChange={(e) => set('rateLimit.enabled', e.target.checked)} />
              <span className="slider" />
            </label>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Enable Rate Limiting</span>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Requests per Second</label>
              <input className="form-input" type="number" value={form['rateLimit.requestsPerSecond']} onChange={(e) => set('rateLimit.requestsPerSecond', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Burst Size</label>
              <input className="form-input" type="number" value={form['rateLimit.burst']} onChange={(e) => set('rateLimit.burst', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Rate Limit Key</label>
            <select className="form-select" value={form['rateLimit.key']} onChange={(e) => set('rateLimit.key', e.target.value)}>
              <option value="ip">Per IP Address</option>
              <option value="global">Global (all traffic)</option>
            </select>
          </div>
        </div>
      )}
    </Modal>
  );
}
