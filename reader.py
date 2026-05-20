"""
Pure-Python reader for payout-rules data.
No external dependencies — import anywhere.

Data layout:
  data/sports/<Sport>/markets/<Market>/rules/<slug>.json       {label, description}
  data/sports/<Sport>/markets/<Market>/bookmakers/<slug>.json  "<rule-slug>"
  data/sports/<Sport>/markets/<Market>/compatibility/<a>+<b>.json  {level, description}
  data/bookmaker_mapping.json  {slug: {display, aliases[]}}
  data/sport_mapping.json      {MB_IDENTIFIER: "Payout Rules sport dir name"}
"""
import json
from itertools import combinations
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
SPORTS_DIR = DATA_DIR / "sports"


def _jload(path):
    return json.loads(path.read_text(encoding="utf-8"))


# --- Sports and markets ---

def get_sports():
    """[{name, markets: [str]}]"""
    if not SPORTS_DIR.exists():
        return []
    return [
        {
            "name": s.name,
            "markets": sorted(m.name for m in (s / "markets").iterdir() if m.is_dir())
            if (s / "markets").exists() else [],
        }
        for s in sorted(SPORTS_DIR.iterdir())
        if s.is_dir()
    ]


def _market_dir(sport, market):
    return SPORTS_DIR / sport / "markets" / market


# --- Rules (scoped to a sport+market) ---

def get_rules(sport, market):
    """[{name, label, description}]"""
    rules_dir = _market_dir(sport, market) / "rules"
    if not rules_dir.exists():
        return []
    return [
        {"name": f.stem, **_jload(f)}
        for f in sorted(rules_dir.glob("*.json"))
    ]


# --- Bookmakers (scoped to a sport+market) and reverse lookup by bookmaker ---

def _read_bm(path):
    raw = _jload(path)
    if isinstance(raw, str):
        return {"rule": raw, "last_checked": None}
    return {"rule": raw.get("rule"), "last_checked": raw.get("last_checked")}


def get_market_bookmakers(sport, market):
    """[{bookmaker, rule, last_checked}] for one market."""
    bm_dir = _market_dir(sport, market) / "bookmakers"
    if not bm_dir.exists():
        return []
    return [
        {"bookmaker": f.stem, **_read_bm(f)}
        for f in sorted(bm_dir.glob("*.json"))
    ]


def get_bookmaker_rules(bookmaker_name):
    """[{sport, market, rule, last_checked}] across all markets for one bookmaker."""
    slug = bookmaker_name.lower().replace(" ", "_")
    result = []
    if not SPORTS_DIR.exists():
        return result
    for sport_dir in sorted(SPORTS_DIR.iterdir()):
        markets_dir = sport_dir / "markets"
        if not markets_dir.exists():
            continue
        for market_dir in sorted(markets_dir.iterdir()):
            bm_file = market_dir / "bookmakers" / f"{slug}.json"
            if bm_file.exists():
                result.append({
                    "sport": sport_dir.name,
                    "market": market_dir.name,
                    **_read_bm(bm_file),
                })
    return result


# --- Compatibility between rules ---

def _pair_name(rule_a, rule_b):
    a, b = sorted([rule_a, rule_b])
    return f"{a}+{b}"


def get_compatibility(sport, market):
    """[{rule_a, rule_b, level, description}] for one market."""
    compat_dir = _market_dir(sport, market) / "compatibility"
    if not compat_dir.exists():
        return []
    entries = []
    for f in sorted(compat_dir.glob("*.json")):
        parts = f.stem.split("+", 1)
        if len(parts) == 2:
            data = _jload(f)
            entries.append({"rule_a": parts[0], "rule_b": parts[1], **data})
    return entries


def find_compatibility(rule_a, rule_b, sport, market):
    """Return compatibility entry for this rule pair in this market, or None."""
    compat_dir = _market_dir(sport, market) / "compatibility"
    path = compat_dir / f"{_pair_name(rule_a, rule_b)}.json"
    if not path.exists():
        return None
    return {"rule_a": rule_a, "rule_b": rule_b, **_jload(path)}


# --- Validation ---

def validate():
    """
    For every market, find rule pairs used by different bookmakers that have
    no compatibility entry defined.
    """
    issues = []
    if not SPORTS_DIR.exists():
        return issues

    for sport_dir in sorted(SPORTS_DIR.iterdir()):
        markets_dir = sport_dir / "markets"
        if not markets_dir.exists():
            continue
        for market_dir in sorted(markets_dir.iterdir()):
            bm_dir = market_dir / "bookmakers"
            if not bm_dir.exists():
                continue
            rules_used = {_read_bm(f)["rule"] for f in bm_dir.glob("*.json")}
            if len(rules_used) < 2:
                continue
            compat_dir = market_dir / "compatibility"
            for rule_a, rule_b in combinations(sorted(rules_used), 2):
                pair = f"{_pair_name(rule_a, rule_b)}.json"
                if not compat_dir.exists() or not (compat_dir / pair).exists():
                    issues.append({
                        "sport": sport_dir.name,
                        "market": market_dir.name,
                        "rule_a": rule_a,
                        "rule_b": rule_b,
                    })
    return issues


# --- Mappings for external integration ---

def get_bookmaker_mapping():
    """
    {slug: {display, mb_tracker_ids[]}}
    Maps canonical payout-rules slug → display name + all MB-Tracker ids.
    Edit data/bookmaker_mapping.json to add entries.
    """
    path = DATA_DIR / "bookmaker_mapping.json"
    return _jload(path) if path.exists() else {}


def get_sport_mapping():
    """
    {MB_IDENTIFIER: "Payout Rules sport dir name"}
    Maps MB-Tracker Sport identifiers (e.g. 'FOOTBALL') → payout_rules directory names.
    Edit data/sport_mapping.json to add entries.
    """
    path = DATA_DIR / "sport_mapping.json"
    return _jload(path) if path.exists() else {}

# --- MB-Tracker integration helpers ---

def resolve_bookmaker(mb_tracker_id):
    for slug, info in get_bookmaker_mapping().items():
        if mb_tracker_id in info.get("mb_tracker_ids", []):
            return slug
    return None


def resolve_sport(mb_sport_identifier):
    return get_sport_mapping().get(mb_sport_identifier)
