/**
 * The editor's write side, independent of where the files live.
 *
 * Everything here reads and writes the files under data/ through a small store
 * — `exists`, `read`, `write`, `ls`, `rm`, `mkdir`, all on "/"-joined paths
 * relative to data/. server.js hands it the disk; the GitHub Pages build hands
 * it an in-memory snapshot of the repository, so both editors enforce exactly
 * the same rules and produce exactly the same files.
 *
 * The one rule it enforces is that a sport, a market or an outcome may only be
 * one of the canonical keys in data/sports.json and data/markets.json. That is
 * deliberate: those keys are MB-Tracker's and the odds matcher's own, so a rule
 * written here joins onto a live bet over there with no translation table. Free
 * text would let the two vocabularies drift apart silently, which is exactly the
 * failure this format was changed to remove — so the editor offers a picker and
 * refuses a key it does not know.
 */

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const notFound = () => new ApiError(404, "not found");
const conflict = (msg) => new ApiError(409, msg);
const bad = (msg) => new ApiError(400, msg);

const join = (...parts) => parts.filter((p) => p !== "").join("/");

const sportDir = (sport) => join("sports", sport);
const marketDir = (sport, market) => join("sports", sport, "markets", market);
const rulesDir = (sport, market) => join(marketDir(sport, market), "rules");
const bmDir = (sport, market) => join(marketDir(sport, market), "bookmakers");
const compatDir = (sport) => join("compatibility", sport);

export const LEVELS = ["compatible", "partial", "incompatible", "additional_profit"];

/**
 * The canonical filename for one rule pair.
 *
 * Both sides carry their market, because a pair can span two markets — 1X2 at
 * one bookmaker against Double Chance at the other is the workhorse football
 * bet. Sorting by "<MARKET>__<rule>" is what fixes which side the `a` in a
 * case's selector, and the $A in a description, refers to.
 */
const sideKey = (market, rule) => `${market}__${rule}`;
export const pairSlug = (ma, ra, mb, rb) => [sideKey(ma, ra), sideKey(mb, rb)].sort().join("+");

