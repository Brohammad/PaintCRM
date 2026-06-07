// Load .env if present (dev convenience — not required in prod)
try { require("fs").accessSync(require("path").join(__dirname, ".env")); require("child_process").execSync(""); } catch {}
if (require("fs").existsSync(require("path").join(__dirname, ".env"))) {
  const lines = require("fs").readFileSync(require("path").join(__dirname, ".env"), "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: "10mb" }));   // leads carry base64 snapshots

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use("/api/auth",   require("./routes/auth"));
app.use("/api/leads",  require("./routes/leads"));
app.use("/api/shades", require("./routes/shades"));
app.use("/api/dealer", require("./routes/dealer"));
app.use("/api/events", require("./routes/events"));

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─── Serve frontend (static) ──────────────────────────────────────────────────

const FRONTEND_DIR = path.join(__dirname, "../paint-preview-app");
app.use(express.static(FRONTEND_DIR));
// SPA fallback — serve index.html for any unmatched GET
app.get("*", (_req, res) => res.sendFile(path.join(FRONTEND_DIR, "index.html")));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`PaintCRM server running → http://localhost:${PORT}`);
  console.log(`  API base: http://localhost:${PORT}/api`);
  console.log(`  Frontend: http://localhost:${PORT}`);
});
