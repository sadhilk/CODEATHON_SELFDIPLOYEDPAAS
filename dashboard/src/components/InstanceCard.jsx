import React from 'react';
import { StatusBadge, MetricBar, formatUptime, formatNumber } from './UI';
import * as api from '../api';
import { useApp } from '../context/AppContext';

function getCardClass(status) {
  switch (status?.toUpperCase()) {
    case 'HEALTHY':   return 'healthy';
    case 'STARTING':  return 'starting';
    case 'DRAINING':  return 'draining';
    case 'UNHEALTHY': return 'unhealthy';
    case 'FAILED':    return 'failed';
    case 'STOPPED':   return 'stopped';
    default:          return '';
  }
}

export default function InstanceCard({ instance, projectName, onAction }) {
  const { toast } = useApp();
  const { instanceId, pid, port, status, createdAt, metrics = {}, circuitBreaker = {} } = instance;

  const shortId = instanceId?.split('-').slice(-2).join('-') || instanceId;
  const isAlive = ['HEALTHY', 'STARTING', 'DRAINING', 'UNHEALTHY'].includes(status);
  const isFailed = ['FAILED', 'STOPPED'].includes(status);

  async function doKill() {
    try {
      await api.killInstance(projectName, instanceId);
      toast(`Instance ${shortId} killed`, 'warning');
      onAction?.();
    } catch (e) {
      toast(e.response?.data?.error || 'Kill failed', 'error');
    }
  }

  async function doDrain() {
    try {
      await api.drainInstance(projectName, instanceId);
      toast(`Draining instance ${shortId}…`, 'info');
      onAction?.();
    } catch (e) {
      toast(e.response?.data?.error || 'Drain failed', 'error');
    }
  }

  async function doRevive() {
    try {
      await api.reviveInstance(projectName, instanceId);
      toast(`Reviving instance…`, 'info');
      onAction?.();
    } catch (e) {
      toast(e.response?.data?.error || 'Revive failed', 'error');
    }
  }

  return (
    <div className={`instance-card ${getCardClass(status)}`}>
      <div className="instance-header">
        <div>
          <div className="instance-name">#{shortId}</div>
          <div className="instance-port mono">:{port} · PID {pid || '—'}</div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="instance-metrics">
        <div className="metric-item">
          <div className="metric-label">CPU</div>
          <div className="metric-value">{metrics.cpu ?? 0}%</div>
          <MetricBar value={metrics.cpu ?? 0} color="var(--accent)" />
        </div>
        <div className="metric-item">
          <div className="metric-label">Memory</div>
          <div className="metric-value">{metrics.memory ?? 0}MB</div>
          <MetricBar value={metrics.memory ?? 0} max={256} color="var(--accent-2)" />
        </div>
        <div className="metric-item">
          <div className="metric-label">Requests</div>
          <div className="metric-value">{formatNumber(metrics.requestsServed)}</div>
        </div>
        <div className="metric-item">
          <div className="metric-label">Active</div>
          <div className="metric-value" style={{ color: metrics.activeRequests > 0 ? 'var(--accent)' : 'inherit' }}>
            {metrics.activeRequests ?? 0}
          </div>
        </div>
        <div className="metric-item">
          <div className="metric-label">RPS</div>
          <div className="metric-value">{metrics.rps ?? 0}</div>
        </div>
        <div className="metric-item">
          <div className="metric-label">Latency</div>
          <div className="metric-value">{metrics.avgLatency ?? 0}ms</div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
        <span>Uptime: {formatUptime(createdAt)}</span>
        {circuitBreaker.state && circuitBreaker.state !== 'CLOSED' && (
          <span style={{ marginLeft: 10, color: circuitBreaker.state === 'OPEN' ? 'var(--red)' : 'var(--yellow)' }}>
            CB: {circuitBreaker.state}
          </span>
        )}
        {metrics.failedRequests > 0 && (
          <span style={{ marginLeft: 10, color: 'var(--red)' }}>
            Errors: {metrics.failedRequests}
          </span>
        )}
      </div>

      <div className="instance-actions">
        {isAlive && (
          <>
            <button className="btn btn-danger btn-sm" onClick={doKill} title="Kill this process">⛔ Kill</button>
            {status === 'HEALTHY' && (
              <button className="btn btn-warning btn-sm" onClick={doDrain} title="Gracefully drain">⬇ Drain</button>
            )}
          </>
        )}
        {isFailed && (
          <button className="btn btn-success btn-sm" onClick={doRevive} title="Spawn replacement">🔄 Revive</button>
        )}
      </div>
    </div>
  );
}
