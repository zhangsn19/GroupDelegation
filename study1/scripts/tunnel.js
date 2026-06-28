const { spawn } = require("child_process");

const port = process.env.PORT || "3000";
const child = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
  stdio: "inherit",
  shell: true
});

child.on("exit", (code) => {
  process.exit(code || 0);
});
