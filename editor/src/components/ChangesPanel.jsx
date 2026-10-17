import React, { useEffect, useState } from "react";
import { local } from "../api/client.js";
import { issueBody, issueTitle, issueUrl, MAX_URL } from "../api/issue.js";
import Modal from "./Modal.jsx";

const BADGE = { added: "bg-success", modified: "bg-primary", deleted: "bg-danger" };

/**
 * The Pages build's footer: what this browser changed, and the way to hand it
 * in. Nothing here is written anywhere but localStorage — the issue is the
 * submission, and a maintainer applies it to the repository.
 */
export default function ChangesPanel({ onDiscarded }) {
  const [ctx, setCtx] = useState(null);
  const [, rerender] = useState(0);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let off = () => {};
    local.then((c) => {
      setCtx(c);
      off = c.store.subscribe(() => rerender((n) => n + 1));
    });
    return () => off();
  }, []);

  const changes = ctx?.store.changes() ?? [];
  const emptyDirs = ctx?.store.emptyDirs() ?? [];
  const paths = [...changes.map((c) => c.path), ...emptyDirs];

  if (!ctx) return null;

  const body = issueBody({ changes, emptyDirs, notes, commit: ctx.commit, pageUrl: location.href.split("#")[0] });

  const openModal = () => {
    setTitle(issueTitle(paths));
    setCopied("");
    setOpen(true);
  };

  const discard = () => {
    if (!confirm("Discard all your changes? This cannot be undone.")) return;
    ctx.store.discard();
    onDiscarded();
  };

  // A long issue does not fit in a URL. Then the body goes to the clipboard and
  // the issue opens with a placeholder for pasting it, rather than truncated.
  const submit = async (e) => {
    e.preventDefault();
    let url = issueUrl(ctx.repo, title, body);
    if (url.length > MAX_URL) {
      await navigator.clipboard.writeText(body);
      url = issueUrl(ctx.repo, title, "<!-- The changes were copied to your clipboard: paste them here. -->\n");
      setCopied("The changes were too long for a link and were copied to your clipboard — paste them into the issue.");
    }
    window.open(url, "_blank", "noopener");
  };

  const copy = async () => {
    await navigator.clipboard.writeText(body);
    setCopied("Copied to clipboard.");
  };

  return (
    <>
      <div className="position-sticky bottom-0 bg-white border rounded shadow-sm px-3 py-2 mt-3 d-flex align-items-center gap-2">
        {paths.length === 0
          ? <span className="text-muted small flex-grow-1">No changes yet — edit anything above, then submit it as a GitHub issue.</span>
          : <span className="small fw-semibold flex-grow-1">{paths.length} pending change{paths.length === 1 ? "" : "s"} in this browser</span>}
        <button className="btn btn-sm btn-outline-danger" onClick={discard} disabled={paths.length === 0}>Discard</button>
        <button className="btn btn-sm btn-success" onClick={openModal} disabled={paths.length === 0}>Create GitHub Issue…</button>
      </div>

      {open && (
        <Modal title="Submit changes as a GitHub issue" size="modal-lg" submitLabel="Open issue on GitHub ↗"
          actions={<button type="button" className="btn btn-outline-primary" onClick={copy}>Copy changes</button>}
          onClose={() => setOpen(false)} onSubmit={submit}>
          <div className="mb-3">
            <label className="form-label small fw-semibold">Title</label>
            <input className="form-control form-control-sm" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="mb-3">
            <label className="form-label small fw-semibold">Source / notes</label>
            <textarea className="form-control form-control-sm" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Link to the bookmaker's terms, the section the rule is in, anything a reviewer should know." />
          </div>

          <div className="mb-2 small fw-semibold">Changes</div>
          <ul className="list-unstyled small mb-3">
            {changes.map((c) => (
              <li key={c.path} className="mb-1">
                <span className={`badge ${BADGE[c.status]} me-2`}>{c.status}</span>
                <code>data/{c.path}</code>
              </li>
            ))}
            {emptyDirs.map((d) => (
              <li key={d} className="mb-1"><span className="badge bg-secondary me-2">empty dir</span><code>data/{d}/</code></li>
            ))}
          </ul>

          <details>
            <summary className="small text-muted" style={{ cursor: "pointer" }}>Preview issue body</summary>
            <pre className="bg-light border rounded p-2 mt-2 small" style={{ maxHeight: 300, whiteSpace: "pre-wrap" }}>{body}</pre>
          </details>

          {copied && <div className="small text-success mt-3">{copied}</div>}
          <div className="form-text">
            Opens a prefilled issue on <code>{ctx.repo}</code>, which needs a GitHub account. Without one, copy the changes
            and send them to us another way. Your changes stay here until you discard them.
          </div>
        </Modal>
      )}
    </>
  );
}
