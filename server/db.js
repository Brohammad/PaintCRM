const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "paintcrm.db");
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read perf
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id          TEXT PRIMARY KEY,
    shop_name   TEXT NOT NULL,
    dealer_name TEXT DEFAULT '',
    phone       TEXT DEFAULT '',
    email       TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leads (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT,
    phone       TEXT,
    email       TEXT,
    notes       TEXT,
    shades_json TEXT,
    snapshot_b64 TEXT,
    cost_estimate_json TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    synced_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shades (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    brand        TEXT,
    collection   TEXT,
    hex          TEXT,
    price_per_l  REAL,
    color_family TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   TEXT,
    session_id  TEXT,
    event_type  TEXT NOT NULL,
    payload_json TEXT,
    ts          TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_leads_tenant    ON leads(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_events_tenant   ON events(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_events_session  ON events(session_id);
  CREATE INDEX IF NOT EXISTS idx_events_type     ON events(event_type);
`);

// ─── Seed shades catalog from shades.json (only if table is empty) ────────────

const shadeCount = db.prepare("SELECT COUNT(*) as n FROM shades").get().n;
if (shadeCount === 0) {
  const shadesFile = path.join(__dirname, "../paint-preview-app/shades.json");
  if (fs.existsSync(shadesFile)) {
    const shades = JSON.parse(fs.readFileSync(shadesFile, "utf8"));
    const insert = db.prepare(`
      INSERT OR IGNORE INTO shades (id, name, brand, collection, hex, price_per_l, color_family)
      VALUES (@id, @name, @brand, @collection, @hex, @pricePerL, @colorFamily)
    `);
    const insertMany = db.transaction((rows) => {
      for (const s of rows) insert.run({
        id: s.id,
        name: s.name,
        brand: s.brand || "",
        collection: s.collection || "",
        hex: s.hex || "",
        pricePerL: s.pricePerL || 0,
        colorFamily: s.colorFamily || "",
      });
    });
    insertMany(shades);
    console.log(`[db] seeded ${shades.length} shades from shades.json`);
  } else {
    console.warn("[db] shades.json not found — shade catalog will be empty");
  }
}

module.exports = db;
