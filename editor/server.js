/**
 * The editor's write side.
 *
 * Everything here writes the files under ../data, and the one rule it enforces
 * is that a sport, a market or an outcome may only be one of the canonical keys
 * in data/sports.json and data/markets.json. That is deliberate: those keys are
 * MB-Tracker's and the odds matcher's own, so a rule written here joins onto a
 * live bet over there with no translation table. Free text would let the two
 * vocabularies drift apart silently, which is exactly the failure this format
 * was changed to remove — so the editor offers a picker and refuses a key it
 * does not know.
 */
import express from "express";
import cors from "cors";
import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, readdirSync, rmSync,
} from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");
const SPORTS = resolve(DATA, "sports");
const COMPAT = resolve(DATA, "compatibility");

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
const jsonNames = (p) => ls(p).filter((f) => f.endsWith(".json")).sort();

const sportDir = (sport) => join(SPORTS, sport);
const marketDir = (sport, market) => join(SPORTS, sport, "markets", market);
const rulesDir = (sport, market) => join(marketDir(sport, market), "rules");
const bmDir = (sport, market) => join(marketDir(sport, market), "bookmakers");
const compatDir = (sport) => join(COMPAT, sport);

const notFound = (res) => res.status(404).json({ error: "not found" });
const conflict = (res, msg) => res.status(409).json({ error: msg });
const bad = (res, msg) => res.status(400).json({ error: msg });

// The vocabularies are read per request rather than cached: they are two small
// files, and an editor that needs restarting after a market is added to
// markets.json would be a surprise nobody needs.
const vocabSports = () => (exists(join(DATA, "sports.json")) ? read(join(DATA, "sports.json")) : {});
const vocabMarkets = () => (exists(join(DATA, "markets.json")) ? read(join(DATA, "markets.json")) : {});
const vocabBookmakers = () => (exists(join(DATA, "bookmakers.json")) ? read(join(DATA, "bookmakers.json")) : {});

/**
 * The canonical filename for one rule pair.
 *
 * Both sides carry their market, because a pair can span two markets — 1X2 at
 * one bookmaker against Double Chance at the other is the workhorse football
 * bet. Sorting by "<MARKET>__<rule>" is what fixes which side the `a` in a
 * case's selector, and the $A in a description, refers to.
 */
const sideKey = (market, rule) => `${market}__${rule}`;
const pairSlug = (ma, ra, mb, rb) => [sideKey(ma, ra), sideKey(mb, rb)].sort().join("+");

function parsePairSlug(slug) {
  const parts = slug.split("+");
  if (parts.length !== 2) return null;
  const sides = parts.map((part) => {
    const i = part.indexOf("__");
    if (i <= 0 || i + 2 >= part.length) return null;
    return { market: part.slice(0, i), rule: part.slice(i + 2) };
  });
  if (sides.some((s) => s === null)) return null;
  return { market_a: sides[0].market, rule_a: sides[0].rule, market_b: sides[1].market, rule_b: sides[1].rule };
}

// ── Vocabulary ────────────────────────────────────────────────────────────────

app.get("/api/vocab", (req, res) => {
  res.json({ sports: vocabSports(), markets: vocabMarkets(), bookmakers: vocabBookmakers() });
});

// ── Sports ────────────────────────────────────────────────────────────────────

app.get("/api/sports", (req, res) => {
  mkdir(SPORTS);
  const sports = ls(SPORTS)
    .filter((s) => exists(join(SPORTS, s, "markets")))
    .sort()
    .map((s) => ({ key: s, markets: ls(join(SPORTS, s, "markets")).sort() }));
  res.json(sports);
});

app.post("/api/sports", (req, res) => {
  const { key } = req.body;
  if (!vocabSports()[key]) return bad(res, `unknown sport '${key}' — add it to data/sports.json first`);
  const dir = sportDir(key);
  if (exists(dir)) return conflict(res, "sport already exists");
  mkdir(join(dir, "markets"));
  res.status(201).json({ key, markets: [] });
});

app.delete("/api/sports/:sport", (req, res) => {
  const { sport } = req.params;
  if (!exists(sportDir(sport))) return notFound(res);
  rmdir(sportDir(sport));
  rmdir(compatDir(sport));
  res.json({ ok: true });
});

// ── Markets ───────────────────────────────────────────────────────────────────

