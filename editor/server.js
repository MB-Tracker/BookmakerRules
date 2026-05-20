import express from "express";
import cors from "cors";
import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, readdirSync, rmSync, renameSync,
} from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");
const SPORTS = resolve(DATA, "sports");

const app = express();
app.use(cors());
app.use(express.json());

// ── Helpers ───────────────────────────────────────────────────────────────────

const exists = (p) => existsSync(p);
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const write = (p, v) => writeFileSync(p, JSON.stringify(v, null, 4) + "\n", "utf8");
const mkdir = (p) => mkdirSync(p, { recursive: true });
const rmdir = (p) => rmSync(p, { recursive: true, force: true });
const ls = (p) => (exists(p) ? readdirSync(p) : []);

const sportDir = (sport) => join(SPORTS, sport);
const marketDir = (sport, market) => join(SPORTS, sport, "markets", market);
const rulesDir = (sport, market) => join(marketDir(sport, market), "rules");
const bmDir = (sport, market) => join(marketDir(sport, market), "bookmakers");
const compatDir = (sport, market) => join(marketDir(sport, market), "compatibility");
const pairFile = (ra, rb) => `${[ra, rb].sort().join("+")}.json`;
const bmSlug = (name) => name.toLowerCase().replace(/\s+/g, "_");

const notFound = (res) => res.status(404).json({ error: "not found" });
const conflict = (res, msg) => res.status(409).json({ error: msg });

// ── Sports ────────────────────────────────────────────────────────────────────

app.get("/api/sports", (req, res) => {
  mkdir(SPORTS);
  const sports = ls(SPORTS)
    .filter((s) => existsSync(join(SPORTS, s, "markets")))
    .sort()
    .map((s) => ({
      name: s,
      markets: ls(join(SPORTS, s, "markets")).sort(),
    }));
  res.json(sports);
});

app.post("/api/sports", (req, res) => {
  const { name } = req.body;
  const dir = sportDir(name);
  if (exists(dir)) return conflict(res, "sport already exists");
  mkdir(join(dir, "markets"));
  res.status(201).json({ name, markets: [] });
});

app.put("/api/sports/:sport", (req, res) => {
  const { sport } = req.params;
  const { name } = req.body;
  if (!exists(sportDir(sport))) return notFound(res);
  if (exists(sportDir(name))) return conflict(res, "name already taken");
  renameSync(sportDir(sport), sportDir(name));
  res.json({ name });
});

app.delete("/api/sports/:sport", (req, res) => {
  if (!exists(sportDir(req.params.sport))) return notFound(res);
  rmdir(sportDir(req.params.sport));
  res.json({ ok: true });
});

// ── Markets ───────────────────────────────────────────────────────────────────

app.post("/api/sports/:sport/markets", (req, res) => {
  const { sport } = req.params;
  const { name } = req.body;
  if (!exists(sportDir(sport))) return notFound(res);
  const dir = marketDir(sport, name);
  if (exists(dir)) return conflict(res, "market already exists");
  mkdir(join(dir, "rules"));
  mkdir(join(dir, "bookmakers"));
  mkdir(join(dir, "compatibility"));
  res.status(201).json({ name });
});

app.put("/api/sports/:sport/markets/:market", (req, res) => {
  const { sport, market } = req.params;
  const { name } = req.body;
  if (!exists(marketDir(sport, market))) return notFound(res);
  if (exists(marketDir(sport, name))) return conflict(res, "name already taken");
  renameSync(marketDir(sport, market), marketDir(sport, name));
  res.json({ name });
});

app.delete("/api/sports/:sport/markets/:market", (req, res) => {
  const { sport, market } = req.params;
  if (!exists(marketDir(sport, market))) return notFound(res);
  rmdir(marketDir(sport, market));
  res.json({ ok: true });
});

// ── Rules (children of market) ────────────────────────────────────────────────

app.get("/api/sports/:sport/markets/:market/rules", (req, res) => {
  const { sport, market } = req.params;
  const dir = rulesDir(sport, market);
  if (!exists(dir)) return res.json([]);
  const rules = ls(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ name: f.replace(/\.json$/, ""), ...read(join(dir, f)) }));
  res.json(rules);
});

app.post("/api/sports/:sport/markets/:market/rules", (req, res) => {
  const { sport, market } = req.params;
  const { name, label, description = "" } = req.body;
  if (!exists(marketDir(sport, market))) return notFound(res);
  const file = join(rulesDir(sport, market), `${name}.json`);
  if (exists(file)) return conflict(res, "rule already exists");
  mkdir(rulesDir(sport, market));
  write(file, { label, description });
  res.status(201).json({ name, label, description });
});

app.put("/api/sports/:sport/markets/:market/rules/:rule", (req, res) => {
  const { sport, market, rule } = req.params;
  const file = join(rulesDir(sport, market), `${rule}.json`);
  if (!exists(file)) return notFound(res);
  const current = read(file);
  const updated = { ...current, ...req.body };
  delete updated.name;
  write(file, updated);
  res.json({ name: rule, ...updated });
});

app.delete("/api/sports/:sport/markets/:market/rules/:rule", (req, res) => {
  const { sport, market, rule } = req.params;
  const file = join(rulesDir(sport, market), `${rule}.json`);
  if (!exists(file)) return notFound(res);
  rmSync(file);
  res.json({ ok: true });
});

// ── Bookmaker assignments ─────────────────────────────────────────────────────

const readBm = (file) => {
  const raw = read(file);
  if (typeof raw === "string") return { rule: raw, last_checked: null };
  return { rule: raw.rule, last_checked: raw.last_checked ?? null };
};

