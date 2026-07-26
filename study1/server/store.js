const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || "./data/sessions");
const locks = new Map();
let auditWrite = Promise.resolve();

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
  try {
    const raw = await fs.readFile(sessionPath(id), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      const safeError = new Error("\u5f53\u524d\u53c2\u4e0e\u8bb0\u5f55\u65e0\u6cd5\u6062\u590d\u3002\u8bf7\u8054\u7cfb\u7814\u7a76\u56e2\u961f\u83b7\u53d6\u65b0\u7684\u53c2\u4e0e\u94fe\u63a5\u540e\u91cd\u65b0\u5f00\u59cb\u3002");
      safeError.statusCode = 410;
      throw safeError;
    }
    throw error;
  }
}

async function writeSession(session) {
  await ensureDataDir();
  const file = sessionPath(session.id);
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  const handle = await fs.open(tmp, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(session, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(tmp, file);
  } catch (error) {
    if (error.code !== "EPERM" && error.code !== "EACCES") throw error;
    await fs.copyFile(tmp, file);
    await fs.unlink(tmp);
  }
  try {
    const directory = await fs.open(DATA_DIR, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    if (!["EINVAL", "EPERM", "EISDIR"].includes(error.code)) throw error;
  }
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

async function appendAuditEvent(event) {
  auditWrite = auditWrite.catch(() => {}).then(async () => {
    await ensureDataDir();
    const file = path.join(DATA_DIR, "identity-audit.ndjson");
    const handle = await fs.open(file, "a", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(event)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  });
  return auditWrite;
}

module.exports = {
  DATA_DIR,
  ensureDataDir,
  readSession,
  writeSession,
  listSessions,
  updateSession,
  appendAuditEvent
};
