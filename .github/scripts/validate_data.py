#!/usr/bin/env python3
"""
Validate payout-rules data files for schema and referential integrity.

The point of this script is that every key in `data/` is a key the consumers
already speak. Sports, markets and outcomes are the canonical ones from
MB-Tracker / the odds matcher, so a rule can be joined onto a live bet with no
translation table — and a typo here would show up over there as a silently
missing rule rather than as an error. `data/sports.json` and `data/markets.json`
are the vocabularies, and everything below is checked against them.
"""
import json
import re
import sys
from itertools import combinations
from pathlib import Path

DATA_DIR = Path("data")
SPORTS_DIR = DATA_DIR / "sports"
COMPAT_DIR = DATA_DIR / "compatibility"

LEVELS = {"compatible", "partial", "incompatible", "additional_profit"}
SIDES = {"BACK", "LAY"}
LINE_SIGNS = {"positive", "negative", "zero"}
SELECTOR_KEYS = {"outcomes", "side", "line"}
LINE_KEYS = {"sign", "abs_min", "abs_max", "in"}

ERRORS: list[str] = []


def err(path, msg: str) -> None:
    ERRORS.append(f"{path}: {msg}")


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        err(path, f"invalid JSON — {e}")
        return None


# ── Vocabularies ─────────────────────────────────────────────────────────────

def load_sports() -> dict:
    path = DATA_DIR / "sports.json"
    if not path.exists():
        err(path, "missing — the sport vocabulary is required")
        return {}
    d = load_json(path)
    if not isinstance(d, dict):
        err(path, "must be a JSON object of {SPORT_KEY: display name}")
        return {}
    for key, label in d.items():
        if not re.fullmatch(r"[A-Z0-9]+(_[A-Z0-9]+)*", key):
            err(path, f"sport key '{key}' must be SCREAMING_SNAKE_CASE")
        if not isinstance(label, str) or not label.strip():
            err(path, f"display name for '{key}' must be a non-empty string")
    return d


def load_markets(sports: dict) -> dict:
    path = DATA_DIR / "markets.json"
    if not path.exists():
        err(path, "missing — the market vocabulary is required")
        return {}
    d = load_json(path)
    if not isinstance(d, dict):
        err(path, "must be a JSON object of {MARKET_KEY: definition}")
        return {}
    for key, info in d.items():
        # A double underscore would make a compatibility filename ambiguous,
        # since that is exactly what separates the market from the rule there.
        if "__" in key or not re.fullmatch(r"[A-Z0-9]+(_[A-Z0-9]+)*", key):
            err(path, f"market key '{key}' must be SCREAMING_SNAKE_CASE without a double underscore")
            continue
        if not isinstance(info, dict):
            err(path, f"market '{key}' must be an object")
            continue
        if not isinstance(info.get("label"), str) or not info["label"].strip():
            err(path, f"market '{key}'.label must be a non-empty string")
        if not isinstance(info.get("has_line"), bool):
            err(path, f"market '{key}'.has_line must be a boolean")
        outcomes = info.get("outcomes")
        if not isinstance(outcomes, list) or not outcomes:
            err(path, f"market '{key}'.outcomes must be a non-empty array")
        elif not all(isinstance(o, str) and o.strip() for o in outcomes):
            err(path, f"market '{key}'.outcomes must contain only non-empty strings")
        market_sports = info.get("sports")
        if not isinstance(market_sports, list):
            err(path, f"market '{key}'.sports must be an array (empty means 'every sport')")
        else:
            for s in market_sports:
                if s not in sports:
                    err(path, f"market '{key}'.sports references unknown sport '{s}'")
    return d


def load_bookmakers() -> dict:
    path = DATA_DIR / "bookmakers.json"
    if not path.exists():
        err(path, "missing — the bookmaker vocabulary is required")
        return {}
    d = load_json(path)
    if not isinstance(d, dict):
        err(path, "must be JSON object")
        return {}
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
    return d


# ── data/sports/<SPORT>/markets/<MARKET>/ ────────────────────────────────────

def rule_slugs(market_dir: Path) -> set[str]:
    rules_dir = market_dir / "rules"
    return {f.stem for f in rules_dir.glob("*.json")} if rules_dir.exists() else set()


def market_dirs() -> list[tuple[str, str, Path]]:
    """[(sport_key, market_key, dir)] for every market directory on disk."""
    out = []
    if not SPORTS_DIR.exists():
        return out
    for sport_dir in sorted(SPORTS_DIR.iterdir()):
        if not sport_dir.is_dir():
            continue
        markets = sport_dir / "markets"
        if not markets.exists():
            continue
        for m in sorted(markets.iterdir()):
            if m.is_dir():
                out.append((sport_dir.name, m.name, m))
    return out


