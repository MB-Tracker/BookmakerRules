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
    setFormData(bm ? { bookmaker: bm.bookmaker, rule: bm.rule } : { bookmaker: "", rule: "" });
    setError("");
    setModal({ type: "bm", editing: bm });
  };

  const saveBm = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (modal.editing) {
        await api.updateBookmakerRule(sport, market, modal.editing.bookmaker, { rule: formData.rule });
      } else {
        await api.assignBookmaker(sport, market, formData);
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
                    <div key={b.bookmaker} className="d-flex align-items-center bg-white border rounded px-3 py-2">
                      <span className="fw-medium flex-grow-1">{bookmakers[b.bookmaker]?.display ?? b.bookmaker}</span>
                      <span className="text-muted small me-3">→ {ruleLabel(b.rule)}</span>
                      <span className="text-muted small me-3" title="Last checked">
                        {b.last_checked
                          ? new Date(b.last_checked).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
                          : <em>never checked</em>}
                      </span>
                      <div className="d-flex gap-1">
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
          <div className="mb-0">
            <label className="form-label">Rule</label>
            <select className="form-select" value={formData.rule}
              onChange={(e) => setFormData({ ...formData, rule: e.target.value })} required>
              <option value="">— select —</option>
              {rules.map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}
            </select>
          </div>
        </Modal>
      )}
    </div>
  );
}
