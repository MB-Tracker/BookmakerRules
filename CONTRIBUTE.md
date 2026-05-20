# Contribution Guidelines

When contributing to this repository, please follow these guidelines:

- Do not make a PR with changes to files both inside and outside of `data/`.
- Changes to rule-bookmaker assignments MUST contain an updated `last_checked` field.
- Changes to the editor itself are allowed, but only to improve the UI/UX, not to extend functionality / modifying the data structure.

## Files, never to be touched
- `reader.py` - exposes data
- `__init__.py`
- `dev.sh`

If any of these files is changed, the PR will be rejected.