def validate_tree(sports: dict, markets: dict) -> None:
    for sport, market, mdir in market_dirs():
        if sport not in sports:
            err(mdir, f"unknown sport '{sport}' — add it to data/sports.json first")
        info = markets.get(market)
        if info is None:
            err(mdir, f"unknown market '{market}' — add it to data/markets.json first")
            continue
        allowed = info.get("sports") or []
        if allowed and sport not in allowed:
            err(mdir, f"market '{market}' is not offered in '{sport}' (see data/markets.json)")


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


ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


def validate_bookmaker_assignments(bookmakers: dict, require_last_checked: set[str]) -> None:
    for f in SPORTS_DIR.rglob("bookmakers/*.json"):
        d = load_json(f)
        if d is None:
            continue
        if not isinstance(d, dict):
            err(f, "must be a JSON object {rule, last_checked}")
            continue
        rule = d.get("rule")
        last_checked = d.get("last_checked")
        if not isinstance(rule, str) or not rule.strip():
            err(f, "'rule' must be a non-empty string")
            continue
        if last_checked is not None and (
            not isinstance(last_checked, str) or not ISO_RE.match(last_checked)
        ):
            err(f, "'last_checked' must be an ISO 8601 datetime string or null")

        if f.stem not in bookmakers:
            err(f, f"unknown bookmaker '{f.stem}' — add it to data/bookmakers.json first")

        market_dir = f.parent.parent
        if rule not in rule_slugs(market_dir):
            err(f, f"'rule' value '{rule}' does not match any slug in {market_dir}/rules/")

        if str(f) in require_last_checked and not last_checked:
            err(f, "changed bookmaker assignment must have 'last_checked' set (not null) — see CONTRIBUTE.md")


# ── data/compatibility/<SPORT>/<MA>__<ra>+<MB>__<rb>.json ────────────────────

def parse_pair_name(stem: str):
    """('MARKET_A', 'rule_a', 'MARKET_B', 'rule_b') or None if it is not one."""
    parts = stem.split("+")
    if len(parts) != 2:
        return None
    sides = []
    for part in parts:
        # Market keys never contain a double underscore, rule slugs may contain
        # single ones, so the first '__' is the separator.
        market, sep, rule = part.partition("__")
        if not sep or not market or not rule:
            return None
        sides.append((market, rule))
    return sides[0][0], sides[0][1], sides[1][0], sides[1][1]


def validate_selector(f: Path, where: str, sel, market: str, markets: dict) -> None:
    if not isinstance(sel, dict):
        err(f, f"{where} must be an object")
        return
    unknown = set(sel) - SELECTOR_KEYS
    if unknown:
        err(f, f"{where} has unknown key(s) {sorted(unknown)} — allowed: {sorted(SELECTOR_KEYS)}")

    info = markets.get(market, {})
    if "outcomes" in sel:
        outcomes = sel["outcomes"]
        if not isinstance(outcomes, list) or not outcomes:
            err(f, f"{where}.outcomes must be a non-empty array")
        else:
            for o in outcomes:
                if o not in (info.get("outcomes") or []):
                    err(f, f"{where}.outcomes references '{o}', which market '{market}' does not have")
    if "side" in sel and sel["side"] not in SIDES:
        err(f, f"{where}.side must be one of {sorted(SIDES)}")
    if "line" in sel:
        line = sel["line"]
        if not info.get("has_line"):
            err(f, f"{where}.line is set but market '{market}' carries no line")
        if not isinstance(line, dict) or not line:
            err(f, f"{where}.line must be a non-empty object")
            return
        unknown = set(line) - LINE_KEYS
        if unknown:
            err(f, f"{where}.line has unknown key(s) {sorted(unknown)} — allowed: {sorted(LINE_KEYS)}")
        if "sign" in line and line["sign"] not in LINE_SIGNS:
            err(f, f"{where}.line.sign must be one of {sorted(LINE_SIGNS)}")
        for key in ("abs_min", "abs_max"):
            if key in line and not isinstance(line[key], (int, float)):
                err(f, f"{where}.line.{key} must be a number")
        if "in" in line:
            if not isinstance(line["in"], list) or not line["in"]:
                err(f, f"{where}.line.in must be a non-empty array")
            elif not all(isinstance(x, (int, float)) for x in line["in"]):
                err(f, f"{where}.line.in must contain only numbers")


