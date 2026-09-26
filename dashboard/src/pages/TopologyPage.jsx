import React from 'react';
import { useApp } from '../context/AppContext';
import { CardTitle } from '../components/UI';

function TopologyNode({ label, sublabel, status, icon, isGateway }) {
  const colorMap = {
    HEALTHY: 'green', RUNNING: 'green', STARTING: 'starting', FAILED: 'red',
    DRAINING: 'draining', UNHEALTHY: 'yellow', STOPPED: 'stopped',
  };
  const cls = colorMap[status] || '';
  return (
    <div className={`topology-node ${isGateway ? 'gateway' : cls}`} style={{ minWidth: 120 }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
      {sublabel && <div className="topology-port">{sublabel}</div>}
      {status && !isGateway && <div style={{ marginTop: 4 }}>
        <span style={{ fontSize: 10, color: cls === 'green' ? 'var(--green)' : cls === 'red' ? 'var(--red)' : cls === 'starting' ? 'var(--accent)' : 'var(--yellow)' }}>
          ● {status}
        </span>
      </div>}
    </div>
  );
}

function Arrow({ label }) {
  return (
    <div style={{ textAlign: 'center', color: 'var(--border-bright)', fontSize: 11, margin: '4px 0' }}>
      <div style={{ fontSize: 14 }}>↓</div>
      {label && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>}
    </div>
  );
}

export default function TopologyPage() {
  const { projects, instancesMap, rateLimitConfig } = useApp();

  const runningProjects = projects.filter((p) => p.status === 'RUNNING');

  if (runningProjects.length === 0) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Live Topology</h1>
        </div>
        <div className="content-area">
          <div className="card">
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40 }}>⬡</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12 }}>No running projects</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Deploy a project to see the live topology</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Live Topology</h1>
        <div className="page-sub">Real-time architecture view — updates as instances scale</div>
      </div>

      <div className="content-area">
        {runningProjects.map((project) => {
          const instances = (instancesMap[project.name] || []).filter((i) => i.status !== 'STOPPED');
          const healthyCount = instances.filter((i) => i.status === 'HEALTHY').length;

          return (
            <div key={project.name} className="card mb-4">
              <CardTitle icon="⬡">{project.name} · Topology</CardTitle>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' }}>
                {/* Users */}
                <div className="topology-layer">
                  <TopologyNode label="USERS" sublabel="Internet traffic" icon="👥" />
                </div>

                <Arrow label="HTTP requests" />

                {/* Gateway */}
                <div className="topology-layer">
                  <div className={`topology-node gateway`} style={{ minWidth: 200, textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>⬟ Resilify Gateway</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>localhost:4000/apps/{project.name}/*</div>
                  </div>
                </div>

                <Arrow label="rate check" />

                {/* Rate Limiter */}
                <div className="topology-layer">
                  <div className={`topology-node ${rateLimitConfig.enabled ? 'gateway' : ''}`} style={{ minWidth: 180, textAlign: 'center' }}>
                    <div style={{ fontSize: 18 }}>🛡</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Rate Limiter</div>
                    <div style={{ fontSize: 11, color: rateLimitConfig.enabled ? 'var(--green)' : 'var(--text-muted)', marginTop: 4 }}>
                      {rateLimitConfig.enabled ? `${rateLimitConfig.requestsPerSecond} req/s · burst ${rateLimitConfig.burst}` : 'DISABLED'}
                    </div>
                  </div>
                </div>

                <Arrow label="allowed traffic" />

                {/* Load Balancer */}
                <div className="topology-layer">
                  <div className="topology-node gateway" style={{ minWidth: 180, textAlign: 'center' }}>
                    <div style={{ fontSize: 18 }}>⚖️</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Load Balancer</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Round Robin · {healthyCount} targets</div>
                  </div>
                </div>

                <Arrow label="distribute" />

                {/* App Instances */}
                {instances.length > 0 ? (
                  <div className="topology-layer" style={{ flexWrap: 'wrap', maxWidth: 700 }}>
                    {instances.map((inst, idx) => {
                      const shortId = inst.instanceId?.split('-').slice(-2).join('-') || `#${idx + 1}`;
                      const statusEmoji = inst.status === 'HEALTHY' ? '🟢' : inst.status === 'FAILED' ? '🔴' : inst.status === 'STARTING' ? '🔵' : inst.status === 'DRAINING' ? '🟠' : '🟡';
                      return (
                        <TopologyNode
                          key={inst.instanceId}
                          label={`APP #${idx + 1}`}
                          sublabel={`:${inst.port} · PID ${inst.pid || '?'}`}
                          status={inst.status}
                          icon={statusEmoji}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="topology-layer">
                    <div className="topology-node" style={{ borderColor: 'var(--text-muted)' }}>
                      <div style={{ color: 'var(--text-muted)' }}>No instances</div>
                    </div>
                  </div>
                )}

                <Arrow label="queries" />

                {/* MongoDB */}
                <div className="topology-layer">
                  <div className="topology-node" style={{ minWidth: 160, textAlign: 'center', borderColor: 'var(--green)' }}>
                    <div style={{ fontSize: 20 }}>🗄️</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>MongoDB</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Primary · resilify</div>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 16, padding: '12px', background: 'var(--bg-base)', borderRadius: 8, fontSize: 12 }}>
                {[
                  { color: 'var(--green)', label: 'Healthy' },
                  { color: 'var(--accent)', label: 'Starting' },
                  { color: 'var(--yellow)', label: 'Unhealthy' },
                  { color: 'var(--orange)', label: 'Draining' },
                  { color: 'var(--red)', label: 'Failed' },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-2">
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, display: 'inline-block', boxShadow: `0 0 4px ${l.color}` }} />
                    <span style={{ color: 'var(--text-muted)' }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
