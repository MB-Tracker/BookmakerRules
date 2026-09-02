import React, { useState } from "react";
import { api } from "../api/client.js";
import Modal from "./Modal.jsx";
import { LEVELS, LEVEL_LABEL, LEVEL_HINT } from "./levels.js";

/**
 * One rule pair, and the cases that make it precise.
 *
 * A pair on its own can only say "it depends" — Winamax counting overtime goals
 * against bwin counting regular time is fine if the Winamax leg is Over and a
 * double loss if it is Under. A case pins that down: it names what the bet on
 * side A and/or side B has to look like, and gives the level for that shape.
 * The first matching case wins; the top-level level is what applies when none
 * of them do.
 *
 * Side A is always the alphabetically first "<MARKET>__<rule>" of the pair. The
 * filename is built from that, so the binding does not depend on which side the
 * user happened to fill in first — and $A / $B in a description follow it.
 */

const emptySelector = () => ({ outcomes: [], side: "", line: { sign: "", abs_min: "", abs_max: "", in: "" } });

const emptyCase = () => ({ a: emptySelector(), b: emptySelector(), level: "compatible", description: "" });

const sideKey = (market, rule) => `${market}__${rule}`;

/** Selectors are stored with blanks for "unconstrained"; strip them for the wire. */
function packSelector(sel) {
  const out = {};
  if (sel.outcomes.length > 0) out.outcomes = [...sel.outcomes];
  if (sel.side) out.side = sel.side;

  const line = {};
  if (sel.line.sign) line.sign = sel.line.sign;
  if (sel.line.abs_min !== "") line.abs_min = Number(sel.line.abs_min);
  if (sel.line.abs_max !== "") line.abs_max = Number(sel.line.abs_max);
  if (sel.line.in.trim() !== "") {
    line.in = sel.line.in.split(",").map((v) => Number(v.trim())).filter((v) => !Number.isNaN(v));
  }
  if (Object.keys(line).length > 0) out.line = line;

  return Object.keys(out).length > 0 ? out : null;
}

function unpackSelector(sel) {
  const base = emptySelector();
  if (!sel) return base;
  return {
    outcomes: sel.outcomes ?? [],
    side: sel.side ?? "",
    line: {
      sign: sel.line?.sign ?? "",
      abs_min: sel.line?.abs_min ?? "",
      abs_max: sel.line?.abs_max ?? "",
      in: (sel.line?.in ?? []).join(", "),
    },
  };
}

