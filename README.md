# Bookmaker Payout Rules

A collection of rules, per sport, market, and bookmaker, which define how payouts
are made in edge cases (e.g. dead heats, walkovers ...). Depending on the rules,
Matched Betting may not be perfectly risk-free.

> [!NOTE]
> This is maintained by [MB-Tracker.com](https://mb-tracker.com/). An interactive version of the rules is available on the [website](https://mb-tracker.com/bookmakers/payout-rules/).

Everything here is keyed by the canonical sport, market and outcome keys that
MB-Tracker and its odds matcher already use. That is what lets a rule be joined
onto a live bet automatically — a search result knows it is `ICE_HOCKEY`,
`OVER_UNDER`, `UNDER`, at bookmaker 8, and that is enough to find the rule and
the compatibility entry with no translation table in between.

## Local Rules Editor

An editor is available for managing the rules data. It provides a UI for defining
rules, organizing them, and setting compatibility levels and cases.
```bash
./dev.sh
```

Editor available at: http://localhost:5173

## Data Structure

> [!TIP]
> All the following edits can be made through the UI, which will update the relevant JSON files.

```
data/
  sports.json                      # the sport vocabulary:  {SPORT_KEY: "Display name"}
  markets.json                     # the market vocabulary: {MARKET_KEY: {label, has_line, outcomes, sports}}
  bookmakers.json                  # the bookmaker vocabulary
  sports/<SPORT_KEY>/markets/<MARKET_KEY>/
      rules/<rule-slug>.json
      bookmakers/<bookmaker-slug>.json
  compatibility/<SPORT_KEY>/<MARKET_A>__<rule_a>+<MARKET_B>__<rule_b>.json
```

There are multiple levels to edit:

1. **Sport** — select the sport, or add one to `data/sports.json`. Keys must be the
   ones MB-Tracker uses, see [static/js/sport_types.js](https://mb-tracker.com/static/js/sport_types.js).
   _If you want to add a new sport, not yet available in MB-Tracker, reach out first._

2. **Market** — select the market. Markets are the canonical ones in
   `data/markets.json`, and a market can only be added to a sport its definition
   lists. _Adding a new market means adding it to the matcher first — reach out._

3. **Rule** — define rules, with a unique slug, label, and description in the
   relevant `data/sports/<SPORT>/markets/<MARKET>/rules/` directory.
```json
{
  "label": "<Rule Label>",
  "description": "<Detailed description of the rule>"
}
```

4. **Assign** a rule to a bookmaker in `data/sports/<SPORT>/markets/<MARKET>/bookmakers/<bookmaker>.json`
```json
{
  "rule": "<rule-slug>",
  "last_checked": "<ISO timestamp of when this was last verified to be correct>"
}
```

5. **Compatibility** between two rules, in `data/compatibility/<SPORT>/`. Each file
   defines the interaction between two rules — which may sit in *different*
   markets, because backing a 1X2 selection at one bookmaker and a Double Chance
   at another is one bet.

### Compatibility files

The filename carries the market and the rule of each side, joined by `__`, and the
two sides are separated by `+` and sorted alphabetically. The first side is **A**,
the second is **B**; `$A` and `$B` in a description are replaced with the name of
the bookmaker on that side.

```jsonc
// data/compatibility/ICE_HOCKEY/OVER_UNDER__ot_pen+OVER_UNDER__regular.json
{
  "level": "partial",
  "description": "Applies when no case below matches.",
  "cases": [
    {
      "when": { "a": { "outcomes": ["OVER"] } },
      "level": "additional_profit",
      "description": "$A settles Over including the shootout goal, $B settles Under on regular time — both legs can win."
    },
    {
      "when": { "a": { "outcomes": ["UNDER"] } },
      "level": "incompatible",
      "description": "$A settles Under including the shootout goal, $B settles Over on regular time — both legs can lose."
    }
  ]
}
```

**Levels:** `compatible`, `partial`, `incompatible`, `additional_profit`. A pair
with no file at all reads as *unknown* on the website.

**Cases** make a pair precise: the first one whose condition matches the actual
bet wins, and the top-level `level` applies when none do. `partial` is the honest
answer for a pair whose cases nobody has written yet.

A condition is `when.a` and/or `when.b`; a side matches when every key it states
matches. All keys are optional:

| key | meaning |
|---|---|
| `outcomes` | list of outcome keys from that side's market, e.g. `["HOME", "AWAY"]` |
| `side` | `"BACK"` or `"LAY"` — for a leg on an exchange |
| `line.sign` | `"positive"`, `"negative"` or `"zero"` |
| `line.abs_min` / `line.abs_max` | bounds on the absolute line, e.g. `{"abs_min": 1.5}` |
| `line.in` | exact lines, e.g. `[-0.5, 0, 0.5]` |

## Adding Sports
Add an entry to `data/sports.json`:
```json
{
  "<SPORT_KEY>": "<Display name>"
}
```
`<SPORT_KEY>` is the identifier used on MB-Tracker.com, see
[static/js/sport_types.js](https://mb-tracker.com/static/js/sport_types.js).
If the sport is not yet available on MB-Tracker, reach out first.

## Adding Bookmakers
Add an entry to `data/bookmakers.json`:
```json
{
  "<bookmaker-slug>": {
    "display": "<Bookmaker Display Name>",
    "mb_tracker_ids": [<MB-Tracker.com bookmaker IDs>]
  }
}
```
Where:
- `<bookmaker-slug>` is a unique slug for the bookmaker, used in the filenames and references.
- `<Bookmaker Display Name>` is the name of the bookmaker as it should be displayed in the UI.
- `<MB-Tracker.com bookmaker IDs>` is an array of bookmaker IDs from MB-Tracker.com that correspond to this bookmaker. Multiple IDs can be used, to group together white-labels or bookmakers operating in different regions.

## Validation

CI runs the same checks the editor does. To run them yourself:

```bash
python3 .github/scripts/validate_data.py
```
