import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { CardTitle } from '../components/UI';
import EventLog from '../components/EventLog';
import * as api from '../api';

export default function EventsPage() {
  const { projects, eventsMap } = useApp();
  const [selectedProject, setSelectedProject] = useState('all');
  const [dbEvents, setDbEvents] = useState([]);

  useEffect(() => {
    if (selectedProject !== 'all') {
      api.getProjectEvents(selectedProject, 100)
        .then(({ data }) => setDbEvents(data))
        .catch(() => {});
    }
  }, [selectedProject]);

  const allEvents = selectedProject === 'all'
    ? Object.values(eventsMap).flat().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100)
    : [...(eventsMap[selectedProject] || []), ...dbEvents]
        .filter((e, i, arr) => arr.findIndex((x) => x._id === e._id) === i)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 100);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Event Timeline</h1>
          <div className="page-sub">Real-time log of all orchestration events</div>
        </div>
        <select
          className="form-select"
          style={{ width: 200 }}
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="content-area">
        <div className="card">
          <CardTitle icon="📋">
            Events — {selectedProject === 'all' ? 'All Projects' : selectedProject}
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>({allEvents.length} total)</span>
          </CardTitle>
          <EventLog events={allEvents} maxHeight={600} />
        </div>
      </div>
    </div>
  );
}
