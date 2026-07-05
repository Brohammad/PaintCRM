// Client-side id generation for locally-created records (leads, analytics
// events) that may be created offline before the server assigns a real id.

// A UUID for a lead. Uses crypto.randomUUID when available, with a v4-shaped
// Math.random fallback for older/embedded browsers.
export function generateLeadId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// A compact, time-ordered id for analytics events (timestamp + random suffix).
export function generateEventId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