function SelectorEditor({ title, market, marketDef, value, onChange }) {
  const outcomes = marketDef?.outcomes ?? [];
  const toggle = (o) => {
    const next = value.outcomes.includes(o)
      ? value.outcomes.filter((x) => x !== o)
      : [...value.outcomes, o];
    onChange({ ...value, outcomes: next });
  };
  const setLine = (patch) => onChange({ ...value, line: { ...value.line, ...patch } });

  return (
    <div className="border rounded p-2 h-100">
      <div className="small fw-semibold mb-1">
        {title} <code className="text-muted" style={{ fontSize: ".7rem" }}>{market}</code>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-2">
        {outcomes.map((o) => (
          <button key={o} type="button"
            className={`btn btn-sm ${value.outcomes.includes(o) ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => toggle(o)}>{o}</button>
        ))}
      </div>
      <div className="form-text mb-2">
        {value.outcomes.length === 0 ? "Any outcome." : `Only ${value.outcomes.join(", ")}.`}
      </div>

      <select className="form-select form-select-sm mb-2" value={value.side}
        onChange={(e) => onChange({ ...value, side: e.target.value })}>
        <option value="">Backed or laid</option>
        <option value="BACK">Backed only</option>
        <option value="LAY">Laid only (exchange)</option>
      </select>

      {marketDef?.has_line && (
        <div className="row g-1">
          <div className="col-12">
            <select className="form-select form-select-sm" value={value.line.sign}
              onChange={(e) => setLine({ sign: e.target.value })}>
              <option value="">Any line</option>
              <option value="positive">Positive line</option>
              <option value="negative">Negative line</option>
              <option value="zero">Line of 0</option>
            </select>
          </div>
          <div className="col-6">
            <input className="form-control form-control-sm" type="number" step="0.25" placeholder="|line| ≥"
              value={value.line.abs_min} onChange={(e) => setLine({ abs_min: e.target.value })} />
          </div>
          <div className="col-6">
            <input className="form-control form-control-sm" type="number" step="0.25" placeholder="|line| ≤"
              value={value.line.abs_max} onChange={(e) => setLine({ abs_max: e.target.value })} />
          </div>
          <div className="col-12">
            <input className="form-control form-control-sm" placeholder="exact lines, e.g. -0.5, 0, 0.5"
              value={value.line.in} onChange={(e) => setLine({ in: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function CompatibilityModal({ sport, entry, prefill, marketsData, onClose, onSaved }) {
  const initial = entry ?? prefill;
  // Normalised up front, so "side A" in the form is the same side A the
  // filename, the stored selectors and the $A placeholder mean. A prefill
  // arrives in whatever order the pair was listed in.
  const [first, second] = [
    { market: initial.market_a, rule: initial.rule_a },
    { market: initial.market_b, rule: initial.rule_b },
  ].sort((x, y) => (sideKey(x.market, x.rule) < sideKey(y.market, y.rule) ? -1 : 1));

  const [form, setForm] = useState({
    market_a: first.market,
    rule_a: first.rule,
    market_b: second.market,
    rule_b: second.rule,
    level: entry?.level ?? "compatible",
    description: entry?.description ?? "",
    cases: (entry?.cases ?? []).map((c) => ({
      a: unpackSelector(c.when?.a),
      b: unpackSelector(c.when?.b),
      level: c.level,
      description: c.description ?? "",
    })),
  });
  const [error, setError] = useState("");

  const defA = marketsData[form.market_a]?.def;
  const defB = marketsData[form.market_b]?.def;
  const ruleLabel = (market, rule) =>
    marketsData[market]?.rules.find((r) => r.name === rule)?.label ?? rule;

  const patchCase = (i, patch) =>
    setForm({ ...form, cases: form.cases.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const moveCase = (i, delta) => {
    const next = [...form.cases];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setForm({ ...form, cases: next });
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");

    const cases = [];
    for (const [i, c] of form.cases.entries()) {
      const when = {};
      const a = packSelector(c.a);
      const b = packSelector(c.b);
      if (a) when.a = a;
      if (b) when.b = b;
      if (Object.keys(when).length === 0) {
        setError(`Case ${i + 1} has no condition. A case that matches everything is what the default level already is.`);
        return;
      }
      cases.push({ when, level: c.level, description: c.description });
    }

    const payload = {
      market_a: form.market_a, rule_a: form.rule_a,
      market_b: form.market_b, rule_b: form.rule_b,
      level: form.level, description: form.description, cases,
    };

    try {
      if (entry) await api.updateCompatibility(sport, entry.slug, payload);
      else await api.createCompatibility(sport, payload);
      onSaved();
    } catch (err) { setError(err.message); }
  };

  const sides = [
    { market: form.market_a, rule: form.rule_a },
    { market: form.market_b, rule: form.rule_b },
  ];

  return (
    <Modal title={entry ? "Edit Compatibility" : "Define Compatibility"} size="modal-lg"
      onClose={onClose} onSubmit={save} error={error}>
      <div className="alert alert-light border small mb-3">
        <div><strong>A</strong> = {ruleLabel(sides[0].market, sides[0].rule)} <code className="ms-1">{sideKey(sides[0].market, sides[0].rule)}</code></div>
        <div><strong>B</strong> = {ruleLabel(sides[1].market, sides[1].rule)} <code className="ms-1">{sideKey(sides[1].market, sides[1].rule)}</code></div>
        <div className="text-muted mt-1">
          Write <code>$A</code> and <code>$B</code> in a description to name the bookmaker on that side.
        </div>
      </div>

      <div className="mb-3">
        <label className="form-label">Default level</label>
        <select className="form-select" value={form.level}
          onChange={(e) => setForm({ ...form, level: e.target.value })}>
          {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
        </select>
        <div className="form-text">{LEVEL_HINT[form.level]}</div>
      </div>

      <div className="mb-4">
        <label className="form-label">Default description</label>
        <textarea className="form-control" rows={2} value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="How these two rules interact when no case below applies..." />
      </div>

      <div className="d-flex align-items-center mb-2">
        <span className="text-uppercase fw-semibold small text-muted" style={{ letterSpacing: ".05em" }}>
          Cases <span className="text-lowercase fw-normal">— first match wins</span>
        </span>
        <button type="button" className="btn btn-sm btn-outline-primary ms-auto"
          onClick={() => setForm({ ...form, cases: [...form.cases, emptyCase()] })}>+ Add Case</button>
      </div>

      {form.cases.length === 0 && (
        <p className="text-muted small">
          No cases — every bet on this pair gets the default level above.
        </p>
      )}

      <div className="d-flex flex-column gap-3">
        {form.cases.map((c, i) => (
          <div key={i} className="border rounded p-3 bg-light">
            <div className="d-flex align-items-center gap-2 mb-2">
              <span className="badge bg-secondary">{i + 1}</span>
              <select className="form-select form-select-sm w-auto" value={c.level}
                onChange={(e) => patchCase(i, { level: e.target.value })}>
                {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
              </select>
              <div className="ms-auto d-flex gap-1">
                <button type="button" className="btn btn-sm btn-outline-secondary"
                  onClick={() => moveCase(i, -1)} disabled={i === 0}>↑</button>
                <button type="button" className="btn btn-sm btn-outline-secondary"
                  onClick={() => moveCase(i, 1)} disabled={i === form.cases.length - 1}>↓</button>
                <button type="button" className="btn btn-sm btn-outline-danger"
                  onClick={() => setForm({ ...form, cases: form.cases.filter((_, j) => j !== i) })}>×</button>
              </div>
            </div>

            <div className="row g-2 mb-2">
              <div className="col-md-6">
                <SelectorEditor title="Side A" market={form.market_a} marketDef={defA}
                  value={c.a} onChange={(v) => patchCase(i, { a: v })} />
              </div>
              <div className="col-md-6">
                <SelectorEditor title="Side B" market={form.market_b} marketDef={defB}
                  value={c.b} onChange={(v) => patchCase(i, { b: v })} />
              </div>
            </div>

            <textarea className="form-control form-control-sm" rows={2} value={c.description}
              onChange={(e) => patchCase(i, { description: e.target.value })}
              placeholder="What happens in this case, ideally with a concrete example..." />
          </div>
        ))}
      </div>
    </Modal>
  );
}
