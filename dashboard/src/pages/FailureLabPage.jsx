import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CardTitle, Spinner, formatNumber } from '../components/UI';
import * as api from '../api';

export default function FailureLabPage() {
  const { projects, instancesMap, loadGeneratorActive, setLoadGeneratorActive, rateLimitConfig, setRateLimitConfig, toast, fetchProjects } = useApp();
  const [loading, setLoading] = useState({});

  const runningProjects = projects.filter((p) => p.status === 'RUNNING');
  const allInstances = runningProjects.flatMap((p) =>
    (instancesMap[p.name] || [])
      .filter((i) => ['HEALTHY', 'STARTING', 'UNHEALTHY'].includes(i.status))
      .map((i) => ({ ...i, projectName: p.name }))
  );

  const setL = (key, val) => setLoading((s) => ({ ...s, [key]: val }));

  // Kill a real process
  const killInstance = async (inst) => {
    setL(`kill-${inst.instanceId}`, true);
    try {
      await api.killInstance(inst.projectName, inst.instanceId);
      toast(`⛔ Instance ${inst.instanceId.slice(-6)} killed!`, 'warning');
      setTimeout(fetchProjects, 1000);
    } catch (e) {
      toast(e.response?.data?.error || 'Kill failed', 'error');
    } finally {
      setL(`kill-${inst.instanceId}`, false);
    }
  };

  // Drain an instance
  const drainInstance = async (inst) => {
    setL(`drain-${inst.instanceId}`, true);
    try {
      await api.drainInstance(inst.projectName, inst.instanceId);
      toast(`⬇ Draining instance ${inst.instanceId.slice(-6)}`, 'info');
      setTimeout(fetchProjects, 500);
    } catch (e) {
      toast(e.response?.data?.error || 'Drain failed', 'error');
    } finally {
      setL(`drain-${inst.instanceId}`, false);
    }
  };

  // Revive failed instances
  const reviveAll = async (projectName) => {
    const failed = (instancesMap[projectName] || []).filter((i) => i.status === 'FAILED');
    for (const inst of failed) {
      try {
        await api.reviveInstance(projectName, inst.instanceId);
        toast(`🔄 Reviving ${inst.instanceId.slice(-6)}`, 'info');
      } catch (e) {
        toast('Revive failed', 'error');
      }
    }
    setTimeout(fetchProjects, 1000);
  };

  // Load presets
  const startLoad = async (projectName, rps) => {
    setL(`load-${projectName}-${rps}`, true);
    try {
      await api.startLoadGenerator(projectName, rps);
      setLoadGeneratorActive((prev) => ({ ...prev, [projectName]: rps }));
      toast(`⚡ Load generator: ${rps} RPS`, 'success');
    } catch (e) {
      toast('Failed to start load', 'error');
    } finally {
      setL(`load-${projectName}-${rps}`, false);
    }
  };

  const stopLoad = async (projectName) => {
    try {
      await api.stopLoadGenerator(projectName);
      setLoadGeneratorActive((prev) => { const n = { ...prev }; delete n[projectName]; return n; });
      toast('Load stopped', 'info');
    } catch (e) {}
  };

  const setRateLimit = async (rps) => {
    try {
      const { data } = await api.updateRateLimitConfig({ ...rateLimitConfig, requestsPerSecond: rps, burst: rps * 2 });
      setRateLimitConfig(data.config);
      toast(`🛡 Rate limit → ${rps} req/s`, 'success');
    } catch (e) {
      toast('Failed', 'error');
    }
  };

  if (runningProjects.length === 0) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">🔥 Failure Lab</h1>
        </div>
        <div className="content-area">
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 40 }}>🔥</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12, color: 'var(--text-secondary)' }}>No running projects to break</div>
            <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text-muted)' }}>Deploy a project first</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🔥 Failure Lab</h1>
          <div className="page-sub">Every action here triggers the real underlying mechanism — no simulations</div>
        </div>
      </div>

      <div className="content-area">
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 12, color: 'var(--red)', marginBottom: 20, fontWeight: 600 }}>
          ⚠ All actions here are REAL: kill sends SIGKILL to the actual process, drain stops request routing, load generates actual HTTP traffic.
        </div>

        {runningProjects.map((project) => {
          const instances = (instancesMap[project.name] || []).filter((i) => i.status !== 'STOPPED');
          const healthyInstances = instances.filter((i) => i.status === 'HEALTHY');
          const failedInstances = instances.filter((i) => i.status === 'FAILED');
          const activeRps = loadGeneratorActive[project.name];

          return (
            <div key={project.name} className="card mb-4">
              <CardTitle icon="🔥">{project.name} — Failure Controls</CardTitle>

              <div className="failure-lab">
                {/* Traffic */}
                <div className="lab-section">
                  <div className="lab-section-title">⚡ Traffic</div>
                  <div className="lab-actions">
                    {[10, 50, 100, 200].map((rps) => (
                      <button
                        key={rps}
                        className={`btn ${activeRps === rps ? 'btn-success' : 'btn-ghost'} btn-sm`}
                        disabled={loading[`load-${project.name}-${rps}`]}
                        onClick={() => startLoad(project.name, rps)}
                      >
                        {loading[`load-${project.name}-${rps}`] ? <Spinner size={10} /> : null}
                        {rps >= 50 ? `${rps / 10}× Scale` : 'Baseline'} ({rps} RPS)
                      </button>
                    ))}
                    {activeRps && (
                      <button className="btn btn-danger btn-sm" onClick={() => stopLoad(project.name)}>
                        ⏹ Stop Load ({activeRps} RPS)
                      </button>
                    )}
                  </div>
                </div>

                {/* Instance Control */}
                <div className="lab-section">
                  <div className="lab-section-title">💀 Instance</div>
                  <div className="lab-actions">
                    {healthyInstances.length > 0 ? (
                      healthyInstances.map((inst) => {
                        const shortId = inst.instanceId?.slice(-6);
                        return (
                          <div key={inst.instanceId} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', minWidth: 60 }}>:{inst.port}</span>
                            <button
                              className="btn btn-danger btn-xs"
                              disabled={loading[`kill-${inst.instanceId}`]}
                              onClick={() => killInstance(inst)}
                              title={`Kill PID ${inst.pid}`}
                            >
                              {loading[`kill-${inst.instanceId}`] ? <Spinner size={10} /> : '⛔'} Kill
                            </button>
                            <button
                              className="btn btn-warning btn-xs"
                              disabled={loading[`drain-${inst.instanceId}`]}
                              onClick={() => drainInstance(inst)}
                            >
                              {loading[`drain-${inst.instanceId}`] ? <Spinner size={10} /> : '⬇'} Drain
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No healthy instances</div>
                    )}
                  </div>
                </div>

                {/* Rate Limit */}
                <div className="lab-section">
                  <div className="lab-section-title">🛡 Rate Limit</div>
                  <div className="lab-actions">
                    {[10, 20, 50, 100, 500].map((rps) => (
                      <button
                        key={rps}
                        className={`btn btn-ghost btn-sm ${rateLimitConfig.requestsPerSecond === rps ? 'btn-primary' : ''}`}
                        onClick={() => setRateLimit(rps)}
                      >
                        Set {rps} req/s {rps <= 20 ? '⚡' : ''}
                      </button>
                    ))}
                    <button
                      className={`btn btn-sm ${rateLimitConfig.enabled ? 'btn-warning' : 'btn-success'}`}
                      onClick={async () => {
                        const { data } = await api.updateRateLimitConfig({ ...rateLimitConfig, enabled: !rateLimitConfig.enabled });
                        setRateLimitConfig(data.config);
                        toast(`Rate limiting ${data.config.enabled ? 'enabled' : 'disabled'}`, 'info');
                      }}
                    >
                      {rateLimitConfig.enabled ? '⏸ Disable RL' : '▶ Enable RL'}
                    </button>
                  </div>
                </div>

                {/* Recovery */}
                <div className="lab-section">
                  <div className="lab-section-title">🔄 Recovery</div>
                  <div className="lab-actions">
                    <button
                      className="btn btn-success btn-sm"
                      disabled={failedInstances.length === 0}
                      onClick={() => reviveAll(project.name)}
                    >
                      🔄 Revive All Failed ({failedInstances.length})
                    </button>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Auto-recovery also runs when health checks detect crashes
                    </div>
                  </div>
                </div>
              </div>

              {/* Instance status strip */}
              <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--bg-base)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Current Instance States
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {instances.map((inst) => {
                    const statusColor = { HEALTHY: 'var(--green)', STARTING: 'var(--accent)', FAILED: 'var(--red)', DRAINING: 'var(--orange)', UNHEALTHY: 'var(--yellow)' }[inst.status] || 'var(--text-muted)';
                    return (
                      <div key={inst.instanceId} style={{ padding: '5px 10px', background: 'var(--bg-elevated)', borderRadius: 6, border: `1px solid ${statusColor}22`, fontSize: 11 }}>
                        <span style={{ color: statusColor, marginRight: 4 }}>●</span>
                        <span style={{ fontFamily: 'JetBrains Mono' }}>:{inst.port}</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>{inst.status}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {/* Demo scenario guide */}
        <div className="card">
          <CardTitle icon="🎬">Demo Scenario Guide</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            {[
              { step: '1', action: 'Start 10 RPS (baseline)', effect: '1 instance, light load' },
              { step: '2', action: 'Click "10× Load (100 RPS)"', effect: 'Rate limiter may trigger, autoscaler watches' },
              { step: '3', action: 'Click "100× Load (1000 RPS)"', effect: 'Rate limiter blocks excess, autoscaler scales up' },
              { step: '4', action: 'Kill a healthy instance', effect: 'Health check fails → instance removed → replacement spawned' },
              { step: '5', action: 'Set Rate Limit to 20 req/s', effect: 'Most traffic returns 429; show blocks counter' },
              { step: '6', action: 'Set Rate Limit back to 100 req/s', effect: 'Traffic flows freely again' },
              { step: '7', action: 'Revive failed instances', effect: 'Replacement health-checks → joins pool' },
            ].map((s) => (
              <div key={s.step} style={{ display: 'flex', gap: 12, padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.step}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{s.action}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.effect}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
