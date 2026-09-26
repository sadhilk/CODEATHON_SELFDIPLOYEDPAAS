import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { StatusBadge, formatNumber, EmptyState, CardTitle, Spinner } from '../components/UI';
import CreateProjectModal from '../components/CreateProjectModal';
import * as api from '../api';

export default function ProjectsPage() {
  const { projects, fetchProjects, metricsMap, instancesMap, toast } = useApp();
  const [showCreate, setShowCreate] = useState(false);
  const [deploying, setDeploying] = useState({});
  const [stopping, setStopping] = useState({});
  const [deleting, setDeleting] = useState({});

  const handleDelete = async (name) => {
    if (!confirm(`Are you sure you want to completely remove project "${name}"?\n\nThis will stop all running instances, delete its records, and remove the project.`)) {
      return;
    }
    setDeleting((p) => ({ ...p, [name]: true }));
    try {
      await api.deleteProject(name);
      toast(`Project "${name}" removed successfully`, 'success');
      fetchProjects();
    } catch (e) {
      toast(e.response?.data?.error || 'Delete failed', 'error');
    } finally {
      setDeleting((p) => ({ ...p, [name]: false }));
    }
  };

  const handleDeploy = async (name) => {
    setDeploying((p) => ({ ...p, [name]: true }));
    try {
      await api.deployProject(name);
      toast(`Deploying ${name}…`, 'info');
      setTimeout(fetchProjects, 2000);
    } catch (e) {
      toast(e.response?.data?.error || 'Deploy failed', 'error');
    } finally {
      setDeploying((p) => ({ ...p, [name]: false }));
    }
  };

  const handleStop = async (name) => {
    if (!confirm(`Stop all instances of "${name}"?`)) return;
    setStopping((p) => ({ ...p, [name]: true }));
    try {
      await api.stopProject(name);
      toast(`${name} stopped`, 'warning');
      fetchProjects();
    } catch (e) {
      toast(e.response?.data?.error || 'Stop failed', 'error');
    } finally {
      setStopping((p) => ({ ...p, [name]: false }));
    }
  };

  const handleCreated = () => fetchProjects();

  const canDeploy = (p) => ['CREATED', 'STOPPED', 'FAILED'].includes(p.status);
  const canStop = (p) => ['RUNNING', 'DEPLOYING'].includes(p.status);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <div className="page-sub">Manage your deployed Node.js applications</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + New Project
        </button>
      </div>

      <div className="content-area">
        {projects.length === 0 ? (
          <EmptyState
            icon="◈"
            title="No projects yet"
            sub="Click 'New Project' to deploy your first Node.js application"
            action={<button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Project</button>}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {projects.map((p) => {
              const instances = instancesMap[p.name] || [];
              const stats = metricsMap[p.name] || {};
              const healthy = instances.filter((i) => i.status === 'HEALTHY').length;
              const failed = instances.filter((i) => i.status === 'FAILED').length;

              return (
                <div key={p.name} className="card">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 700 }}>{p.name}</h2>
                        <StatusBadge status={p.status} />
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>v{p.currentVersion || 0}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'JetBrains Mono' }}>
                        {p.workingDir} · {p.entryFile}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {canDeploy(p) && (
                        <button
                          className="btn btn-primary"
                          onClick={() => handleDeploy(p.name)}
                          disabled={deploying[p.name]}
                        >
                          {deploying[p.name] ? <><Spinner size={12} /> Deploying…</> : '▶ Deploy'}
                        </button>
                      )}
                      {p.status === 'RUNNING' && (
                        <button className="btn btn-primary" onClick={() => handleDeploy(p.name)} disabled={deploying[p.name]}>
                          {deploying[p.name] ? <><Spinner size={12} /> …</> : '↺ Redeploy'}
                        </button>
                      )}
                      {canStop(p) && (
                        <button
                          className="btn btn-danger"
                          onClick={() => handleStop(p.name)}
                          disabled={stopping[p.name]}
                        >
                          {stopping[p.name] ? <><Spinner size={12} /> …</> : '⏹ Stop'}
                        </button>
                      )}
                      <button
                        className="btn btn-ghost"
                        style={{ color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.25)' }}
                        onClick={() => handleDelete(p.name)}
                        disabled={deleting[p.name] || deploying[p.name]}
                        title="Delete project"
                      >
                        {deleting[p.name] ? <><Spinner size={12} /> …</> : '🗑 Remove'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                    {[
                      { label: 'Healthy Instances', value: healthy, color: 'var(--green)' },
                      { label: 'Failed Instances', value: failed, color: failed > 0 ? 'var(--red)' : 'var(--text-muted)' },
                      { label: 'Min / Max', value: `${p.scaling?.minInstances ?? 1} / ${p.scaling?.maxInstances ?? 5}` },
                      { label: 'RPS Threshold', value: `${p.scaling?.requestsPerSecondThreshold ?? 50}/s` },
                      { label: 'Availability', value: `${stats.availability ?? 100}%`, color: 'var(--cyan)' },
                      { label: 'Allowed', value: formatNumber(stats.allowedRequests) },
                      { label: 'Rate Limited', value: formatNumber(stats.rateLimitedRequests), color: 'var(--yellow)' },
                      { label: 'Recovered', value: formatNumber(stats.recoveredRequests), color: 'var(--accent-2)' },
                    ].map((m) => (
                      <div key={m.label} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: m.color || 'var(--text-primary)', fontFamily: 'JetBrains Mono', marginTop: 4 }}>{m.value ?? '—'}</div>
                      </div>
                    ))}
                  </div>

                  {/* Rate limit config */}
                  <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-base)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
                    <span>🛡 Rate Limit: <strong style={{ color: p.rateLimit?.enabled ? 'var(--green)' : 'var(--text-muted)' }}>{p.rateLimit?.enabled ? 'ON' : 'OFF'}</strong></span>
                    <span>{p.rateLimit?.requestsPerSecond ?? 100} req/s · burst {p.rateLimit?.burst ?? 200}</span>
                    <span>Health: <strong style={{ color: 'var(--accent)' }}>{p.health?.endpoint ?? '/health'}</strong> every {p.health?.intervalMs ?? 2000}ms</span>
                    <span>Gateway: <strong className="mono">http://localhost:4000/apps/{p.name}/*</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateProjectModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
