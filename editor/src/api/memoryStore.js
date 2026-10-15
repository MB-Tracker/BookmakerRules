/**
 * The store core.js works on, for the GitHub Pages build: the repository's
 * data/ as it was at deploy time, plus whatever this browser changed on top.
 *
 * Only the changes are kept — `overlay` maps a path to its new contents, or to
 * null for a deleted file — and only they are saved to localStorage. A visitor
 * who comes back after the site was redeployed keeps their edits, applied onto
 * the newer data rather than silently reverting everything else to an old copy.
 *
 * Directories are not stored: one exists while a file under it does, or when
 * it was made empty here (a sport or market just added, with nothing in it
 * yet), which is the only kind git cannot carry anyway.
 */

const KEY = "payout-rules-editor:changes";

const parentsOf = (p) => {
  const out = [];
  const parts = p.split("/");
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return { overlay: saved?.overlay ?? {}, dirs: saved?.dirs ?? [] };
  } catch {
    return { overlay: {}, dirs: [] };
  }
}

export function createMemoryStore(baseline) {
  let { overlay, dirs } = load();
  let made = new Set(dirs);
  const listeners = new Set();

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ overlay, dirs: [...made] })); } catch { /* private mode */ }
    listeners.forEach((fn) => fn());
  };

  /** Every file as it is now, path → contents. */
  const current = () => {
    const out = { ...baseline };
    for (const [p, v] of Object.entries(overlay)) {
      if (v === null) delete out[p];
      else out[p] = v;
    }
    return out;
  };

  const isDir = (p) => made.has(p) || Object.keys(current()).some((f) => f.startsWith(`${p}/`));

  const set = (p, v) => {
    if (v === null ? !(p in baseline) : same(baseline[p], v)) delete overlay[p];
    else overlay[p] = v;
  };

  return {
    exists: (p) => p in current() || isDir(p),

    read(p) {
      const files = current();
      if (!(p in files)) throw new Error(`no such file: ${p}`);
      return structuredClone(files[p]);
    },

    write(p, v) {
      set(p, structuredClone(v));
      save();
    },

    ls(p) {
      const prefix = `${p}/`;
      const names = new Set();
      for (const path of [...Object.keys(current()), ...made]) {
        if (path.startsWith(prefix)) names.add(path.slice(prefix.length).split("/")[0]);
      }
      return [...names];
    },

    rm(p) {
      const prefix = `${p}/`;
      for (const f of Object.keys(current())) {
        if (f === p || f.startsWith(prefix)) set(f, null);
      }
      made = new Set([...made].filter((d) => d !== p && !d.startsWith(prefix)));
      save();
    },

    mkdir(p) {
      for (const d of [...parentsOf(p), p]) made.add(d);
      save();
    },

    // ── Not part of the store core.js sees ──

    /** What this browser changed, as `{path, status, before, after}`, sorted by path. */
    changes() {
      return Object.keys(overlay).sort().map((path) => {
        const before = baseline[path] ?? null;
        const after = overlay[path];
        const status = after === null ? "deleted" : before === null ? "added" : "modified";
        return { path, status, before, after };
      });
    },

    /** Empty directories made here, for a sport or market added with nothing in it yet. */
    emptyDirs: () => [...made].filter((d) => !Object.keys(current()).some((f) => f.startsWith(`${d}/`))).sort(),

    discard() {
      overlay = {};
      made = new Set();
      save();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