app.post("/api/sports/:sport/markets", (req, res) => {
  const { sport } = req.params;
  const { key } = req.body;
  if (!exists(sportDir(sport))) return notFound(res);

  const def = vocabMarkets()[key];
  if (!def) return bad(res, `unknown market '${key}' — add it to data/markets.json first`);
  // An empty sports list means "every sport"; a non-empty one is the model
  // saying this market does not exist in that sport at all.
  if ((def.sports ?? []).length > 0 && !def.sports.includes(sport)) {
    return bad(res, `market '${key}' is not offered in '${sport}'`);
  }

  const dir = marketDir(sport, key);
  if (exists(dir)) return conflict(res, "market already exists");
  mkdir(join(dir, "rules"));
  mkdir(join(dir, "bookmakers"));
  res.status(201).json({ key });
});

app.delete("/api/sports/:sport/markets/:market", (req, res) => {
  const { sport, market } = req.params;
  if (!exists(marketDir(sport, market))) return notFound(res);
  rmdir(marketDir(sport, market));
  // Compatibility entries naming this market are now dangling, and the
  // validator would reject the push rather than the user finding out later.
  for (const f of jsonNames(compatDir(sport))) {
    const pair = parsePairSlug(f.replace(/\.json$/, ""));
    if (pair && (pair.market_a === market || pair.market_b === market)) {
      rmSync(join(compatDir(sport), f));
    }
  }
  res.json({ ok: true });
});

// ── Rules (children of market) ────────────────────────────────────────────────

app.get("/api/sports/:sport/markets/:market/rules", (req, res) => {
  const { sport, market } = req.params;
  const dir = rulesDir(sport, market);
  res.json(jsonNames(dir).map((f) => ({ name: f.replace(/\.json$/, ""), ...read(join(dir, f)) })));
});

app.post("/api/sports/:sport/markets/:market/rules", (req, res) => {
  const { sport, market } = req.params;
  const { name, label, description = "" } = req.body;
  if (!exists(marketDir(sport, market))) return notFound(res);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name ?? "")) return bad(res, "slug must be lowercase letters, digits, '-' or '_'");
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
  const updated = { ...read(file), ...req.body };
  delete updated.name;
  write(file, updated);
  res.json({ name: rule, ...updated });
});

app.delete("/api/sports/:sport/markets/:market/rules/:rule", (req, res) => {
  const { sport, market, rule } = req.params;
  const file = join(rulesDir(sport, market), `${rule}.json`);
  if (!exists(file)) return notFound(res);
  rmSync(file);
  // Same reason as deleting a market: a compatibility entry pointing at a rule
  // that no longer exists fails the validator on push.
  for (const f of jsonNames(compatDir(sport))) {
    const pair = parsePairSlug(f.replace(/\.json$/, ""));
    if (!pair) continue;
    const hits =
      (pair.market_a === market && pair.rule_a === rule) ||
      (pair.market_b === market && pair.rule_b === rule);
    if (hits) rmSync(join(compatDir(sport), f));
  }
  res.json({ ok: true });
});

// ── Bookmaker assignments ─────────────────────────────────────────────────────

const readBm = (file) => {
  const raw = read(file);
  return { rule: raw.rule, last_checked: raw.last_checked ?? null };
};

app.get("/api/sports/:sport/markets/:market/bookmakers", (req, res) => {
  const { sport, market } = req.params;
  const dir = bmDir(sport, market);
  res.json(jsonNames(dir).map((f) => ({ bookmaker: f.replace(/\.json$/, ""), ...readBm(join(dir, f)) })));
});

app.post("/api/sports/:sport/markets/:market/bookmakers", (req, res) => {
  const { sport, market } = req.params;
  const { bookmaker, rule } = req.body;
  if (!exists(marketDir(sport, market))) return notFound(res);
  if (!vocabBookmakers()[bookmaker]) return bad(res, `unknown bookmaker '${bookmaker}' — add it to data/bookmakers.json first`);
  const file = join(bmDir(sport, market), `${bookmaker}.json`);
  if (exists(file)) return conflict(res, "bookmaker already assigned for this market");
  mkdir(bmDir(sport, market));
  const last_checked = new Date().toISOString();
  write(file, { rule, last_checked });
  res.status(201).json({ bookmaker, rule, last_checked });
});

