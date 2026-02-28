/**
 * Claudia Brain v4 -- SSE (Server-Sent Events) connection
 *
 * Connects to /api/events for real-time graph updates.
 * Event emitter pattern with auto-reconnect.
 */

let eventSource = null;
const listeners = new Map(); // eventType -> Set<callback>
const wildcardListeners = new Set(); // callbacks for ALL events

export function connect() {
  if (eventSource) return;

  eventSource = new EventSource('/api/events');

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      emit(data.type, data);
    } catch {}
  };

  eventSource.onerror = () => {
    console.warn('[SSE] Connection lost, auto-reconnecting...');
  };
}

export function disconnect() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

export function on(eventType, callback) {
  if (!listeners.has(eventType)) listeners.set(eventType, new Set());
  listeners.get(eventType).add(callback);
  return () => off(eventType, callback);
}

export function off(eventType, callback) {
  listeners.get(eventType)?.delete(callback);
}

export function onAny(callback) {
  wildcardListeners.add(callback);
  return () => wildcardListeners.delete(callback);
}

function emit(type, data) {
  // Type-specific listeners
  const cbs = listeners.get(type);
  if (cbs) {
    for (const cb of cbs) {
      try { cb(data); } catch (e) { console.warn('[SSE] Listener error:', e); }
    }
  }
  // Wildcard listeners
  for (const cb of wildcardListeners) {
    try { cb(data); } catch (e) { console.warn('[SSE] Wildcard listener error:', e); }
  }
}

export function isConnected() {
  return eventSource?.readyState === EventSource.OPEN;
}