export function parsePairSlug(slug) {
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

export function createCore(store) {
  const { exists, read, write, rm, mkdir } = store;
  const ls = (p) => (exists(p) ? store.ls(p) : []);
  const jsonNames = (p) => ls(p).filter((f) => f.endsWith(".json")).sort();
  const stem = (f) => f.replace(/\.json$/, "");

  // The vocabularies are read per request rather than cached: they are two small
  // files, and an editor that needs restarting after a market is added to
  // markets.json would be a surprise nobody needs.
  const vocabSports = () => (exists("sports.json") ? read("sports.json") : {});
  const vocabMarkets = () => (exists("markets.json") ? read("markets.json") : {});
  const vocabBookmakers = () => (exists("bookmakers.json") ? read("bookmakers.json") : {});

  /** Delete every compatibility entry of `sport` one of whose sides `hits`. */
  const dropCompat = (sport, hits) => {
    for (const f of jsonNames(compatDir(sport))) {
      const pair = parsePairSlug(stem(f));
      if (!pair) continue;
      if (hits(pair.market_a, pair.rule_a) || hits(pair.market_b, pair.rule_b)) rm(join(compatDir(sport), f));
    }
  };

  // ── Bookmaker assignments ───────────────────────────────────────────────────

  /**
   * One assignment file, as the variant list everything above works in.
   *
   * A bookmaker that settles a market one way is `{rule, last_checked}`; one that
   * settles it differently depending on the competition — Winamax's tennis
   * retirement rule is one thing for ATP and another for ITF — carries `variants`
   * instead. The editor only ever sees the list, so the two shapes are a fact
   * about the file rather than about the UI.
   */
  const readBm = (file) => {
    const raw = read(file);
    const variants = Array.isArray(raw.variants)
      ? raw.variants.map((v) => ({ case: v.case ?? "", rule: v.rule, last_checked: v.last_checked ?? null }))
      : [{ case: "", rule: raw.rule, last_checked: raw.last_checked ?? null }];
    return { summary: raw.summary ?? "", variants };
  };

  /**
   * Write it back in the smallest shape that says what it means.
   *
   * One unconditional variant is written as the flat `{rule, last_checked}` the
   * repository has always used: three hundred files say that, and rewriting them
   * all into a one-element list would be a diff nobody could read for no
   * information gained.
   */
  const writeBm = (file, { summary, variants }) => {
    if (variants.length === 1 && !String(variants[0].case ?? "").trim()) {
      write(file, { rule: variants[0].rule, last_checked: variants[0].last_checked });
      return;
    }
    write(file, {
      ...(summary ? { summary } : {}),
      variants: variants.map((v) => ({
        case: String(v.case ?? "").trim(),
        rule: v.rule,
        last_checked: v.last_checked,
      })),
    });
  };

  /**
   * The variants of a request body.
   *
   * Accepts the old `{ rule }` body as one unconditional variant so a client that
   * has not been reloaded still works.
   */
  function bmBody(body, sport, market) {
    const now = new Date().toISOString();
    const raw = Array.isArray(body.variants) ? body.variants : [{ case: "", rule: body.rule }];

    if (raw.length === 0) throw bad("at least one variant is required");

    const slugs = new Set(jsonNames(rulesDir(sport, market)).map(stem));
    const seen = new Set();
    const variants = [];

    for (const v of raw) {
      const rule = v?.rule;
      if (typeof rule !== "string" || !rule.trim()) throw bad("every variant needs a rule");
      if (!slugs.has(rule)) throw bad(`rule '${rule}' does not exist in ${sport} / ${market}`);
      if (seen.has(rule)) throw bad(`rule '${rule}' is used by two variants — merge their cases instead`);
      seen.add(rule);
      const kase = String(v.case ?? "").trim();
      if (raw.length > 1 && !kase) throw bad("every variant needs a case when there is more than one");
      if (kase.length > 80) throw bad("a case must be at most 80 characters — it is drawn in a tooltip");
      // Touched on every write: a variant that was edited was, by definition,
      // just looked at, and the contribution rules ask for that date.
      variants.push({ case: kase, rule, last_checked: v.last_checked ?? now });
    }

    return { summary: String(body.summary ?? "").trim(), variants };
  }

  // ── Compatibility ───────────────────────────────────────────────────────────

  function compatBody({ level, description = "", cases = [] }) {
    if (!LEVELS.includes(level)) throw bad(`level must be one of ${LEVELS.join(", ")}`);
    if (!Array.isArray(cases)) throw bad("cases must be an array");
    for (const c of cases) {
      if (!LEVELS.includes(c?.level)) throw bad(`case level must be one of ${LEVELS.join(", ")}`);
      const when = c.when ?? {};
      if (typeof when !== "object" || Object.keys(when).length === 0) {
        throw bad("every case needs a condition — the default is the top-level level");
      }
    }
    // Written back in a fixed key order so a re-save produces no incidental diff.
    const out = { level, description };
    if (cases.length > 0) out.cases = cases.map((c) => ({ when: c.when, level: c.level, description: c.description ?? "" }));
    return out;
  }

  return {
    /** Sports, markets and bookmakers this repo is allowed to name. */
    getVocab: () => ({ sports: vocabSports(), markets: vocabMarkets(), bookmakers: vocabBookmakers() }),

    // ── Sports ──

    getSports() {
      return ls("sports")
        .filter((s) => exists(join("sports", s, "markets")))
        .sort()
        .map((s) => ({ key: s, markets: ls(join("sports", s, "markets")).sort() }));
    },

    createSport(key) {
      if (!vocabSports()[key]) throw bad(`unknown sport '${key}' — add it to data/sports.json first`);
      if (exists(sportDir(key))) throw conflict("sport already exists");
      mkdir(join(sportDir(key), "markets"));
      return { key, markets: [] };
    },

    deleteSport(sport) {
      if (!exists(sportDir(sport))) throw notFound();
      rm(sportDir(sport));
      rm(compatDir(sport));
      return { ok: true };
    },

    // ── Markets ──

    createMarket(sport, key) {
      if (!exists(sportDir(sport))) throw notFound();
      const def = vocabMarkets()[key];
      if (!def) throw bad(`unknown market '${key}' — add it to data/markets.json first`);
      // An empty sports list means "every sport"; a non-empty one is the model
      // saying this market does not exist in that sport at all.
      if ((def.sports ?? []).length > 0 && !def.sports.includes(sport)) {
        throw bad(`market '${key}' is not offered in '${sport}'`);
      }
      if (exists(marketDir(sport, key))) throw conflict("market already exists");
      mkdir(rulesDir(sport, key));
      mkdir(bmDir(sport, key));
      return { key };
    },

    deleteMarket(sport, market) {
      if (!exists(marketDir(sport, market))) throw notFound();
      rm(marketDir(sport, market));
      // Compatibility entries naming this market are now dangling, and the
      // validator would reject the push rather than the user finding out later.
      dropCompat(sport, (m) => m === market);
      return { ok: true };
    },

    // ── Rules ──

    getRules(sport, market) {
      const dir = rulesDir(sport, market);
      return jsonNames(dir).map((f) => ({ name: stem(f), ...read(join(dir, f)) }));
    },

    createRule(sport, market, { name, label, description = "" }) {
      if (!exists(marketDir(sport, market))) throw notFound();
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(name ?? "")) throw bad("slug must be lowercase letters, digits, '-' or '_'");
      const file = join(rulesDir(sport, market), `${name}.json`);
      if (exists(file)) throw conflict("rule already exists");
      mkdir(rulesDir(sport, market));
      write(file, { label, description });
      return { name, label, description };
    },

    updateRule(sport, market, rule, data) {
      const file = join(rulesDir(sport, market), `${rule}.json`);
      if (!exists(file)) throw notFound();
      const updated = { ...read(file), ...data };
      delete updated.name;
      write(file, updated);
      return { name: rule, ...updated };
    },

    deleteRule(sport, market, rule) {
      const file = join(rulesDir(sport, market), `${rule}.json`);
      if (!exists(file)) throw notFound();
      rm(file);
      // Same reason as deleting a market: a compatibility entry pointing at a
      // rule that no longer exists fails the validator on push.
      dropCompat(sport, (m, r) => m === market && r === rule);
      return { ok: true };
    },

    // ── Bookmaker assignments ──

    getMarketBookmakers(sport, market) {
      const dir = bmDir(sport, market);
      return jsonNames(dir).map((f) => ({ bookmaker: stem(f), ...readBm(join(dir, f)) }));
    },

    assignBookmaker(sport, market, data) {
      const { bookmaker } = data;
      if (!exists(marketDir(sport, market))) throw notFound();
      if (!vocabBookmakers()[bookmaker]) throw bad(`unknown bookmaker '${bookmaker}' — add it to data/bookmakers.json first`);
      const file = join(bmDir(sport, market), `${bookmaker}.json`);
      if (exists(file)) throw conflict("bookmaker already assigned for this market");
      const body = bmBody(data, sport, market);
      mkdir(bmDir(sport, market));
      writeBm(file, body);
      return { bookmaker, ...readBm(file) };
    },

    updateBookmakerRule(sport, market, bookmaker, data) {
      const file = join(bmDir(sport, market), `${bookmaker}.json`);
      if (!exists(file)) throw notFound();
      writeBm(file, bmBody(data, sport, market));
      return { bookmaker, ...readBm(file) };
    },

    touchBookmakerCheck(sport, market, bookmaker) {
      const file = join(bmDir(sport, market), `${bookmaker}.json`);
      if (!exists(file)) throw notFound();
      const current = readBm(file);
      const last_checked = new Date().toISOString();
      // Every variant at once: the check is "I have just read this bookmaker's
      // terms for this market", which is one act however many rules it found.
      writeBm(file, { ...current, variants: current.variants.map((v) => ({ ...v, last_checked })) });
      return { bookmaker, ...readBm(file) };
    },

    removeBookmaker(sport, market, bookmaker) {
      const file = join(bmDir(sport, market), `${bookmaker}.json`);
      if (!exists(file)) throw notFound();
      rm(file);
      return { ok: true };
    },

    // ── Compatibility (sport-scoped, because a pair can span two markets) ──

    getCompatibility(sport) {
      const dir = compatDir(sport);
      return jsonNames(dir).map((f) => ({ slug: stem(f), ...parsePairSlug(stem(f)), cases: [], ...read(join(dir, f)) }));
    },

    createCompatibility(sport, data) {
      const { market_a, rule_a, market_b, rule_b } = data;
      if (!exists(sportDir(sport))) throw notFound();
      for (const [market, rule] of [[market_a, rule_a], [market_b, rule_b]]) {
        if (!exists(join(rulesDir(sport, market ?? ""), `${rule}.json`))) {
          throw bad(`rule '${rule}' does not exist in ${sport} / ${market}`);
        }
      }
      const body = compatBody(data);
      const slug = pairSlug(market_a, rule_a, market_b, rule_b);
      const file = join(compatDir(sport), `${slug}.json`);
      if (exists(file)) throw conflict("compatibility entry already exists");
      mkdir(compatDir(sport));
      write(file, body);
      return { slug, ...parsePairSlug(slug), ...body };
    },

    updateCompatibility(sport, slug, data) {
      const file = join(compatDir(sport), `${slug}.json`);
      if (!exists(file)) throw notFound();
      const body = compatBody(data);
      write(file, body);
      return { slug, ...parsePairSlug(slug), ...body };
    },

    deleteCompatibility(sport, slug) {
      const file = join(compatDir(sport), `${slug}.json`);
      if (!exists(file)) throw notFound();
      rm(file);
      return { ok: true };
    },

    // ── Validation ──

    /**
     * Rule pairs a user could bet today with nothing written about them.
     *
     * Only pairs *within* one market are demanded, and only between rules
     * actually assigned to a bookmaker. Which markets oppose each other across a
     * bet is the matcher's model rather than this repo's, so requiring every
     * cross-market combination would demand entries for pairs that are not bets
     * at all.
     */
    validate() {
      const issues = [];
      for (const sport of ls("sports").sort()) {
        const markets = join("sports", sport, "markets");
        if (!exists(markets)) continue;
        const defined = new Set(jsonNames(compatDir(sport)).map(stem));

        for (const market of ls(markets).sort()) {
          const dir = bmDir(sport, market);
          // Every rule a bookmaker can settle by, variants included: each one
          // can meet each other one across a bet.
          const assigned = [...new Set(
            jsonNames(dir).flatMap((f) => readBm(join(dir, f)).variants.map((v) => v.rule)),
          )].sort();
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
      return { issues, count: issues.length };
    },
  };
}
