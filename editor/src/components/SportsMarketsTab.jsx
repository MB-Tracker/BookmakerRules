import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api/client.js";
import MarketSection from "./MarketSection.jsx";
import CompatibilitySection from "./CompatibilitySection.jsx";
import TabBar from "./TabBar.jsx";

// ── Sport view ────────────────────────────────────────────────────────────────

/**
 * One sport: compatibility on one side, its markets on the other.
 *
 * Rules and bookmaker assignments are fetched here rather than inside each
 * market, because compatibility spans markets and needs all of them at once —
 * and fetching twice would let the two views disagree after an edit.
 */
function SportView({ sportKey, markets, vocab, onChanged, market, onSelectMarket, missingByMarket }) {
  const [marketsData, setMarketsData] = useState({});
  const [entries, setEntries] = useState([]);
  const [newMarket, setNewMarket] = useState("");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const marketKeys = useMemo(() => markets ?? [], [markets]);
  const reload = useCallback(() => { setTick((n) => n + 1); onChanged(); }, [onChanged]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      Promise.all(marketKeys.map(async (m) => [
        m,
        {
          def: null,
          rules: await api.getRules(sportKey, m),
          assignments: await api.getMarketBookmakers(sportKey, m),
        },
      ])),
      api.getCompatibility(sportKey),
    ]).then(([pairs, compat]) => {
      if (cancelled) return;
      setMarketsData(Object.fromEntries(pairs));
      setEntries(compat);
    });
    return () => { cancelled = true; };
  }, [sportKey, marketKeys, tick]);

  // The market definitions come from the vocabulary, not from the API above.
  const withDefs = useMemo(() => {
    const out = {};
    for (const [key, data] of Object.entries(marketsData)) {
      out[key] = { ...data, def: vocab.markets[key] };
    }
    return out;
  }, [marketsData, vocab.markets]);

  const available = Object.entries(vocab.markets)
    .filter(([key]) => !marketKeys.includes(key))
    .filter(([, def]) => (def.sports ?? []).length === 0 || def.sports.includes(sportKey))
    .sort((a, b) => a[1].label.localeCompare(b[1].label));

  const addMarket = async (e) => {
    e.preventDefault();
    if (!newMarket) return;
    try {
      await api.createMarket(sportKey, newMarket);
      setNewMarket("");
      setError("");
      onSelectMarket(newMarket);
      reload();
    } catch (err) { setError(err.message); }
  };

  // Fall back to the first market when the hash names none of this sport's.
  const current = marketKeys.includes(market) ? market : marketKeys[0] ?? "";

  return (
    <div className="row g-3 split">
      <div className="col-lg-5 pane">
        <h6 className="pane-title">
          Compatibility
          {current && <span className="text-body ms-2 text-none">· {vocab.markets[current]?.label ?? current}</span>}
        </h6>
        {marketKeys.length > 0
          ? <CompatibilitySection key={current} sport={sportKey} market={current}
              marketsData={withDefs} entries={entries} onChanged={reload} />
          : <p className="text-muted small">Add a market first.</p>}
      </div>

      <div className="col-lg-7 pane">
        <h6 className="pane-title">Markets</h6>
        <TabBar small
          items={marketKeys.map((m) => ({
            key: m,
            label: vocab.markets[m]?.label ?? m,
            badge: missingByMarket[m] > 0 && <span className="badge bg-warning text-dark ms-2">⚠ {missingByMarket[m]}</span>,
          }))}
          active={current} onSelect={onSelectMarket}
          extra={available.length > 0 && (
            <form className="d-flex gap-1" onSubmit={addMarket}>
              <select className="form-select form-select-sm border-0 text-muted" value={newMarket}
                onChange={(e) => setNewMarket(e.target.value)} required>
                <option value="">+ market</option>
                {available.map(([key, def]) => (
                  <option key={key} value={key}>{def.label} ({key})</option>
                ))}
              </select>
              {newMarket && <button type="submit" className="btn btn-sm btn-primary">Add</button>}
            </form>
          )} />

        {error && <div className="alert alert-danger py-1 small mt-2 mb-0">{error}</div>}

        <div className="pt-3">
          {marketKeys.length === 0 && <p className="text-muted small">No markets yet — add one from the “+ market” menu.</p>}
          {current && (
            <MarketSection key={current} sport={sportKey} market={current}
              marketDef={vocab.markets[current]}
              bookmakers={vocab.bookmakers}
              rules={marketsData[current]?.rules ?? []}
              assignments={marketsData[current]?.assignments ?? []}
              onChanged={reload} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

/** `#SPORT/MARKET` in the URL, so a link can point at either. */
const fromHash = () => {
  const [sport = "", market = ""] = location.hash.slice(1).split("/").map(decodeURIComponent);
  return { sport, market };
};

export default function SportsMarketsTab({ header }) {
  const [vocab, setVocab] = useState({ sports: {}, markets: {}, bookmakers: {} });
  const [sports, setSports] = useState(null);
  const [issues, setIssues] = useState(null);
  const [checking, setChecking] = useState(false);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState(fromHash);
  const [error, setError] = useState("");

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    Promise.all([api.getVocab(), api.getSports()]).then(([v, s]) => { setVocab(v); setSports(s); });
  }, [tick]);

  useEffect(() => {
    const onHash = () => setSelected(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const check = useCallback(async () => {
    setChecking(true);
    const result = await api.validate();
    setIssues(result.issues);
    setChecking(false);
    return result.issues;
  }, []);

  // Exposed for integration tests.
  useEffect(() => { window.payoutRulesEditorCheck = check; }, [check]);
  useEffect(() => { check(); }, [check, tick]);

  const bySport = useMemo(() => Object.fromEntries((sports ?? []).map((s) => [s.key, s.markets])), [sports]);

  const missingBySport = useMemo(() => {
    const m = {};
    for (const i of issues ?? []) m[i.sport] = (m[i.sport] ?? 0) + 1;
    return m;
  }, [issues]);

  // Per market of the sport on screen, for the badges on its market tabs.
  const missingByMarket = (sport) => {
    const m = {};
    for (const i of issues ?? []) if (i.sport === sport) m[i.market] = (m[i.market] ?? 0) + 1;
    return m;
  };

  // Fall back to the first sport with data when the hash names none.
  // Tabs are in data/sports.json order, so the fallback is the first tab shown.
  const shown = Object.keys(vocab.sports).filter((key) => key in bySport);
  const current = selected.sport in bySport ? selected.sport : shown[0] ?? "";
  const select = (sport, market = "") => {
    location.hash = [sport, market].filter(Boolean).map(encodeURIComponent).join("/");
  };

  const create = async (key) => {
    try {
      await api.createSport(key);
      setError("");
      select(key);
      reload();
    } catch (err) { setError(err.message); }
  };

  const absent = Object.entries(vocab.sports).filter(([key]) => !(key in bySport));
  const total = issues?.length ?? 0;

  return (
    <div className="d-flex flex-column flex-grow-1" style={{ minHeight: 0 }}>
      <div className="d-flex align-items-center flex-wrap gap-2 mb-2">
        <div className="flex-grow-1">{header}</div>
        {issues !== null && (
          total === 0
            ? <span className="badge bg-success">All compatibility defined</span>
            : <span className="text-warning small fw-semibold" title={issues.map((i) => `${i.sport} / ${i.market}: ${i.rule_a} × ${i.rule_b}`).join("\n")}>
                ⚠ {total} undefined pair{total > 1 ? "s" : ""}
              </span>
        )}
        <button className="btn btn-sm btn-outline-secondary" onClick={check} disabled={checking}>
          {checking ? "Checking…" : "Check All"}
        </button>
      </div>

      <div className="mb-3">
        <TabBar
          items={shown.map((key) => ({
            key,
            label: vocab.sports[key],
            badge: missingBySport[key] > 0 && <span className="badge bg-warning text-dark ms-2">⚠ {missingBySport[key]}</span>,
          }))}
          active={current} onSelect={(key) => select(key)}
          extra={absent.length > 0 && (
            <select className="form-select form-select-sm border-0 text-muted" value=""
              onChange={(e) => e.target.value && create(e.target.value)}>
              <option value="">+ sport</option>
              {absent.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          )} />
      </div>

      {error && <div className="alert alert-danger py-1 small">{error}</div>}

      {sports !== null && current && (
        <SportView key={current} sportKey={current} markets={bySport[current]} vocab={vocab} onChanged={reload}
          market={selected.market} onSelectMarket={(m) => select(current, m)}
          missingByMarket={missingByMarket(current)} />
      )}

      {sports !== null && !current && (
        <p className="text-muted">No sports yet — add one from the “+ sport” menu.</p>
      )}
    </div>
  );
}
