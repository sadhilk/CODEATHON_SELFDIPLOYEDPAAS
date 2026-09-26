import React from 'react';

function getEventColor(type) {
  if (!type) return 'info';
  if (type.includes('HEALTHY') || type.includes('COMPLETED') || type.includes('CLOSED') || type.includes('REVIVED')) return 'healthy';
  if (type.includes('FAILED') || type.includes('OPEN') || type.includes('ERROR')) return 'failed';
  if (type.includes('SCALE') || type.includes('THRESHOLD') || type.includes('DEPLOYMENT_STARTED')) return 'scale';
  if (type.includes('UNHEALTHY') || type.includes('RATE_LIMIT')) return 'warning';
  return 'info';
}

function getEventIcon(type) {
  if (!type) return '•';
  if (type.includes('DEPLOYMENT_STARTED')) return '🚀';
  if (type.includes('DEPLOYMENT_COMPLETED')) return '✅';
  if (type.includes('DEPLOYMENT_FAILED')) return '❌';
  if (type.includes('HEALTHY')) return '💚';
  if (type.includes('FAILED')) return '🔴';
  if (type.includes('SCALE_UP')) return '📈';
  if (type.includes('SCALE_DOWN')) return '📉';
  if (type.includes('CIRCUIT_BREAKER_OPEN')) return '⚡';
  if (type.includes('CIRCUIT_BREAKER_CLOSED')) return '✔';
  if (type.includes('RATE_LIMIT')) return '🛡';
  if (type.includes('INSTANCE_CREATED')) return '⊕';
  if (type.includes('INSTANCE_REMOVED') || type.includes('INSTANCE_STOPPED')) return '⊖';
  if (type.includes('BACKUP')) return '💾';
  return '•';
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export default function EventLog({ events = [], maxHeight = 300 }) {
  if (events.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: 12 }}>
        No events yet. Deploy a project to see events here.
      </div>
    );
  }

  return (
    <div className="event-log" style={{ maxHeight }}>
      {events.map((ev, idx) => (
        <div key={ev._id || idx} className="event-item">
          <span className="event-time">{formatTime(ev.timestamp)}</span>
          <span>{getEventIcon(ev.type)}</span>
          <span className={`event-type ${getEventColor(ev.type)}`}>{ev.type}</span>
          <span className="event-msg">{ev.message}</span>
        </div>
      ))}
    </div>
  );
}
