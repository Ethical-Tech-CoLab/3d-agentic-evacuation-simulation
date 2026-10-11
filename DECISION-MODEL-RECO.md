# Decision-model recommendation: source annotations outside simulation

Date: 2026-10-11. Public-source proposal; no live experiment.
Reviewed [README](https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation/blob/513d6d5ba689ba0fc0494ce8dc4572f0e09e825f/README.md).
Assessment is document-led, not a validation of evacuation behavior.

## Recommendation

Keep road routing, population partitions, agent transitions and simulation
arithmetic outside decision models. The project distinguishes sourced county
cohort proportions from modeled district populations and visitor assumptions.
A model must not erase those distinctions or infer individual vulnerability.

Test only offline source-to-assumption annotation: does a public reference
support the population/geography/time scope of a scenario input? Output
supports / partially supports / not established / insufficient evidence.
Retain source IDs and human review; do not alter simulation parameters.

## Evaluation

Compare a source checklist and exact geographic/date checks with local
classifiers, Jev's [citation pattern](https://docs.typesafe.ai/cookbooks/citation_check.md),
Microsoft-Decision-1 and Sage on the same public cases.
Split by city/source/assumption family. Include county-versus-district,
resident-versus-visitor and observed-versus-modeled mismatches.
Measure false support, recall of unsupported assumptions, calibration,
reviewer effort and total accepted-annotation cost.

## Hard gate

No live evacuation advice, prioritization of people, route-safety verdicts or
model-generated demographic probabilities. Preserve original runs and the
declared synthetic nature of the experiment. Local alternatives require
separate license/hardware checks; exact proprietary checkpoints are not local.
Start with read-only annotations and retain no-model mode. No savings claimed.
