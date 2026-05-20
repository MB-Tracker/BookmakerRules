# Bookmaker Payout Rules

A collection of rules, per sport, market, and bookmaker, which define how payouts
are made in edge cases (e.g. dead heats, walkovers ...). Depending on the rules,
Matched Betting may not be perfectly risk-free.

> [!NOTE]
> This is maintained by [MB-Tracker.com](https://mb-tracker.com/). An interactive version of the rules is available on the [website](https://mb-tracker.com/bookmakers/payout-rules/).


## Local Rules Editor

An editor is available for managing the rules data. It provides a UI for defining
rules, organizing them, and setting compatibility levels.
```bash
./dev.sh
```

Editor available at: http://localhost:5173

## Data Structure

> [!TIP]
> All the following edits can be made through the UI, which will update the relevant JSON files.

There are multiple levels to edit:
1. Sport - select the sport, or add one to `data/sport_mapping.json` (Sports must use the naming of [MB-Tracker.com](https://mb-tracker.com/) for compatibility with the rest of the system), check the `.js` source for details. [See current sports](https://mb-tracker.com/static/js/sport_types.js). _If you want to add a new sport, not yet available in MB-Tracker, reach out first._
  
2. Market - select the market, or add one to the relevant sport in the Editor UI or by creating a new directory in `data/sports/<Sport>/markets/`. 
3. Rule - define rules, with a unique slug, label, and description in the relevant `data/sports/<Sport>/markets/<Market>/rules/` directory.
```json
{
  "slug": "<rule-slug>",
  "label": "<Rule Label>",
  "description": "<Detailed description of the rule>"
}
```
1. Assign a rules to bookmakers in the `data/sports/<Sport>/markets/<Market>/bookmakers/<bookmaker>.json`
```json
{
  "rule": "<rule-slug>",
  "last_checked": "<ISO timestamp of when this was last verified to be correct>" // e.g. "2026-05-20T13:01:23.172Z"
}

```
5. Define compatibility with different rules in the `data/sports/<Sport>/markets/<Market>/compatibility/` directory. Each file defines the compatibility between two rules, with a level and description.
```json
// Filename format: <rule-a-slug>+<rule-b-slug>.json
{
  "level": "compatible|partial|incompatible",
  "description": "<Detailed description of the interaction between the two rules, ideally with concrete examples if double-loss or similar outcomes are possible>"
}
```

## Adding Sports
To add a new sport, create a new entry in `data/sport_mapping.json` with the following format:
```json
{
  "<MB_IDENTIFIER>": "<Sport Directory Name>"
}
```
Where:
- `<MB_IDENTIFIER>` is the identifier used on MB-Tracker.com, see [static/js/sport_types.js](https://mb-tracker.com/static/js/sport_types.js)
If the sport is not yet available on MB-Tracker, reach out first.


## Adding Bookmakers
To add a new bookmaker, create a new entry in `data/bookmaker_mapping.json` with the following format:
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
