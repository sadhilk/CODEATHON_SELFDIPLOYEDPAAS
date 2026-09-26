import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import * as api from '../api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [connected, setConnected] = useState(false);
  const [metricsMap, setMetricsMap] = useState({}); // projectName -> latest metrics
  const [eventsMap, setEventsMap] = useState({});    // projectName -> events[]
  const [instancesMap, setInstancesMap] = useState({}); // projectName -> instances[]
  const [rateLimitConfig, setRateLimitConfig] = useState({ enabled: true, requestsPerSecond: 100, burst: 200, key: 'ip' });
  const [rateLimitStats, setRateLimitStats] = useState({ received: 0, allowed: 0, rateLimited: 0 });
  const [toasts, setToasts] = useState([]);
  const [loadGeneratorActive, setLoadGeneratorActive] = useState({});

  const toast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const { data } = await api.getProjects();
      setProjects(data);
      // Build instances map
      const iMap = {};
      const mMap = {};
      for (const p of data) {
        if (p.instances) iMap[p.name] = p.instances;
        if (p.stats) mMap[p.name] = p.stats;
      }
      setInstancesMap(iMap);
      setMetricsMap(mMap);
    } catch (e) {
      console.error('Failed to fetch projects', e.message);
    }
  }, []);

  const fetchRateLimitConfig = useCallback(async () => {
    try {
      const { data } = await api.getRateLimitConfig();
      setRateLimitConfig(data.config);
      setRateLimitStats(data.stats);
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchRateLimitConfig();

    const interval = setInterval(fetchProjects, 5000);
    return () => clearInterval(interval);
  }, [fetchProjects, fetchRateLimitConfig]);

  useEffect(() => {
    if (socket.connected) setConnected(true);
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('metricsUpdate', (payload) => {
      const { projectName, stats, rateLimit, instances } = payload;
      setMetricsMap((prev) => ({ ...prev, [projectName]: stats }));
      if (rateLimit) {
        setRateLimitStats(rateLimit.stats);
        setRateLimitConfig(rateLimit.config);
      }
      if (instances) {
        setInstancesMap((prev) => ({ ...prev, [projectName]: instances }));
      }
    });

    socket.on('instanceUpdate', (data) => {
      const { projectName, instanceId, status } = data;
      setInstancesMap((prev) => {
        const list = prev[projectName] || [];
        const existing = list.find((i) => i.instanceId === instanceId);
        if (existing) {
          return {
            ...prev,
            [projectName]: list.map((i) =>
              i.instanceId === instanceId ? { ...i, status } : i
            ),
          };
        } else {
          return { ...prev, [projectName]: [...list, data] };
        }
      });
    });

    socket.on('event', (ev) => {
      const { projectName } = ev;
      setEventsMap((prev) => ({
        ...prev,
        [projectName]: [ev, ...(prev[projectName] || [])].slice(0, 100),
      }));
    });

    socket.on('rateLimitUpdated', (config) => {
      setRateLimitConfig(config);
    });

    socket.on('loadGeneratorStarted', ({ projectName, rps }) => {
      setLoadGeneratorActive((prev) => ({ ...prev, [projectName]: rps }));
    });

    socket.on('loadGeneratorStopped', ({ projectName }) => {
      setLoadGeneratorActive((prev) => {
        const n = { ...prev };
        delete n[projectName];
        return n;
      });
    });

    socket.on('deploymentComplete', () => fetchProjects());
    socket.on('projectUpdated', () => fetchProjects());

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('metricsUpdate');
      socket.off('instanceUpdate');
      socket.off('event');
      socket.off('rateLimitUpdated');
      socket.off('loadGeneratorStarted');
      socket.off('loadGeneratorStopped');
      socket.off('deploymentComplete');
      socket.off('projectUpdated');
    };
  }, [fetchProjects]);

  return (
    <AppContext.Provider value={{
      projects, setProjects, fetchProjects,
      connected,
      metricsMap, eventsMap, instancesMap,
      rateLimitConfig, setRateLimitConfig,
      rateLimitStats, setRateLimitStats,
      toast,
      loadGeneratorActive, setLoadGeneratorActive,
      fetchRateLimitConfig,
    }}>
      {children}
      {/* Toast container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>{t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : t.type === 'warning' ? '⚠️' : 'ℹ️'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
