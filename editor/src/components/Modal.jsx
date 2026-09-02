import React, { useRef } from "react";

export default function Modal({ title, onClose, onSubmit, submitLabel = "Save", size = "", children, error }) {
  // A plain onClick on the backdrop also fires when a drag *ends* there — select
  // text in a textarea, release past the dialog edge, and the click's target is
  // the backdrop even though the press was inside. Only close when both halves
  // of the click landed on the backdrop itself.
  const pressedBackdrop = useRef(false);

  return (
    <div className="modal show d-block" style={{ background: "rgba(0,0,0,.45)" }}
      onMouseDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose();
        pressedBackdrop.current = false;
      }}>
      <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${size}`}>
        <div className="modal-content shadow">
          {/* modal-dialog-scrollable caps .modal-content and lets .modal-body
              scroll, but that only works while the body is a flex child of the
              content. The form sits between them, so it has to carry the column
              layout through — otherwise the body grows past the clipped content
              and the overflow is simply unreachable. */}
          <form onSubmit={onSubmit} className="d-flex flex-column" style={{ minHeight: 0, overflow: "hidden" }}>
            <div className="modal-header border-0 pb-0">
              <h5 className="modal-title">{title}</h5>
              <button type="button" className="btn-close" onClick={onClose} />
            </div>
            <div className="modal-body pt-2" style={{ minHeight: 0 }}>
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