app.put("/api/sports/:sport/markets/:market/bookmakers/:bookmaker", (req, res) => {
  const { sport, market, bookmaker } = req.params;
  const file = join(bmDir(sport, market), `${bookmaker}.json`);
  if (!exists(file)) return notFound(res);
  const last_checked = new Date().toISOString();
  write(file, { rule: req.body.rule, last_checked });
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

// ── Compatibility (sport-scoped, because a pair can span two markets) ─────────

const LEVELS = ["compatible", "partial", "incompatible", "additional_profit"];

function compatBody(req) {
  const { level, description = "", cases = [] } = req.body;
  if (!LEVELS.includes(level)) return { error: `level must be one of ${LEVELS.join(", ")}` };
  if (!Array.isArray(cases)) return { error: "cases must be an array" };
  for (const c of cases) {
    if (!LEVELS.includes(c?.level)) return { error: `case level must be one of ${LEVELS.join(", ")}` };
    const when = c.when ?? {};
    if (typeof when !== "object" || Object.keys(when).length === 0) {
      return { error: "every case needs a condition — the default is the top-level level" };
    }
  }
  // Written back in a fixed key order so a re-save produces no incidental diff.
  const body = { level, description };
  if (cases.length > 0) body.cases = cases.map((c) => ({ when: c.when, level: c.level, description: c.description ?? "" }));
  return { body };
}

app.get("/api/sports/:sport/compatibility", (req, res) => {
  const dir = compatDir(req.params.sport);
  res.json(
    jsonNames(dir).map((f) => {
      const slug = f.replace(/\.json$/, "");
      return { slug, ...parsePairSlug(slug), cases: [], ...read(join(dir, f)) };
    }),
  );
});

app.post("/api/sports/:sport/compatibility", (req, res) => {
  const { sport } = req.params;
  const { market_a, rule_a, market_b, rule_b } = req.body;
  if (!exists(sportDir(sport))) return notFound(res);
  for (const [market, rule] of [[market_a, rule_a], [market_b, rule_b]]) {
    if (!exists(join(rulesDir(sport, market ?? ""), `${rule}.json`))) {
      return bad(res, `rule '${rule}' does not exist in ${sport} / ${market}`);
    }
  }
  const parsed = compatBody(req);
  if (parsed.error) return bad(res, parsed.error);

  const slug = pairSlug(market_a, rule_a, market_b, rule_b);
  const file = join(compatDir(sport), `${slug}.json`);
  if (exists(file)) return conflict(res, "compatibility entry already exists");
  mkdir(compatDir(sport));
  write(file, parsed.body);
  res.status(201).json({ slug, ...parsePairSlug(slug), ...parsed.body });
});

app.put("/api/sports/:sport/compatibility/:slug", (req, res) => {
  const { sport, slug } = req.params;
  const file = join(compatDir(sport), `${slug}.json`);
  if (!exists(file)) return notFound(res);
  const parsed = compatBody(req);
  if (parsed.error) return bad(res, parsed.error);
  write(file, parsed.body);
  res.json({ slug, ...parsePairSlug(slug), ...parsed.body });
});

app.delete("/api/sports/:sport/compatibility/:slug", (req, res) => {
  const { sport, slug } = req.params;
  const file = join(compatDir(sport), `${slug}.json`);
  if (!exists(file)) return notFound(res);
  rmSync(file);
  res.json({ ok: true });
});

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Rule pairs a user could bet today with nothing written about them.
 *
 * Only pairs *within* one market are demanded, and only between rules actually
 * assigned to a bookmaker. Which markets oppose each other across a bet is the
 * matcher's model rather than this repo's, so requiring every cross-market
 * combination would demand entries for pairs that are not bets at all.
 */
app.get("/api/validate", (req, res) => {
  const issues = [];
  for (const sport of ls(SPORTS).sort()) {
    const markets = join(SPORTS, sport, "markets");
    if (!exists(markets)) continue;
    const defined = new Set(jsonNames(compatDir(sport)).map((f) => f.replace(/\.json$/, "")));

    for (const market of ls(markets).sort()) {
      const dir = bmDir(sport, market);
      const assigned = [...new Set(jsonNames(dir).map((f) => readBm(join(dir, f)).rule))].sort();
      for (let i = 0; i < assigned.length; i++) {
        for (let j = i + 1; j < assigned.length; j++) {
          const slug = pairSlug(market, assigned[i], market, assigned[j]);
          if (!defined.has(slug)) {
            issues.push({ sport, market, rule_a: assigned[i], rule_b: assigned[j], slug });
          }
        }
      }
    }
  }
  res.json({ issues, count: issues.length });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(3001, () => console.log("payout-rules API: http://localhost:3001"));
