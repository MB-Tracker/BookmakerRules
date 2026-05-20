#!/usr/bin/env python3
"""Validate payout-rules data files for schema and referential integrity."""
import json
import re
import sys
from itertools import combinations
from pathlib import Path

DATA_DIR = Path("data")
SPORTS_DIR = DATA_DIR / "sports"
ERRORS: list[str] = []


def err(path, msg: str) -> None:
    ERRORS.append(f"{path}: {msg}")


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        err(path, f"invalid JSON — {e}")
        return None


def rule_slugs(market_dir: Path) -> set[str]:
    rules_dir = market_dir / "rules"
    return {f.stem for f in rules_dir.glob("*.json")} if rules_dir.exists() else set()


# ── rules/<slug>.json ─────────────────────────────────────────────────────────

def validate_rules() -> None:
    for f in SPORTS_DIR.rglob("rules/*.json"):
        d = load_json(f)
        if d is None:
            continue
        if not isinstance(d, dict):
            err(f, "must be JSON object")
            continue
        if not isinstance(d.get("label"), str) or not d["label"].strip():
            err(f, "'label' must be a non-empty string")
        if "description" not in d:
            err(f, "missing required field 'description'")
        elif not isinstance(d["description"], str):
            err(f, "'description' must be a string")


# ── bookmakers/<slug>.json ────────────────────────────────────────────────────

ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


def validate_bookmakers(require_last_checked: set[str]) -> None:
    for f in SPORTS_DIR.rglob("bookmakers/*.json"):
        d = load_json(f)
        if d is None:
            continue

        if isinstance(d, str):
            rule, last_checked = d, None
        elif isinstance(d, dict):
            if "rule" not in d:
                err(f, "missing required field 'rule'")
                continue
            rule = d["rule"]
            last_checked = d.get("last_checked")
            if not isinstance(rule, str) or not rule.strip():
                err(f, "'rule' must be a non-empty string")
                continue
            if last_checked is not None:
                if not isinstance(last_checked, str) or not ISO_RE.match(last_checked):
                    err(f, "'last_checked' must be an ISO 8601 datetime string or null")
        else:
            err(f, "must be a JSON object or string")
            continue

        market_dir = f.parent.parent
        slugs = rule_slugs(market_dir)
        if rule not in slugs:
            err(f, f"'rule' value '{rule}' does not match any slug in {market_dir}/rules/")

        if str(f) in require_last_checked and not last_checked:
            err(f, "changed bookmaker assignment must have 'last_checked' set (not null) — see CONTRIBUTE.md")


# ── compatibility/<a>+<b>.json ────────────────────────────────────────────────

def validate_compatibility() -> None:
    for f in SPORTS_DIR.rglob("compatibility/*.json"):
        parts = f.stem.split("+", 1)
        if len(parts) != 2:
            err(f, "filename must be '<rule_a>+<rule_b>.json'")
            continue
        rule_a, rule_b = parts

        if rule_a >= rule_b:
            err(f, f"rule names in filename must be alphabetically sorted ('{rule_a}' >= '{rule_b}')")

        market_dir = f.parent.parent
        slugs = rule_slugs(market_dir)
        for label, slug in [("left", rule_a), ("right", rule_b)]:
            if slug not in slugs:
                err(f, f"filename references rule '{slug}' which does not exist in rules/")

        d = load_json(f)
        if d is None:
            continue
        if not isinstance(d, dict):
            err(f, "must be JSON object")
            continue
        if "level" not in d:
            err(f, "missing required field 'level'")
        elif not isinstance(d["level"], str) or not d["level"].strip():
            err(f, "'level' must be a non-empty string")
        if "description" not in d:
            err(f, "missing required field 'description'")
        elif not isinstance(d["description"], str):
            err(f, "'description' must be a string")


# ── bookmaker_mapping.json ────────────────────────────────────────────────────

