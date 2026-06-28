const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = Number(process.env.RECEIVER_PORT || 4040);
const SYNC_DIR = path.resolve(process.cwd(), process.env.SYNC_DIR || "./data/synced");

app.use(express.json({ limit: "2mb" }));

app.post("/sync", async (req, res) => {
  await fs.mkdir(SYNC_DIR, { recursive: true });
  const id = req.body.id || `sync_${Date.now()}`;
  const file = path.join(SYNC_DIR, `${String(id).replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  await fs.writeFile(file, `${JSON.stringify(req.body, null, 2)}\n`, "utf8");
  res.json({ ok: true, file });
});

app.listen(PORT, () => {
  console.log(`Local receiver listening on http://localhost:${PORT}/sync`);
});
