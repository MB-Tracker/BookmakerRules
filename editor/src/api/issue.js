/**
 * Turning the Pages editor's changes into a GitHub issue a maintainer can apply.
 *
 * The issue carries every changed file in full, under its path in the
 * repository, so applying it is copying files rather than re-doing the edit by
 * hand from a description — and a one-line summary per change on top, so it
 * can be reviewed without reading the JSON.
 */

/** A browser opens about this much of a URL reliably; GitHub truncates past it. */
export const MAX_URL = 8000;

/** What one changed path is, in words: `{kind, label}`. */
function describe(path) {
  const p = path.split("/");
  if (p[0] === "sports" && p.length === 6 && p[4] === "rules") return { kind: "rule", label: `${p[1]} / ${p[3]} / ${p[5].replace(/\.json$/, "")}`, scope: `${p[1]} / ${p[3]}` };
  if (p[0] === "sports" && p.length === 6 && p[4] === "bookmakers") return { kind: "assignment", label: `${p[1]} / ${p[3]} / ${p[5].replace(/\.json$/, "")}`, scope: `${p[1]} / ${p[3]}` };
  if (p[0] === "compatibility" && p.length === 3) {
    // Scoped to the markets of its two sides, so it groups with their rules.
    const markets = [...new Set(p[2].split("+").map((side) => side.split("__")[0]))];
    return { kind: "compatibility", label: `${p[1]} / ${p[2].replace(/\.json$/, "")}`, scope: `${p[1]} / ${markets.join(" + ")}` };
  }
  if (p[0] === "sports" && p.length >= 4) return { kind: "market", label: `${p[1]} / ${p[3]}`, scope: `${p[1]} / ${p[3]}` };
  if (p[0] === "sports" && p.length >= 2) return { kind: "sport", label: p[1], scope: p[1] };
  return { kind: "file", label: path, scope: path };
}

const VERB = { added: "Add", modified: "Update", deleted: "Delete" };

/** One line of the summary, e.g. "Update assignment `TENNIS / MONEYLINE / bet365` → rule `ret_voids`". */
function summaryLine({ path, status, after }) {
  const { kind, label } = describe(path);
  let detail = "";
  if (after && kind === "rule") detail = ` — “${after.label}”`;
  if (after && kind === "assignment") {
    const rules = Array.isArray(after.variants) ? after.variants.map((v) => `\`${v.rule}\` (${v.case})`).join(", ") : `\`${after.rule}\``;
    detail = ` → ${rules}`;
  }
  if (after && kind === "compatibility") detail = ` → \`${after.level}\`${after.cases?.length ? ` + ${after.cases.length} case(s)` : ""}`;
  return `- **${VERB[status]}** ${kind} \`${label}\`${detail}`;
}

/** A title naming what was touched, e.g. "Payout rules: TENNIS / MONEYLINE (2 changes)". */
export function issueTitle(paths) {
  const scopes = [...new Set(paths.map((p) => describe(p).scope))];
  const where = scopes.length <= 2 ? scopes.join(", ") : `${scopes.length} markets`;
  return `Payout rules: ${where} (${paths.length} change${paths.length === 1 ? "" : "s"})`;
}

export function issueBody({ changes, emptyDirs, notes, commit, pageUrl }) {
  const out = [];
  out.push("### Summary", "", ...changes.map(summaryLine));
  // An empty market leaves two empty directories, rules/ and bookmakers/.
  const empty = new Map(emptyDirs.map((d) => [describe(d).label, describe(d).kind]));
  for (const [label, kind] of empty) out.push(`- **Add** ${kind} \`${label}\` (nothing in it yet)`);
  out.push("", "### Source / notes", "", notes.trim() || "_none given_", "");

  out.push("### Files", "");
  for (const { path, status, after } of changes) {
    if (status === "deleted") {
      out.push(`**Delete** \`data/${path}\``, "");
      continue;
    }
    out.push(
      `**${status === "added" ? "Add" : "Replace"}** \`data/${path}\``,
      "```json",
      JSON.stringify(after, null, 4),
      "```",
      "",
    );
  }

  out.push(`<sub>Made with the [payout rules editor](${pageUrl}) on data at ${commit ? `\`${commit.slice(0, 7)}\`` : "an unknown commit"}.</sub>`);
  return out.join("\n");
}

export function issueUrl(repo, title, body) {
  return `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
