import React, { useState } from "react";
import { api } from "../api/client.js";
import Modal from "./Modal.jsx";

/**
 * One market of one sport: the rules it defines, and which bookmaker settles by
 * which of them.
 *
 * Compatibility is deliberately not here. A pair of rules can span two markets —
 * 1X2 backed at one bookmaker against Double Chance at the other — so it lives
 * one level up, on the sport.
 */
export default function MarketSection({ sport, market, marketDef, bookmakers, rules, assignments, onChanged }) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [formData, setFormData] = useState({});
  const [error, setError] = useState("");

  const assignedSlugs = new Set(assignments.map((b) => b.bookmaker));
  const unassigned = Object.entries(bookmakers).filter(([slug]) => !assignedSlugs.has(slug));
  const ruleLabel = (slug) => rules.find((r) => r.name === slug)?.label ?? slug;
  // The oldest of the variants' dates: the assignment is only as verified as
  // its least recently checked half.
  const lastChecked = (bm) => bm.variants.map((v) => v.last_checked).filter(Boolean).sort()[0] ?? null;

  const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };

  // ── Rules ──

  const openRuleModal = (rule = null) => {
    setFormData(rule
      ? { name: rule.name, label: rule.label, description: rule.description }
      : { name: "", label: "", description: "" });
    setError("");
    setModal({ type: "rule", editing: rule });
  };

  const saveRule = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (modal.editing) {
        await api.updateRule(sport, market, modal.editing.name, { label: formData.label, description: formData.description });
      } else {
        await api.createRule(sport, market, formData);
      }
      setModal(null);
      onChanged();
    } catch (err) { setError(err.message); }
  };

  const deleteRule = async (name) => {
    if (!confirm(`Delete rule "${name}"? Compatibility entries using it are deleted too.`)) return;
    await api.deleteRule(sport, market, name);
    onChanged();
  };

  // ── Bookmaker assignments ──

  const openBmModal = (bm = null) => {
    setFormData(bm
      ? { bookmaker: bm.bookmaker, summary: bm.summary ?? "", variants: bm.variants.map((v) => ({ ...v })) }
      : { bookmaker: "", summary: "", variants: [{ case: "", rule: "" }] });
    setError("");
    setModal({ type: "bm", editing: bm });
  };

  // ── Variants ──
  //
  // A bookmaker usually settles a market one way, and then the case is left
  // empty and the file stays flat. Winamax's tennis retirement rule is the
  // other kind: one rule for ATP and WTA, another for everything below them,
  // and no way to tell which applies from the bet alone — so the case is
  // written out and shown wherever the verdict is.

  const setVariant = (i, patch) => setFormData((d) => ({
    ...d,
    variants: d.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)),
  }));

  const addVariant = () => setFormData((d) => ({ ...d, variants: [...d.variants, { case: "", rule: "" }] }));

  const removeVariant = (i) => setFormData((d) => ({ ...d, variants: d.variants.filter((_, j) => j !== i) }));

  const saveBm = async (e) => {
    e.preventDefault();
    setError("");
    // Dropping last_checked on an edited variant is what makes the server stamp
    // it: the assignment was just looked at, which is the whole point of the date.
    const payload = {
      summary: formData.variants.length > 1 ? formData.summary : "",
      variants: formData.variants.map((v) => ({ case: v.case, rule: v.rule })),
    };
    try {
      if (modal.editing) {
        await api.updateBookmakerRule(sport, market, modal.editing.bookmaker, payload);
      } else {
        await api.assignBookmaker(sport, market, { bookmaker: formData.bookmaker, ...payload });
      }
      setModal(null);
      onChanged();
    } catch (err) { setError(err.message); }
  };

  const removeBm = async (slug) => {
    if (!confirm(`Remove assignment for "${bookmakers[slug]?.display ?? slug}"?`)) return;
    await api.removeBookmaker(sport, market, slug);
    onChanged();
  };

  const deleteMarket = async () => {
    if (!confirm(`Delete market "${market}" and all its data?`)) return;
    await api.deleteMarket(sport, market);
    onChanged();
  };

  return (
    <div className="border-top">
      <div className="d-flex align-items-center px-3 py-2 bg-white"
        style={{ cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <span className="me-2 text-muted" style={{ fontSize: ".75rem", width: "1rem" }}>{open ? "▾" : "▸"}</span>
        <span className="fw-medium flex-grow-1">
          {marketDef?.label ?? market}
          <code className="text-muted small ms-2" style={{ fontSize: ".7rem" }}>{market}</code>
        </span>
        <span className="text-muted small me-3">
          {rules.length} rule{rules.length === 1 ? "" : "s"} · {assignments.length} bookmaker{assignments.length === 1 ? "" : "s"}
        </span>
        <button className="btn btn-sm btn-link text-danger p-0 ms-1"
          onClick={stop(deleteMarket)} title="Delete market">×</button>
      </div>

      {open && (
        <div className="px-4 py-3 bg-light">
          <div className="mb-3">
            <div className="d-flex align-items-center mb-2">
              <span className="text-uppercase fw-semibold small text-muted" style={{ letterSpacing: ".05em" }}>Rules</span>
              <button className="btn btn-sm btn-primary ms-auto" onClick={() => openRuleModal()}>+ Add Rule</button>
            </div>
            {rules.length === 0
              ? <p className="text-muted small mb-0">No rules yet.</p>
              : <div className="d-flex flex-column gap-1">
                  {rules.map((r) => (
                    <div key={r.name} className="d-flex align-items-start bg-white border rounded px-3 py-2">
                      <div className="flex-grow-1">
                        <span className="fw-medium">{r.label}</span>
                        <code className="text-muted small ms-2" style={{ fontSize: ".7rem" }}>{r.name}</code>
                        {r.description && <div className="text-muted small mt-1">{r.description}</div>}
                      </div>
                      <div className="d-flex gap-1 ms-2 flex-shrink-0">
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => openRuleModal(r)}>Edit</button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => deleteRule(r.name)}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>

          <div>
            <div className="d-flex align-items-center mb-2">
              <span className="text-uppercase fw-semibold small text-muted" style={{ letterSpacing: ".05em" }}>Bookmakers</span>
              {unassigned.length > 0 && rules.length > 0 && (
                <button className="btn btn-sm btn-primary ms-auto" onClick={() => openBmModal()}>+ Assign</button>
              )}
            </div>
            {assignments.length === 0
              ? <p className="text-muted small mb-0">No bookmakers assigned.</p>
              : <div className="d-flex flex-column gap-1">
                  {assignments.map((b) => (
                    <div key={b.bookmaker} className="d-flex align-items-start bg-white border rounded px-3 py-2">
                      <div className="flex-grow-1">
                        <span className="fw-medium">{bookmakers[b.bookmaker]?.display ?? b.bookmaker}</span>
                        {b.summary && <span className="text-muted small ms-2">{b.summary}</span>}
                        {b.variants.map((v, i) => (
                          <div key={i} className="text-muted small">
                            {v.case && <span className="badge bg-secondary me-2">{v.case}</span>}
                            → {ruleLabel(v.rule)}
                          </div>
                        ))}
                      </div>
                      <span className="text-muted small mx-3" title="Last checked">
                        {lastChecked(b)
                          ? new Date(lastChecked(b)).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
                          : <em>never checked</em>}
                      </span>
                      <div className="d-flex gap-1 flex-shrink-0">
                        <button className="btn btn-sm btn-outline-success" title="Mark as checked now"
                          onClick={async () => { await api.touchBookmakerCheck(sport, market, b.bookmaker); onChanged(); }}>✓</button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => openBmModal(b)}>Edit</button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => removeBm(b.bookmaker)}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      )}

      {modal?.type === "rule" && (
        <Modal title={modal.editing ? "Edit Rule" : `New Rule — ${marketDef?.label ?? market}`}
          onClose={() => setModal(null)} onSubmit={saveRule} error={error}>
          <div className="mb-3">
            <label className="form-label">Slug <span className="text-muted small">(lowercase, no spaces)</span></label>
            <input className="form-control" value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required pattern="[a-z0-9][a-z0-9_-]*" placeholder="e.g. walkover"
              disabled={!!modal.editing} autoFocus />
          </div>
          <div className="mb-3">
            <label className="form-label">Label</label>
            <input className="form-control" value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              required placeholder="Human-readable name" />
          </div>
          <div className="mb-0">
            <label className="form-label">Description</label>
            <textarea className="form-control" rows={3} value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="When and how this rule applies..." />
          </div>
        </Modal>
      )}

      {modal?.type === "bm" && (
        <Modal title={modal.editing ? "Edit Assignment" : `Assign Bookmaker — ${marketDef?.label ?? market}`}
          onClose={() => setModal(null)} onSubmit={saveBm} error={error}>
          <div className="mb-3">
            <label className="form-label">Bookmaker</label>
            <select className="form-select" value={formData.bookmaker}
              onChange={(e) => setFormData({ ...formData, bookmaker: e.target.value })}
              required disabled={!!modal.editing}>
              <option value="">— select —</option>
              {(modal.editing ? Object.entries(bookmakers) : unassigned).map(([slug, info]) => (
                <option key={slug} value={slug}>{info.display}</option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label">
              Rule{formData.variants?.length > 1 ? "s" : ""}
              {formData.variants?.length > 1 && (
                <span className="text-muted small ms-2">
                  the case says when each applies — it is shown in the tooltip on a search result
                </span>
              )}
            </label>
            <div className="d-flex flex-column gap-2">
              {(formData.variants ?? []).map((v, i) => (
                <div key={i} className="d-flex gap-2">
                  {formData.variants.length > 1 && (
                    <input className="form-control" style={{ maxWidth: "14rem" }} value={v.case}
                      onChange={(e) => setVariant(i, { case: e.target.value })}
                      required maxLength={80} placeholder="e.g. ATP · WTA · Grand Slam" />
                  )}
                  <select className="form-select" value={v.rule}
                    onChange={(e) => setVariant(i, { rule: e.target.value })} required>
                    <option value="">— select —</option>
                    {rules.map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}
                  </select>
                  {formData.variants.length > 1 && (
                    <button type="button" className="btn btn-outline-danger flex-shrink-0"
                      onClick={() => removeVariant(i)} title="Remove this case">×</button>
                  )}
                </div>
              ))}
            </div>
            {rules.length > (formData.variants?.length ?? 0) && (
              <button type="button" className="btn btn-sm btn-link px-0 mt-1" onClick={addVariant}>
                + Different rule for some competitions
              </button>
            )}
          </div>
          {formData.variants?.length > 1 && (
            <div className="mb-0">
              <label className="form-label">
                Summary <span className="text-muted small">(optional, heads the rules page)</span>
              </label>
              <input className="form-control" value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                maxLength={80} placeholder="e.g. Depends on the tournament tier" />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