def validate_compatibility(sports: dict, markets: dict) -> None:
    if not COMPAT_DIR.exists():
        return
    for sport_dir in sorted(COMPAT_DIR.iterdir()):
        if not sport_dir.is_dir():
            continue
        sport = sport_dir.name
        if sport not in sports:
            err(sport_dir, f"unknown sport '{sport}' — add it to data/sports.json first")
        for f in sorted(sport_dir.glob("*.json")):
            parsed = parse_pair_name(f.stem)
            if parsed is None:
                err(f, "filename must be '<MARKET_A>__<rule_a>+<MARKET_B>__<rule_b>.json'")
                continue
            market_a, rule_a, market_b, rule_b = parsed

            left, right = f"{market_a}__{rule_a}", f"{market_b}__{rule_b}"
            if left > right:
                err(f, f"the two sides must be alphabetically sorted ('{left}' > '{right}')")

            for market, rule in ((market_a, rule_a), (market_b, rule_b)):
                if market not in markets:
                    err(f, f"unknown market '{market}' — add it to data/markets.json first")
                    continue
                mdir = SPORTS_DIR / sport / "markets" / market
                if rule not in rule_slugs(mdir):
                    err(f, f"rule '{rule}' does not exist in {mdir}/rules/")

            d = load_json(f)
            if d is None:
                continue
            if not isinstance(d, dict):
                err(f, "must be JSON object")
                continue
            if d.get("level") not in LEVELS:
                err(f, f"'level' must be one of {sorted(LEVELS)}")
            if not isinstance(d.get("description"), str):
                err(f, "'description' must be a string")

            cases = d.get("cases", [])
            if not isinstance(cases, list):
                err(f, "'cases' must be an array")
                continue
            for i, case in enumerate(cases):
                label = f"cases[{i}]"
                if not isinstance(case, dict):
                    err(f, f"{label} must be an object")
                    continue
                if case.get("level") not in LEVELS:
                    err(f, f"{label}.level must be one of {sorted(LEVELS)}")
                if "description" in case and not isinstance(case["description"], str):
                    err(f, f"{label}.description must be a string")
                when = case.get("when", {})
                if not isinstance(when, dict):
                    err(f, f"{label}.when must be an object")
                    continue
                unknown = set(when) - {"a", "b"}
                if unknown:
                    err(f, f"{label}.when has unknown key(s) {sorted(unknown)} — allowed: ['a', 'b']")
                if not when:
                    # An unconditional case shadows every case below it, which is
                    # what the top-level 'level' already means.
                    err(f, f"{label}.when is empty — use the top-level 'level' for the default")
                if "a" in when:
                    validate_selector(f, f"{label}.when.a", when["a"], market_a, markets)
                if "b" in when:
                    validate_selector(f, f"{label}.when.b", when["b"], market_b, markets)


# ── cross-reference: missing compatibility entries ───────────────────────────

def validate_missing_compat() -> None:
    """
    Every pair of *different* rules assigned to bookmakers within one market
    needs an entry, because that pair is a matched bet somebody can place today.

    Cross-market pairs (1X2 against Double Chance, say) are not demanded here:
    which markets oppose each other is the matcher's model, not this repo's, and
    requiring every combination would demand entries for pairs that are not bets.
    """
    assigned: dict[tuple[str, str], set[str]] = {}
    for sport, market, mdir in market_dirs():
        bm_dir = mdir / "bookmakers"
        if not bm_dir.exists():
            continue
        rules = set()
        for f in bm_dir.glob("*.json"):
            d = load_json(f)
            if isinstance(d, dict) and isinstance(d.get("rule"), str):
                rules.add(d["rule"])
        if rules:
            assigned[(sport, market)] = rules

    for (sport, market), rules in sorted(assigned.items()):
        if len(rules) < 2:
            continue
        for ra, rb in combinations(sorted(rules), 2):
            left, right = sorted([f"{market}__{ra}", f"{market}__{rb}"])
            path = COMPAT_DIR / sport / f"{left}+{right}.json"
            if not path.exists():
                err(
                    SPORTS_DIR / sport / "markets" / market,
                    f"missing {path} (rules '{ra}' and '{rb}' are both assigned to bookmakers)",
                )


# ── entrypoint ───────────────────────────────────────────────────────────────

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

    sports = load_sports()
    markets = load_markets(sports)
    bookmakers = load_bookmakers()

    validate_tree(sports, markets)
    validate_rules()
    validate_bookmaker_assignments(bookmakers, require_last_checked)
    validate_compatibility(sports, markets)
    validate_missing_compat()

    if ERRORS:
        print(f"\n{'─' * 60}")
        print(f"Found {len(ERRORS)} error(s):\n")
        for e in ERRORS:
            print(f"  ✗ {e}")
        sys.exit(1)

    checked = len(list(DATA_DIR.rglob("*.json")))
    print(f"✓ All data files valid ({checked} files checked).")


if __name__ == "__main__":
    main()
