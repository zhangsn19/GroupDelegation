const fs = require("fs/promises");
const path = require("path");

function createReadOnlyLegacyStore(dataDir) {
  const DATA_DIR = dataDir ? path.resolve(dataDir) : "";

  function assertConfigured() {
    if (!DATA_DIR) {
      const error = new Error("Historical Study1 data is not configured");
      error.statusCode = 404;
      throw error;
    }
  }

  function sessionPath(id) {
    assertConfigured();
    if (!/^[a-zA-Z0-9_-]+$/.test(String(id || ""))) {
      const error = new Error("Invalid historical session id");
      error.statusCode = 400;
      throw error;
    }
    return path.join(DATA_DIR, `${id}.json`);
  }

  async function readSession(id) {
    try {
      return JSON.parse(await fs.readFile(sessionPath(id), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        const missing = new Error("Historical session not found");
        missing.statusCode = 404;
        throw missing;
      }
      throw error;
    }
  }

  async function listSessions() {
    assertConfigured();
    const names = await fs.readdir(DATA_DIR);
    const sessions = [];
    for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
      try {
        sessions.push(JSON.parse(await fs.readFile(path.join(DATA_DIR, name), "utf8")));
      } catch (error) {
        sessions.push({ id: name.replace(/\.json$/, ""), read_error: error.message });
      }
    }
    return sessions;
  }

  return Object.freeze({ DATA_DIR, readSession, listSessions });
}

module.exports = { createReadOnlyLegacyStore };
