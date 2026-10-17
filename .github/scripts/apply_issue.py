#!/usr/bin/env python3
"""
Apply an issue made by the online editor's "Create GitHub Issue" button.

That issue carries every changed file in full under its path in the
repository (see editor/src/api/issue.js), so applying it is writing those
files back:

    **Add** `data/<path>`        followed by a ```json block
    **Replace** `data/<path>`    followed by a ```json block
    **Delete** `data/<path>`

The body is read from the clipboard by default, or from a file, stdin, or an
issue number through the `gh` CLI. Files whose contents changed in the
repository since the commit the issue was made on are flagged, since replacing
them may undo someone else's edit. The validator runs at the end.

    python3 .github/scripts/apply_issue.py                # body from the clipboard
    python3 .github/scripts/apply_issue.py body.md        # body from a file (- for stdin)
    python3 .github/scripts/apply_issue.py --issue 12     # body fetched with gh
    python3 .github/scripts/apply_issue.py --dry-run      # show what would change
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"

# "**Add** `data/x.json`" / "**Replace** …" / "**Delete** …", at the start of a line.
HEADER = re.compile(r"^\*\*(Add|Replace|Delete)\*\* `(data/[^`]+)`[ \t]*$", re.M)
JSON_BLOCK = re.compile(r"\s*```json[ \t]*\n(.*?)\n```", re.S)
COMMIT = re.compile(r"on data at `([0-9a-f]{7,40})`")


def read_body(args) -> str:
    if args.issue:
        return run(["gh", "issue", "view", str(args.issue), "--json", "body", "--jq", ".body"])
    if args.source == "-":
        return sys.stdin.read()
    if args.source:
        return Path(args.source).read_text(encoding="utf-8")
    for cmd in (["pbpaste"], ["wl-paste"], ["xclip", "-selection", "clipboard", "-o"]):
        try:
            return run(cmd)
        except (FileNotFoundError, subprocess.CalledProcessError):
            continue
    sys.exit("No clipboard tool found — pass the body as a file, or - for stdin.")


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, cwd=ROOT, check=True, capture_output=True, text=True).stdout


def safe_path(rel: str) -> Path:
    """The file `rel` names, refusing anything outside data/."""
    path = (ROOT / rel).resolve()
    if DATA_DIR.resolve() not in path.parents or path.suffix != ".json":
        sys.exit(f"Refusing {rel}: only JSON files under data/ can be changed.")
    return path


def parse(body: str) -> list[tuple[str, str, str | None]]:
    """Every file operation in the body, as (action, path, contents or None)."""
    body = body.replace("\r\n", "\n")
    ops = []
    for m in HEADER.finditer(body):
        action, rel = m.groups()
        contents = None
        if action != "Delete":
            block = JSON_BLOCK.match(body, m.end())
            if not block:
                sys.exit(f"{rel}: expected a ```json block after **{action}**.")
            contents = block.group(1)
            try:
                json.loads(contents)
            except json.JSONDecodeError as e:
                sys.exit(f"{rel}: invalid JSON — {e}")
        ops.append((action, rel, contents))
    return ops


def changed_since(commit: str, rel: str) -> bool:
    """Whether `rel` is different now from what it was at `commit`."""
    r = subprocess.run(["git", "diff", "--quiet", commit, "--", rel], cwd=ROOT)
    return r.returncode == 1


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("source", nargs="?", help="file with the issue body, or - for stdin (default: clipboard)")
    ap.add_argument("--issue", type=int, help="fetch the body of this issue with gh")
    ap.add_argument("--dry-run", action="store_true", help="only print what would change")
    ap.add_argument("--force", action="store_true", help="apply even if files changed since the issue's commit")
    args = ap.parse_args()

    body = read_body(args)
    ops = parse(body)
    if not ops:
        sys.exit("No **Add** / **Replace** / **Delete** entries found — is this an editor issue?")

    # Know about a stale base before touching anything.
    commit = COMMIT.search(body)
    commit = commit.group(1) if commit else None
    known = commit and subprocess.run(["git", "cat-file", "-e", f"{commit}^{{commit}}"], cwd=ROOT, capture_output=True).returncode == 0
    stale = [rel for _, rel, _ in ops if known and changed_since(commit, rel)]
    if not commit:
        print("note: the issue names no commit, so stale files cannot be detected.")
    elif not known:
        print(f"note: commit {commit} is not in this repository (git fetch?), so stale files cannot be detected.")
    for rel in stale:
        print(f"warning: {rel} changed since {commit} — the issue's version may undo that.")
    if stale and not args.force and not args.dry_run:
        sys.exit("Stopping. Review the files above, then rerun with --force to apply anyway.")

    for action, rel, contents in ops:
        path = safe_path(rel)
        verb = {"Add": "add", "Replace": "replace", "Delete": "delete"}[action]
        if action == "Add" and path.exists():
            verb = "replace (issue says add, file exists)"
        elif action != "Add" and not path.exists():
            verb = "add (issue says replace, file missing)" if contents is not None else "skip (already gone)"
        print(f"{verb:>8}  {rel}")
        if args.dry_run:
            continue
        if contents is None:
            if path.exists():
                path.unlink()
                # Drop directories the deletion left empty, up to data/.
                parent = path.parent
                while parent != DATA_DIR and not any(parent.iterdir()):
                    parent.rmdir()
                    parent = parent.parent
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(contents.rstrip("\n") + "\n", encoding="utf-8")

    if "(nothing in it yet)" in body:
        print("note: the issue adds empty sports/markets; git does not carry empty directories, so those are skipped.")

    if args.dry_run:
        return
    print("\nValidating…", flush=True)
    sys.exit(subprocess.run([sys.executable, ".github/scripts/validate_data.py"], cwd=ROOT).returncode)


if __name__ == "__main__":
    main()