app.get("/api/sports/:sport/markets/:market/bookmakers", (req, res) => {
  const { sport, market } = req.params;
  const dir = bmDir(sport, market);
  if (!exists(dir)) return res.json([]);
  const entries = ls(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ bookmaker: f.replace(/\.json$/, ""), ...readBm(join(dir, f)) }));
  res.json(entries);
});

app.post("/api/sports/:sport/markets/:market/bookmakers", (req, res) => {
  const { sport, market } = req.params;
  const { bookmaker, rule } = req.body;
  if (!exists(marketDir(sport, market))) return notFound(res);
  const file = join(bmDir(sport, market), `${bmSlug(bookmaker)}.json`);
  if (exists(file)) return conflict(res, "bookmaker already assigned for this market");
  mkdir(bmDir(sport, market));
  const last_checked = new Date().toISOString();
  write(file, { rule, last_checked });
  res.status(201).json({ bookmaker: bmSlug(bookmaker), rule, last_checked });
});

app.put("/api/sports/:sport/markets/:market/bookmakers/:bookmaker", (req, res) => {
  const { sport, market, bookmaker } = req.params;
  const file = join(bmDir(sport, market), `${bookmaker}.json`);
  if (!exists(file)) return notFound(res);
  const current = readBm(file);
  const last_checked = new Date().toISOString();
  write(file, { ...current, rule: req.body.rule, last_checked });
  res.json({ bookmaker, rule: req.body.rule, last_checked });
});

app.patch("/api/sports/:sport/markets/:market/bookmakers/:bookmaker/check", (req, res) => {
  const { sport, market, bookmaker } = req.params;
  const file = join(bmDir(sport, market), `${bookmaker}.json`);
  if (!exists(file)) return notFound(res);
  const current = readBm(file);
  const last_checked = new Date().toISOString();
  write(file, { ...current, last_checked });
  res.json({ bookmaker, rule: current.rule, last_checked });
});

app.delete("/api/sports/:sport/markets/:market/bookmakers/:bookmaker", (req, res) => {
  const { sport, market, bookmaker } = req.params;
  const file = join(bmDir(sport, market), `${bookmaker}.json`);
  if (!exists(file)) return notFound(res);
  rmSync(file);
  res.json({ ok: true });
});

// ── Compatibility ─────────────────────────────────────────────────────────────

app.get("/api/sports/:sport/markets/:market/compatibility", (req, res) => {
  const { sport, market } = req.params;
  const dir = compatDir(sport, market);
  if (!exists(dir)) return res.json([]);
  const entries = ls(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const [rule_a, rule_b] = f.replace(/\.json$/, "").split("+");
      return { rule_a, rule_b, ...read(join(dir, f)) };
    });
  res.json(entries);
});

app.post("/api/sports/:sport/markets/:market/compatibility", (req, res) => {
  const { sport, market } = req.params;
  const { rule_a, rule_b, level, description = "" } = req.body;
  if (!exists(marketDir(sport, market))) return notFound(res);
  const file = join(compatDir(sport, market), pairFile(rule_a, rule_b));
  if (exists(file)) return conflict(res, "compatibility entry already exists");
  mkdir(compatDir(sport, market));
  write(file, { level, description });
  res.status(201).json({ rule_a, rule_b, level, description });
});

app.put("/api/sports/:sport/markets/:market/compatibility/:pair", (req, res) => {
  const { sport, market, pair } = req.params;
  const file = join(compatDir(sport, market), `${pair}.json`);
  if (!exists(file)) return notFound(res);
  const current = read(file);
  write(file, { ...current, ...req.body });
  const [rule_a, rule_b] = pair.split("+");
  res.json({ rule_a, rule_b, ...read(file) });
});

app.delete("/api/sports/:sport/markets/:market/compatibility/:pair", (req, res) => {
  const { sport, market, pair } = req.params;
  const file = join(compatDir(sport, market), `${pair}.json`);
  if (!exists(file)) return notFound(res);
  rmSync(file);
  res.json({ ok: true });
});

// ── Validation ────────────────────────────────────────────────────────────────

app.get("/api/validate", (req, res) => {
  const issues = [];
  if (!exists(SPORTS)) return res.json({ issues, count: 0 });

  for (const sport of ls(SPORTS).sort()) {
    const markets = join(SPORTS, sport, "markets");
    if (!exists(markets)) continue;
    for (const market of ls(markets).sort()) {
      const bms = bmDir(sport, market);
      if (!exists(bms)) continue;
      const rules = ls(bms).filter((f) => f.endsWith(".json")).map((f) => read(join(bms, f)));
      const unique = [...new Set(rules)].sort();
      if (unique.length < 2) continue;
      const cd = compatDir(sport, market);
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const file = join(cd, pairFile(unique[i], unique[j]));
          if (!exists(file)) {
            issues.push({ sport, market, rule_a: unique[i], rule_b: unique[j] });
          }
        }
      }
    }
  }
  res.json({ issues, count: issues.length });
});

// ── Bridge mappings (read-only — edit files manually) ─────────────────────────

app.get("/api/bookmaker-aliases", (req, res) => {
  const file = join(DATA, "bookmaker_mapping.json");
  res.json(exists(file) ? read(file) : {});
});

app.get("/api/sport-mapping", (req, res) => {
  const file = join(DATA, "sport_mapping.json");
  res.json(exists(file) ? read(file) : {});
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(3001, () => console.log("payout-rules API: http://localhost:3001"));
