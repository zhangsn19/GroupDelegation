const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

function ensureDirs() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionPath(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function readSession(sessionId) {
  const fp = sessionPath(sessionId);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function writeSession(session) {
  ensureDirs();
  session.updatedAt = new Date().toISOString();
  fs.writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2));
}

function createSession({ experimentId, condition, prolificId }) {
  ensureDirs();
  const { v4: uuidv4 } = require('uuid');
  const session = {
    id: uuidv4(),
    experimentId,
    condition,
    prolificId: prolificId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phase: 'consent',
    events: [],
    preSurvey: null,
    postSurvey: null,
    taskData: null,
    timings: {},
    completed: false,
  };
  writeSession(session);
  return session;
}

function appendEvent(sessionId, event) {
  const session = readSession(sessionId);
  if (!session) return null;
  const entry = { ...event, ts: new Date().toISOString() };
  session.events.push(entry);
  writeSession(session);
  return entry;
}

function updateSession(sessionId, updates) {
  const session = readSession(sessionId);
  if (!session) return null;
  Object.assign(session, updates);
  writeSession(session);
  return session;
}

function listSessions({ experimentId } = {}) {
  ensureDirs();
  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
  const sessions = files.map((f) => JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8')));
  if (experimentId) return sessions.filter((s) => s.experimentId === experimentId);
  return sessions;
}

function exportSessions(format = 'json') {
  const sessions = listSessions();
  if (format === 'json') {
    return JSON.stringify(sessions, null, 2);
  }

  if (format === 'csv') {
    const rows = [];
    for (const s of sessions) {
      const base = {
        session_id: s.id,
        experiment_id: s.experimentId,
        prolific_id: s.prolificId || '',
        created_at: s.createdAt,
        completed: s.completed,
        ...flattenObject(s.condition || {}, 'condition'),
        ...flattenObject(s.preSurvey || {}, 'pre'),
        ...flattenObject(s.postSurvey || {}, 'post'),
        ...flattenObject(s.taskData || {}, 'task'),
        ...flattenObject(s.timings || {}, 'timing'),
      };
      rows.push(base);
    }
    return toCsv(rows);
  }

  return sessions;
}

function flattenObject(obj, prefix) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenObject(v, `${prefix}_${k}`));
    } else if (Array.isArray(v)) {
      out[`${prefix}_${k}`] = JSON.stringify(v);
    } else {
      out[`${prefix}_${k}`] = v;
    }
  }
  return out;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const escape = (v) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

module.exports = {
  createSession,
  readSession,
  writeSession,
  updateSession,
  appendEvent,
  listSessions,
  exportSessions,
  DATA_DIR,
  SESSIONS_DIR,
};
