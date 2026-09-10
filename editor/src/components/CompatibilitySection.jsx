import React, { useMemo, useState } from "react";
import { api } from "../api/client.js";
import CompatibilityModal from "./CompatibilityModal.jsx";
import { LEVEL_CLASS, LEVEL_LABEL } from "./levels.js";

const sideKey = (market, rule) => `${market}__${rule}`;
const pairSlug = (ma, ra, mb, rb) => [sideKey(ma, ra), sideKey(mb, rb)].sort().join("+");

/**
 * Every rule pair of one sport, defined or not.
 *
 * "Not defined" is only flagged for pairs *within* one market between rules that
 * are actually assigned to a bookmaker — those are bets somebody can place
 * today. Cross-market pairs can be added from the button, but are not demanded:
 * which markets oppose each other is the matcher's model, not this repo's.
 */
export default function CompatibilitySection({ sport, marketsData, entries, onChanged }) {
  const [modal, setModal] = useState(null);

  const markets = Object.keys(marketsData).sort();

  const definedSlugs = useMemo(() => new Set(entries.map((e) => e.slug)), [entries]);

  const missing = useMemo(() => {
    const out = [];
    for (const market of markets) {
      // Every variant, not one per bookmaker: a bookmaker with a different rule
      // for ATP than for ITF is two bets somebody can place, and each of them
      // needs an entry against the other bookmaker's rule.
      const assigned = [...new Set(
        marketsData[market].assignments.flatMap((b) => b.variants.map((v) => v.rule))
      )].sort();
      for (let i = 0; i < assigned.length; i++) {
        for (let j = i + 1; j < assigned.length; j++) {
          const slug = pairSlug(market, assigned[i], market, assigned[j]);
          if (!definedSlugs.has(slug)) {
            out.push({ slug, market_a: market, rule_a: assigned[i], market_b: market, rule_b: assigned[j] });
          }
        }
      }
    }
    return out;
  }, [markets, marketsData, definedSlugs]);

  const ruleLabel = (market, rule) =>
    marketsData[market]?.rules.find((r) => r.name === rule)?.label ?? rule;
  const marketLabel = (market) => marketsData[market]?.def?.label ?? market;

  const sideText = (market, rule) => `${marketLabel(market)} · ${ruleLabel(market, rule)}`;

  const remove = async (slug) => {
    if (!confirm("Delete this compatibility entry?")) return;
    await api.deleteCompatibility(sport, slug);
    onChanged();
  };

  // Every rule of every market, so a cross-market pair can be started by hand.
  const allSides = markets.flatMap((m) => marketsData[m].rules.map((r) => ({ market: m, rule: r.name })));

  const [newA, setNewA] = useState("");
  const [newB, setNewB] = useState("");

  const startNew = () => {
    const [ma, ra] = newA.split("__");
    const [mb, rb] = newB.split("__");
    const slug = pairSlug(ma, ra, mb, rb);
    if (definedSlugs.has(slug)) return;
    setModal({ prefill: { market_a: ma, rule_a: ra, market_b: mb, rule_b: rb } });
  };

  return (
    <div className="px-3 py-3 bg-white border-top">
      <span className="text-uppercase fw-semibold small text-muted" style={{ letterSpacing: ".05em" }}>
        Compatibility
      </span>

      <div className="d-flex flex-column gap-2 mt-2">
        {missing.map((pair) => (
          <div key={pair.slug} className="alert alert-warning border-warning py-2 mb-0 d-flex align-items-center gap-3">
            <span className="fw-medium">
              {sideText(pair.market_a, pair.rule_a)}
              <span className="opacity-50 mx-2">×</span>
              {sideText(pair.market_b, pair.rule_b)}
            </span>
            <span className="small flex-grow-1 fst-italic">
              Not defined — both rules are assigned to bookmakers in this market.
            </span>
            <button className="btn btn-sm btn-warning flex-shrink-0" onClick={() => setModal({ prefill: pair })}>
              Define
            </button>
          </div>
        ))}

        {entries.map((entry) => (
          <div key={entry.slug} className={`alert py-2 mb-0 ${LEVEL_CLASS[entry.level] ?? "alert-secondary"}`}>
            <div className="d-flex align-items-center gap-3">
              <span className="fw-medium">
                {sideText(entry.market_a, entry.rule_a)}
                <span className="opacity-50 mx-2">×</span>
                {sideText(entry.market_b, entry.rule_b)}
              </span>
              <span className="badge bg-white text-dark border">{LEVEL_LABEL[entry.level] ?? entry.level}</span>
              {entry.cases?.length > 0 && (
                <span className="badge bg-white text-dark border">
                  {entry.cases.length} case{entry.cases.length === 1 ? "" : "s"}
                </span>
              )}
              <div className="d-flex gap-1 ms-auto flex-shrink-0">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setModal({ entry })}>Edit</button>
                <button className="btn btn-sm btn-outline-danger" onClick={() => remove(entry.slug)}>×</button>
              </div>
            </div>
            {entry.description && <div className="small mt-1" style={{ whiteSpace: "pre-wrap" }}>{entry.description}</div>}
            {entry.cases?.length > 0 && (
              <ol className="small mb-0 mt-2">
                {entry.cases.map((c, i) => (
                  <li key={i}>
                    <span className="fw-semibold">{LEVEL_LABEL[c.level] ?? c.level}</span>
                    {" — "}
                    {["a", "b"].filter((s) => c.when?.[s]).map((s) => {
                      const sel = c.when[s];
                      const bits = [];
                      if (sel.outcomes) bits.push(sel.outcomes.join("/"));
                      if (sel.side) bits.push(sel.side);
                      if (sel.line) bits.push(`line ${JSON.stringify(sel.line)}`);
                      return `${s.toUpperCase()}: ${bits.join(", ")}`;
                    }).join("  ·  ")}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}

        {entries.length === 0 && missing.length === 0 && (
          <p className="text-muted small mb-0">Nothing to compare yet.</p>
        )}
      </div>

      {allSides.length >= 2 && (
        <div className="d-flex gap-2 align-items-center mt-3">
          <select className="form-select form-select-sm w-auto" value={newA} onChange={(e) => setNewA(e.target.value)}>
            <option value="">— rule A —</option>
            {allSides.map((s) => (
              <option key={sideKey(s.market, s.rule)} value={sideKey(s.market, s.rule)}>{sideText(s.market, s.rule)}</option>
            ))}
          </select>
          <span className="text-muted">×</span>
          <select className="form-select form-select-sm w-auto" value={newB} onChange={(e) => setNewB(e.target.value)}>
            <option value="">— rule B —</option>
            {allSides.map((s) => (
              <option key={sideKey(s.market, s.rule)} value={sideKey(s.market, s.rule)}>{sideText(s.market, s.rule)}</option>
            ))}
          </select>
          <button className="btn btn-sm btn-outline-primary" disabled={!newA || !newB || newA === newB} onClick={startNew}>
            Define pair
          </button>
        </div>
      )}

      {modal && (
        <CompatibilityModal
          sport={sport}
          entry={modal.entry}
          prefill={modal.prefill}
          marketsData={marketsData}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onChanged(); }}
        />
      )}
    </div>
  );
}
