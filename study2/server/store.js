const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || "./data/sessions");
const locks = new Map();

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function sessionPath(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("Invalid session id");
  }
  return path.join(DATA_DIR, `${id}.json`);
}

async function readSession(id) {
  const raw = await fs.readFile(sessionPath(id), "utf8");
  return JSON.parse(raw);
}

async function writeSession(session) {
  await ensureDataDir();
  const file = sessionPath(session.id);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
  return session;
}

async function listSessions() {
  await ensureDataDir();
  const files = await fs.readdir(DATA_DIR);
  const sessions = [];
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8");
      sessions.push(JSON.parse(raw));
    } catch (error) {
      sessions.push({
        id: file.replace(/\.json$/, ""),
        read_error: error.message
      });
    }
  }
  return sessions;
}

async function updateSession(id, updater) {
  const previous = locks.get(id) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const chained = previous.then(() => current);
  locks.set(id, chained);
  try {
    await previous;
    const session = await readSession(id);
    const updated = await updater(session);
    return await writeSession(updated || session);
  } finally {
    release();
    if (locks.get(id) === chained) locks.delete(id);
  }
}

module.exports = {
  DATA_DIR,
  ensureDataDir,
  readSession,
  writeSession,
  listSessions,
  updateSession
};
