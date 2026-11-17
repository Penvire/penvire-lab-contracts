# Domain docs

## Layout

Domain documentation lives in [`penvire-lab-backend`](https://github.com/Penvire/penvire-lab-backend), not in this repository:

- `GLOSSARY.md` for domain vocabulary.
- `docs/adr/` for architecture decision records.

In the standard layout (`~/Projects/penvire`), that repository is checked out at `../backend` relative to this one.
Read it there; fall back to GitHub when the clone is missing.

## Before exploring

Read `GLOSSARY.md` when present, then `docs/adr/README.md` and the ADRs relevant to the work.

If domain documentation is missing, proceed silently.
Do not flag its absence or suggest creating it upfront.
The `domain-modeling` skill creates documentation lazily when terms or decisions are resolved.

## Vocabulary

Use glossary terms in issue titles, proposals, hypotheses and test names.
Avoid synonyms that the glossary explicitly rejects.
If a needed concept is absent, reconsider the term or note the gap for `domain-modeling`.

## Decisions

Surface conflicts with existing ADRs explicitly, including the ADR identifier and the reason for reopening the decision.
When recording decisions, follow the lifecycle, numbering, template and index rules in `docs/adr/README.md`.
