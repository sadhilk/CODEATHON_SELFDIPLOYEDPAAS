import React from 'react';
import { useApp } from '../context/AppContext';
import { CardTitle, EmptyState } from '../components/UI';
import InstanceCard from '../components/InstanceCard';

import * as api from '../api';

export default function InstancesPage() {
  const { projects, instancesMap, fetchProjects, toast } = useApp();

  const allInstanceGroups = projects.map((p) => ({
    project: p,
    instances: (instancesMap[p.name] || [])
      .filter((i) => !['STOPPED'].includes(i.status))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
  })).filter((g) => g.instances.length > 0);

  const totalHealthy = allInstanceGroups.flatMap((g) => g.instances).filter((i) => i.status === 'HEALTHY').length;
  const totalFailed = allInstanceGroups.flatMap((g) => g.instances).filter((i) => i.status === 'FAILED').length;

  const handleCleanup = async (projectName) => {
    try {
      const { data } = await api.cleanupInstances(projectName);
      toast(`Cleaned up ${data.deletedCount} inactive instances`, 'info');
      fetchProjects();
    } catch (e) {
      toast('Failed to clean up', 'error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Instance Registry</h1>
          <div className="page-sub">
            {totalHealthy} healthy · {totalFailed} failed · All live processes
          </div>
        </div>
        <div className="flex gap-2">
          {totalFailed > 0 && (
            <button
              className="btn btn-sm btn-ghost"
              style={{ color: 'var(--red)', borderColor: '#fecaca' }}
              onClick={() => projects.forEach((p) => handleCleanup(p.name))}
            >
              🗑 Clear Dead Instances
            </button>
          )}
          <button className="btn btn-ghost" onClick={fetchProjects}>↺ Refresh</button>
        </div>
      </div>

      <div className="content-area">
        {allInstanceGroups.length === 0 ? (
          <EmptyState icon="◉" title="No active instances" sub="Deploy a project to see instances here" />
        ) : (
          allInstanceGroups.map(({ project, instances }) => (
            <div key={project.name} style={{ marginBottom: 28 }}>
              <div className="flex items-center gap-3 mb-3">
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{project.name}</h2>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {instances.filter((i) => i.status === 'HEALTHY').length}/{instances.length} healthy
                </span>
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--accent)', background: 'var(--accent-glow)', padding: '2px 8px', borderRadius: 4 }}>
                  Gateway: /apps/{project.name}/*
                </span>
              </div>
              <div className="instance-grid">
                {instances.map((inst) => (
                  <InstanceCard
                    key={inst.instanceId}
                    instance={inst}
                    projectName={project.name}
                    onAction={fetchProjects}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
