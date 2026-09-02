import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api/client.js";
import MarketSection from "./MarketSection.jsx";
import CompatibilitySection from "./CompatibilitySection.jsx";

// ── Sport section ─────────────────────────────────────────────────────────────

/**
 * One sport, with everything under it loaded in one pass.
 *
 * Rules and bookmaker assignments are fetched here rather than inside each
 * market, because compatibility spans markets and needs all of them at once —
 * and fetching twice would let the two views disagree after an edit.
 */
function SportSection({ sportKey, sportLabel, exists, markets, vocab, onChanged, missingCount }) {
  const [open, setOpen] = useState(false);
  const [marketsData, setMarketsData] = useState({});
  const [entries, setEntries] = useState([]);
  const [newMarket, setNewMarket] = useState("");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const marketKeys = useMemo(() => markets ?? [], [markets]);
  const reload = useCallback(() => { setTick((n) => n + 1); onChanged(); }, [onChanged]);

  useEffect(() => {
    if (!exists || !open) return;
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
  }, [sportKey, exists, open, marketKeys, tick]);

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

  const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };

  const create = async () => {
    try { await api.createSport(sportKey); onChanged(); } catch (err) { setError(err.message); }
  };

  const addMarket = async (e) => {
    e.preventDefault();
    if (!newMarket) return;
    try {
      await api.createMarket(sportKey, newMarket);
      setNewMarket("");
      reload();
    } catch (err) { setError(err.message); }
  };

  return (
    <div className={`border rounded overflow-hidden mb-2 ${!exists ? "opacity-50" : ""}`}>
      <div className={`d-flex align-items-center px-3 py-2 ${exists ? "bg-white" : "bg-light"}`}
        style={{ cursor: exists ? "pointer" : "default" }}
        onClick={() => exists && setOpen((v) => !v)}>
        <span className="me-2 text-muted" style={{ fontSize: ".75rem", width: "1rem" }}>
          {exists ? (open ? "▾" : "▸") : ""}
        </span>
        <span className="fw-semibold flex-grow-1">{sportLabel}</span>
        <span className="badge bg-light text-secondary border me-2" style={{ fontSize: ".7rem" }}>{sportKey}</span>
        {exists && missingCount > 0 && <span className="badge bg-warning text-dark me-2">⚠ {missingCount}</span>}
        {exists && missingCount === 0 && marketKeys.length > 0 && <span className="badge bg-success me-2">✓</span>}
        {!exists && <button className="btn btn-sm btn-outline-primary" onClick={stop(create)}>Add</button>}
      </div>

      {exists && open && (
        <div className="border-top">
          {marketKeys.length === 0
            ? <p className="text-muted small px-3 py-2 mb-0">No markets yet.</p>
            : marketKeys.map((m) => (
                <MarketSection key={m} sport={sportKey} market={m}
                  marketDef={vocab.markets[m]}
                  bookmakers={vocab.bookmakers}
                  rules={marketsData[m]?.rules ?? []}
                  assignments={marketsData[m]?.assignments ?? []}
                  onChanged={reload} />
              ))
          }

          {marketKeys.length > 0 && (
            <CompatibilitySection sport={sportKey} marketsData={withDefs}
              entries={entries} onChanged={reload} />
          )}

          <div className="px-3 py-2 bg-white border-top">
            {error && <div className="alert alert-danger py-1 small mb-2">{error}</div>}
            <form className="d-flex gap-2" onSubmit={addMarket}>
              <select className="form-select form-select-sm w-auto" value={newMarket}
                onChange={(e) => setNewMarket(e.target.value)} required>
                <option value="">— add a market —</option>
                {available.map(([key, def]) => (
                  <option key={key} value={key}>{def.label} ({key})</option>
                ))}
              </select>
              <button type="submit" className="btn btn-sm btn-outline-primary" disabled={!newMarket}>Add Market</button>
            </form>
            {available.length === 0 && (
              <div className="form-text">Every market this sport has in data/markets.json is already here.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function SportsMarketsTab() {
  const [vocab, setVocab] = useState({ sports: {}, markets: {}, bookmakers: {} });
  const [sports, setSports] = useState([]);
  const [issues, setIssues] = useState(null);
  const [checking, setChecking] = useState(false);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    Promise.all([api.getVocab(), api.getSports()]).then(([v, s]) => { setVocab(v); setSports(s); });
  }, [tick]);

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

  const bySport = useMemo(() => Object.fromEntries(sports.map((s) => [s.key, s.markets])), [sports]);

  const missingBySport = useMemo(() => {
    const m = {};
    for (const i of issues ?? []) m[i.sport] = (m[i.sport] ?? 0) + 1;
    return m;
  }, [issues]);

  const total = issues?.length ?? 0;

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={check} disabled={checking}>
          {checking ? "Checking…" : "Check All"}
        </button>
        {issues !== null && (
          total === 0
            ? <span className="badge bg-success">All compatibility defined</span>
            : <span className="text-warning small fw-semibold">
                ⚠ {total} rule pair{total > 1 ? "s" : ""} assigned to bookmakers with nothing written about them
                <details className="d-inline ms-2" style={{ cursor: "pointer" }}>
                  <summary className="text-muted d-inline">details</summary>
                  <ul className="mb-0 mt-1 small fw-normal">
                    {issues.map((i) => (
                      <li key={`${i.sport}/${i.slug}`}>{i.sport} / {i.market}: {i.rule_a} × {i.rule_b}</li>
                    ))}
                  </ul>
                </details>
              </span>
        )}
      </div>

      {Object.entries(vocab.sports).map(([key, label]) => (
        <SportSection key={key} sportKey={key} sportLabel={label}
          exists={key in bySport} markets={bySport[key]}
          vocab={vocab} onChanged={reload}
          missingCount={missingBySport[key] ?? 0} />
      ))}

      {Object.keys(vocab.sports).length === 0 && (
        <p className="text-muted">No sports in data/sports.json yet.</p>
      )}
    </div>
  );
}
