import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api/client.js";

// ── Shared modal shell ────────────────────────────────────────────────────────

function Modal({ title, onClose, onSubmit, submitLabel = "Save", children, error }) {
  return (
    <div className="modal show d-block" style={{ background: "rgba(0,0,0,.45)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content shadow">
          <form onSubmit={onSubmit}>
            <div className="modal-header border-0 pb-0">
              <h5 className="modal-title">{title}</h5>
              <button type="button" className="btn-close" onClick={onClose} />
            </div>
            <div className="modal-body pt-2">
              {error && <div className="alert alert-danger py-2 small mb-3">{error}</div>}
              {children}
            </div>
            <div className="modal-footer border-0 pt-0">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary">{submitLabel}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Colours ───────────────────────────────────────────────────────────────────

const COMPAT_LEVEL_CLASS = {
  compatible:   "alert-success",
  partial:      "alert-warning",
  incompatible: "alert-danger",
};

// ── Market section ────────────────────────────────────────────────────────────

function MarketSection({ sport, market, aliases, onDeleted, onIssueCount, checkMissing }) {
  const [open, setOpen]             = useState(false);
  const [rules, setRules]           = useState([]);
  const [bookmakers, setBookmakers] = useState([]);
  const [compat, setCompat]         = useState([]);
  const [modal, setModal]           = useState(null); // {type, payload}
  const [formData, setFormData]     = useState({});
  const [error, setError]           = useState("");

  const loadAll = useCallback(() => {
    if (!open) return;
    Promise.all([
      api.getRules(sport, market),
      api.getMarketBookmakers(sport, market),
      api.getCompatibility(sport, market),
    ]).then(([r, b, c]) => { setRules(r); setBookmakers(b); setCompat(c); });
  }, [sport, market, open]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Compute all rule pairs and which are missing compatibility
  const allPairs = useMemo(() => {
    const pairs = [];
    for (let i = 0; i < rules.length; i++)
      for (let j = i + 1; j < rules.length; j++)
        pairs.push([rules[i], rules[j]]);
    return pairs;
  }, [rules]);

  const pairKey = (a, b) => [a, b].sort().join("+");

  const compatMap = useMemo(() => {
    const m = {};
    for (const c of compat) m[pairKey(c.rule_a, c.rule_b)] = c;
    return m;
  }, [compat]);

  const missingCount = allPairs.filter(([a, b]) => !compatMap[pairKey(a.name, b.name)]).length;

  useEffect(() => { onIssueCount(market, missingCount); }, [market, missingCount, onIssueCount]);

  const toggle = () => setOpen((v) => !v);
  const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };

  // ── Rule CRUD ──

  const openRuleModal = (rule = null) => {
    setFormData(rule ? { name: rule.name, label: rule.label, description: rule.description } : { name: "", label: "", description: "" });
    setError("");
    setModal({ type: "rule", editing: rule });
  };

  const saveRule = async (e) => {
    e.preventDefault(); setError("");
    try {
      if (modal.editing) {
        await api.updateRule(sport, market, modal.editing.name, { label: formData.label, description: formData.description });
      } else {
        await api.createRule(sport, market, formData);
      }
      loadAll(); setModal(null);
    } catch (err) { setError(err.message); }
  };

  const deleteRule = async (name) => {
    if (!confirm(`Delete rule "${name}"?`)) return;
    await api.deleteRule(sport, market, name);
    loadAll();
  };

  // ── Bookmaker CRUD ──

  const assignedSlugs = new Set(bookmakers.map((b) => b.bookmaker));
  const unassigned = Object.entries(aliases).filter(([slug]) => !assignedSlugs.has(slug));

  const openBmModal = (bm = null) => {
    setFormData(bm ? { bookmaker: bm.bookmaker, rule: bm.rule } : { bookmaker: "", rule: "" });
    setError("");
    setModal({ type: "bm", editing: bm });
  };

  const saveBm = async (e) => {
    e.preventDefault(); setError("");
    try {
      if (modal.editing) {
        await api.updateBookmakerRule(sport, market, modal.editing.bookmaker, { rule: formData.rule });
      } else {
        await api.assignBookmaker(sport, market, formData);
      }
      loadAll(); setModal(null);
    } catch (err) { setError(err.message); }
  };

  const removeBm = async (slug) => {
    if (!confirm(`Remove assignment for "${aliases[slug]?.display ?? slug}"?`)) return;
    await api.removeBookmaker(sport, market, slug);
    loadAll();
  };

  // ── Compat CRUD ──

  const openCompatModal = (pair = null, prefill = null) => {
    setFormData(prefill ?? (pair ? { rule_a: pair.rule_a, rule_b: pair.rule_b, level: pair.level, description: pair.description } : { rule_a: "", rule_b: "", level: "compatible", description: "" }));
    setError("");
    setModal({ type: "compat", editing: pair });
  };

  const saveCompat = async (e) => {
    e.preventDefault(); setError("");
    try {
      if (modal.editing) {
        await api.updateCompatibility(sport, market, pairKey(formData.rule_a, formData.rule_b), { level: formData.level, description: formData.description });
      } else {
        await api.createCompatibility(sport, market, formData);
      }
      loadAll(); setModal(null);
    } catch (err) { setError(err.message); }
  };

  const deleteCompat = async (ra, rb) => {
    if (!confirm("Delete this compatibility entry?")) return;
    await api.deleteCompatibility(sport, market, pairKey(ra, rb));
    loadAll();
  };

  const ruleLabel = (slug) => rules.find((r) => r.name === slug)?.label ?? slug;

  const deleteMarket = async () => {
    if (!confirm(`Delete market "${market}" and all its data?`)) return;
    await api.deleteMarket(sport, market);
    onDeleted();
  };

  return (
    <div className="border-top">
      {/* Market header — full row clickable */}
      <div className="d-flex align-items-center px-3 py-2 bg-white"
        style={{ cursor: "pointer" }} onClick={toggle}>
        <span className="me-2 text-muted" style={{ fontSize: ".75rem", width: "1rem" }}>
          {open ? "▾" : "▸"}
        </span>
        <span className="fw-medium flex-grow-1">{market}</span>
        {(open ? missingCount : (checkMissing ?? 0)) > 0 && (
          <span className="badge bg-warning text-dark me-2"
            title={`${open ? missingCount : checkMissing} missing compatibility entr${(open ? missingCount : checkMissing) > 1 ? "ies" : "y"}`}>
            ⚠ {open ? missingCount : checkMissing}
          </span>
        )}
        {(open ? (missingCount === 0 && rules.length >= 2) : checkMissing === 0) && (
          <span className="badge bg-success me-2">✓</span>
        )}
        <button className="btn btn-sm btn-link text-danger p-0 ms-1"
          onClick={stop(() => deleteMarket())} title="Delete market">×</button>
      </div>

      {open && (
        <div className="px-4 py-3 bg-light">

          {/* Rules */}
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
                        {r.description && <span className="text-muted small ms-2">{r.description}</span>}
                        <code className="text-muted small ms-2" style={{ fontSize: ".7rem" }}>{r.name}</code>
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

          {/* Bookmakers */}
          <div className="mb-3">
            <div className="d-flex align-items-center mb-2">
              <span className="text-uppercase fw-semibold small text-muted" style={{ letterSpacing: ".05em" }}>Bookmakers</span>
              {unassigned.length > 0 && (
                <button className="btn btn-sm btn-primary ms-auto" onClick={() => openBmModal()}>+ Assign</button>
              )}
            </div>
            {bookmakers.length === 0
              ? <p className="text-muted small mb-0">No bookmakers assigned.</p>
              : <div className="d-flex flex-column gap-1">
                  {bookmakers.map((b) => (
                    <div key={b.bookmaker} className="d-flex align-items-center bg-white border rounded px-3 py-2">
                      <span className="fw-medium flex-grow-1">{aliases[b.bookmaker]?.display ?? b.bookmaker}</span>
                      <span className="text-muted small me-3">→ {ruleLabel(b.rule)}</span>
                      <span className="text-muted small me-3" title="Last checked">
                        {b.last_checked
                          ? new Date(b.last_checked).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
                          : <em>never checked</em>}
                      </span>
                      <div className="d-flex gap-1">
                        <button className="btn btn-sm btn-outline-success" title="Mark as checked now"
                          onClick={async () => { await api.touchBookmakerCheck(sport, market, b.bookmaker); loadAll(); }}>✓</button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => openBmModal(b)}>Edit</button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => removeBm(b.bookmaker)}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>

          {/* Compatibility — show all pairs */}
          {allPairs.length > 0 && (
            <div>
              <span className="text-uppercase fw-semibold small text-muted" style={{ letterSpacing: ".05em" }}>
                Compatibility
              </span>
              <div className="d-flex flex-column gap-1 mt-2">
                {allPairs.map(([ra, rb]) => {
                  const key = pairKey(ra.name, rb.name);
                  const entry = compatMap[key];
                  return (
                    <div key={key}
                      className={`alert py-2 mb-0 d-flex align-items-center gap-3 ${entry ? COMPAT_LEVEL_CLASS[entry.level] : "alert-warning border-warning"}`}>
                      <span className="fw-medium">
                        {ra.label} <span className="opacity-50 mx-1">×</span> {rb.label}
                      </span>
                      {entry ? (
                        <>
                          <span className="badge bg-white text-dark border">{entry.level}</span>
                          {entry.description && <span className="small flex-grow-1">{entry.description}</span>}
                          <div className="d-flex gap-1 ms-auto flex-shrink-0">
                            <button className="btn btn-sm btn-outline-secondary"
                              onClick={() => openCompatModal(entry)}>Edit</button>
                            <button className="btn btn-sm btn-outline-danger"
                              onClick={() => deleteCompat(ra.name, rb.name)}>×</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="small flex-grow-1 text-muted fst-italic">Not defined</span>
                          <button className="btn btn-sm btn-warning ms-auto"
                            onClick={() => openCompatModal(null, { rule_a: ra.name, rule_b: rb.name, level: "compatible", description: "" })}>
                            Define
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Modals */}
      {modal?.type === "rule" && (
        <Modal title={modal.editing ? "Edit Rule" : `New Rule — ${market}`}
          onClose={() => setModal(null)} onSubmit={saveRule} error={error}>
          <div className="mb-3">
            <label className="form-label">Slug <span className="text-muted small">(lowercase, no spaces)</span></label>
            <input className="form-control" value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required pattern="[a-z0-9_-]+" placeholder="e.g. walkover"
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
        <Modal title={modal.editing ? "Edit Assignment" : `Assign Bookmaker — ${market}`}
          onClose={() => setModal(null)} onSubmit={saveBm} error={error}>
          <div className="mb-3">
            <label className="form-label">Bookmaker</label>
            <select className="form-select" value={formData.bookmaker}
              onChange={(e) => setFormData({ ...formData, bookmaker: e.target.value })}
              required disabled={!!modal.editing}>
              <option value="">— select —</option>
              {(modal.editing
                ? Object.entries(aliases)
                : unassigned
              ).map(([slug, info]) => (
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
            {rules.length === 0 && <div className="form-text text-warning">Add rules first.</div>}
          </div>
        </Modal>
      )}

      {modal?.type === "compat" && (
        <Modal title={modal.editing ? "Edit Compatibility" : "Define Compatibility"}
          onClose={() => setModal(null)} onSubmit={saveCompat} error={error}>
          <div className="row g-3 mb-3">
            <div className="col-6">
              <label className="form-label">Rule A</label>
              <select className="form-select" value={formData.rule_a}
                onChange={(e) => setFormData({ ...formData, rule_a: e.target.value })}
                required disabled={!!modal.editing || !!formData.rule_a}>
                <option value="">— select —</option>
                {rules.map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}
              </select>
            </div>
            <div className="col-6">
              <label className="form-label">Rule B</label>
              <select className="form-select" value={formData.rule_b}
                onChange={(e) => setFormData({ ...formData, rule_b: e.target.value })}
                required disabled={!!modal.editing || !!formData.rule_b}>
                <option value="">— select —</option>
                {rules.map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="form-label">Level</label>
            <div className="d-flex gap-3">
              {["compatible", "partial", "incompatible"].map((l) => (
                <div key={l} className="form-check">
                  <input className="form-check-input" type="radio" id={`lvl-${l}`}
                    name="compat-level" value={l} checked={formData.level === l}
                    onChange={() => setFormData({ ...formData, level: l })} />
                  <label className="form-check-label" htmlFor={`lvl-${l}`}>{l}</label>
                </div>
              ))}
            </div>
          </div>
          <div className="mb-0">
            <label className="form-label">Description</label>
            <textarea className="form-control" rows={2} value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="How these two rules interact..." />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Sport section ─────────────────────────────────────────────────────────────

function SportSection({ sportName, sportId, exists, aliases, onCreated, checkData = {} }) {
  const [open, setOpen]                   = useState(false);
  const [markets, setMarkets]             = useState([]);
  const [marketIssues, setMarketIssues]   = useState({});
  const [newMarket, setNewMarket]         = useState("");
  const [error, setError]                 = useState("");

  const loadMarkets = useCallback(() => {
    if (!exists || !open) return;
    api.getSports().then((sports) => {
      const s = sports.find((s) => s.name === sportName);
      setMarkets(s ? s.markets : []);
    });
  }, [sportName, exists, open]);

  useEffect(() => { loadMarkets(); }, [loadMarkets]);

  const handleIssueCount = useCallback((market, count) => {
    setMarketIssues((prev) => ({ ...prev, [market]: count }));
  }, []);

  const liveIssues  = Object.values(marketIssues).reduce((s, n) => s + n, 0);
  const checkTotal  = Object.values(checkData).reduce((s, n) => s + n, 0);
  const totalIssues = open ? liveIssues : checkTotal;

  const toggle = () => { if (exists) setOpen((v) => !v); };
  const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };

  const create = async (e) => {
    e.stopPropagation();
    try { await api.createSport(sportName); onCreated(); } catch (err) { setError(err.message); }
  };

  const addMarket = async (e) => {
    e.preventDefault();
    const name = newMarket.trim();
    if (!name) return;
    try {
      await api.createMarket(sportName, name);
      setNewMarket("");
      loadMarkets();
    } catch (err) { setError(err.message); }
  };

  return (
    <div className={`border rounded overflow-hidden mb-2 ${!exists ? "opacity-50" : ""}`}>
      <div className={`d-flex align-items-center px-3 py-2 bg-white ${exists ? "" : "bg-light"}`}
        style={{ cursor: exists ? "pointer" : "default" }} onClick={toggle}>
        <span className="me-2 text-muted" style={{ fontSize: ".75rem", width: "1rem" }}>
          {exists ? (open ? "▾" : "▸") : ""}
        </span>
        <span className="fw-semibold flex-grow-1">{sportName}</span>
        <span className="badge bg-light text-secondary border me-2" style={{ fontSize: ".7rem" }}>{sportId}</span>
        {exists && totalIssues > 0 && (
          <span className="badge bg-warning text-dark me-2">⚠ {totalIssues}</span>
        )}
        {exists && totalIssues === 0 && (open ? markets.length > 0 : Object.keys(checkData).length > 0) && (
          <span className="badge bg-success me-2">✓</span>
        )}
        {!exists && (
          <button className="btn btn-sm btn-outline-primary" onClick={stop(create)}>Add</button>
        )}
      </div>

      {exists && open && (
        <div className="border-top">
          {markets.length === 0
            ? <p className="text-muted small px-3 py-2 mb-0">No markets yet.</p>
            : markets.map((m) => (
                <MarketSection key={m} sport={sportName} market={m} aliases={aliases}
                  onDeleted={loadMarkets} onIssueCount={handleIssueCount}
                  checkMissing={checkData[m]} />
              ))
          }
          <div className="px-3 py-2 bg-white border-top">
            {error && <div className="alert alert-danger py-1 small mb-2">{error}</div>}
            <form className="d-flex gap-2" onSubmit={addMarket}>
              <input className="form-control form-control-sm w-auto" placeholder="New market name"
                value={newMarket} onChange={(e) => setNewMarket(e.target.value)} required />
              <button type="submit" className="btn btn-sm btn-outline-primary">Add Market</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function SportsMarketsTab() {
  const [sports, setSports]         = useState([]);
  const [sportMapping, setSportMapping] = useState({});
  const [aliases, setAliases]       = useState({});
  const [tick, setTick]             = useState(0);
  const [checking, setChecking]     = useState(false);
  const [checkResult, setCheckResult] = useState(null);

  const reload = () => setTick((n) => n + 1);

  useEffect(() => {
    Promise.all([api.getSports(), api.getSportMapping(), api.getBookmakerAliases()])
      .then(([s, m, a]) => { setSports(s); setSportMapping(m); setAliases(a); });
  }, [tick]);

  const checkAll = useCallback(async () => {
    setChecking(true);
    setCheckResult(null);
    const allSports = await api.getSports();
    const issues = [];
    for (const sport of allSports) {
      for (const market of sport.markets) {
        const [rules, compat] = await Promise.all([
          api.getRules(sport.name, market),
          api.getCompatibility(sport.name, market),
        ]);
        const compatKeys = new Set(compat.map((c) => [c.rule_a, c.rule_b].sort().join("+")));
        const missing = [];
        for (let i = 0; i < rules.length; i++)
          for (let j = i + 1; j < rules.length; j++)
            if (!compatKeys.has([rules[i].name, rules[j].name].sort().join("+")))
              missing.push([rules[i].label, rules[j].label]);
        if (missing.length > 0)
          issues.push({ sport: sport.name, market, missing });
      }
    }
    setCheckResult(issues);
    setChecking(false);
    return issues;
  }, []);

  // Exposed for integration tests.
  useEffect(() => { window.payoutRulesEditorCheck = checkAll; }, [checkAll]);

  // Auto-run on mount.
  useEffect(() => { checkAll(); }, [checkAll]);

  const checkMap = useMemo(() => {
    if (!checkResult) return {};
    const map = {};
    for (const { sport, market, missing } of checkResult) {
      if (!map[sport]) map[sport] = {};
      map[sport][market] = missing.length;
    }
    return map;
  }, [checkResult]);

  const existingNames = new Set(sports.map((s) => s.name));

  const totalMissing = checkResult ? checkResult.reduce((s, i) => s + i.missing.length, 0) : 0;

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={checkAll} disabled={checking}>
          {checking ? "Checking…" : "Check All"}
        </button>
        {checkResult !== null && (
          totalMissing === 0
            ? <span className="badge bg-success">All compatibility defined</span>
            : <span className="text-warning small fw-semibold">
                ⚠ {totalMissing} missing entr{totalMissing > 1 ? "ies" : "y"} across {checkResult.length} market{checkResult.length > 1 ? "s" : ""}
                <details className="d-inline ms-2" style={{ cursor: "pointer" }}>
                  <summary className="text-muted d-inline">details</summary>
                  <ul className="mb-0 mt-1 small fw-normal">
                    {checkResult.map((i) => i.missing.map(([a, b]) => (
                      <li key={`${i.sport}/${i.market}/${a}/${b}`}>{i.sport} / {i.market}: {a} × {b}</li>
                    )))}
                  </ul>
                </details>
              </span>
        )}
      </div>
      {Object.entries(sportMapping).map(([id, dirName]) => (
        <SportSection key={id} sportId={id} sportName={dirName}
          exists={existingNames.has(dirName)} aliases={aliases} onCreated={reload}
          checkData={checkMap[dirName] ?? {}} />
      ))}
      {Object.keys(sportMapping).length === 0 && (
        <p className="text-muted">No sports in sport_mapping.json yet.</p>
      )}
    </div>
  );
}
