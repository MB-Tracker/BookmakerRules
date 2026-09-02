# Contribution Guidelines

When contributing to this repository, please follow these guidelines:

- Do not make a PR with changes to files both inside and outside of `data/`.
- Changes to rule-bookmaker assignments MUST contain an updated `last_checked` field.
- Sports, markets and outcome keys must come from `data/sports.json` and
  `data/markets.json`. They are MB-Tracker's own keys, and inventing one here
  means the rule silently never matches a real bet. If you need a key that is
  not there yet, reach out first.
- Changes to the editor itself are allowed, but only to improve the UI/UX, not to extend functionality / modifying the data structure.

## Files, never to be touched
- `dev.sh`
- `.github/scripts/validate_data.py` — the data validator
- `.github/workflows/**`

If any of these files is changed, the PR will be rejected.