def validate_bookmaker_mapping() -> None:
    path = DATA_DIR / "bookmaker_mapping.json"
    if not path.exists():
        return
    d = load_json(path)
    if d is None:
        return
    if not isinstance(d, dict):
        err(path, "must be JSON object")
        return
    for slug, info in d.items():
        if not isinstance(info, dict):
            err(path, f"entry '{slug}' must be an object")
            continue
        if not isinstance(info.get("display"), str) or not info["display"].strip():
            err(path, f"entry '{slug}'.display must be a non-empty string")
        ids = info.get("mb_tracker_ids")
        if not isinstance(ids, list):
            err(path, f"entry '{slug}'.mb_tracker_ids must be an array")
        elif not all(isinstance(x, int) for x in ids):
            err(path, f"entry '{slug}'.mb_tracker_ids must contain only integers")


# ── sport_mapping.json ────────────────────────────────────────────────────────

def validate_sport_mapping() -> None:
    path = DATA_DIR / "sport_mapping.json"
    if not path.exists():
        return
    d = load_json(path)
    if d is None:
        return
    if not isinstance(d, dict):
        err(path, "must be JSON object")
        return
    for key, val in d.items():
        if not isinstance(val, str):
            err(path, f"value for '{key}' must be a string")
            continue
    if not SPORTS_DIR.exists():
        return
    for sport_dir in sorted(SPORTS_DIR.iterdir()):
        if not sport_dir.is_dir():
            continue
        if sport_dir.name not in d.values():
            err(path, f"missing mapping for sport '{sport_dir.name}' (directory exists in data/sports/)")


# ── cross-reference: missing compatibility entries ────────────────────────────

def validate_missing_compat() -> None:
    if not SPORTS_DIR.exists():
        return
    for sport_dir in sorted(SPORTS_DIR.iterdir()):
        markets_dir = sport_dir / "markets"
        if not markets_dir.exists():
            continue
        for market_dir in sorted(markets_dir.iterdir()):
            bm_dir = market_dir / "bookmakers"
            if not bm_dir.exists():
                continue
            rules_used: set[str] = set()
            for f in bm_dir.glob("*.json"):
                d = load_json(f)
                if isinstance(d, str):
                    rules_used.add(d)
                elif isinstance(d, dict) and isinstance(d.get("rule"), str):
                    rules_used.add(d["rule"])
            if len(rules_used) < 2:
                continue
            compat_dir = market_dir / "compatibility"
            for ra, rb in combinations(sorted(rules_used), 2):
                a, b = sorted([ra, rb])
                if not compat_dir.exists() or not (compat_dir / f"{a}+{b}.json").exists():
                    err(
                        market_dir,
                        f"missing compatibility/{a}+{b}.json "
                        f"(rules '{a}' and '{b}' are both assigned to bookmakers)",
                    )


# ── entrypoint ────────────────────────────────────────────────────────────────

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--changed-bookmaker-files-from",
        metavar="FILE",
        help="Path to a file listing changed bookmaker JSON paths (one per line). "
             "Used to enforce the last_checked update requirement.",
    )
    args = parser.parse_args()

    require_last_checked: set[str] = set()
    if args.changed_bookmaker_files_from:
        p = Path(args.changed_bookmaker_files_from)
        if p.exists():
            require_last_checked = {
                line.strip() for line in p.read_text().splitlines() if line.strip()
            }

    validate_rules()
    validate_bookmakers(require_last_checked)
    validate_compatibility()
    validate_bookmaker_mapping()
    validate_sport_mapping()
    validate_missing_compat()

    if ERRORS:
        print(f"\n{'─' * 60}")
        print(f"Found {len(ERRORS)} error(s):\n")
        for e in ERRORS:
            print(f"  ✗ {e}")
        sys.exit(1)
    else:
        print(f"✓ All data files valid ({len(list(SPORTS_DIR.rglob('*.json'))) if SPORTS_DIR.exists() else 0} files checked).")


if __name__ == "__main__":
    main()
