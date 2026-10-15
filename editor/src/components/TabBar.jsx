import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * A row of tabs that scrolls sideways instead of wrapping, with `extra` (an
 * "add" picker) as its last item. The active tab is scrolled into view, so a
 * link to the tenth sport does not open on a bar showing the first five. An
 * edge that has more tabs past it fades out, so the overflow is visible.
 */
export default function TabBar({ items, active, onSelect, extra, small = false }) {
  const ref = useRef(null);
  const [fade, setFade] = useState("");

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setFade(left && right ? "fade-both" : left ? "fade-left" : right ? "fade-right" : "");
  }, []);

  useEffect(() => {
    ref.current?.querySelector(".tabbar-item.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
  }, [active, items.length, measure]);

  useEffect(() => {
    const observer = new ResizeObserver(measure);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div ref={ref} className={`tabbar ${small ? "tabbar-sm" : ""} ${fade}`} role="tablist" onScroll={measure}>
      {items.map(({ key, label, badge }) => (
        <button key={key} type="button" role="tab" aria-selected={key === active}
          className={`tabbar-item ${key === active ? "active" : ""}`} onClick={() => onSelect(key)}>
          {label}
          {badge}
        </button>
      ))}
      {extra && <div className="tabbar-extra">{extra}</div>}
    </div>
  );
}
