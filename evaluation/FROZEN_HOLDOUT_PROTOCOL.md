# FROZEN HOLDOUT EVALUATION PROTOCOL

## 1. Objective and Integrity Declaration
This document defines the strict, inviolable protocol governing the evaluation of the **22 Held-Out Test Cases** (`test-dataset/holdout-22.json`).

Throughout all phases of development, calibration (Iterations 0 and 1), and evaluation corrections:
- The 22 holdout cases have **NEVER** been inspected by the engineering team or agent.
- The holdout cases have **NEVER** been executed against any iteration of the planner.
- No algorithmic parameters, heuristic weights, category rankings, or test criteria have been influenced by or tuned against the holdout set.

---

## 2. Frozen System State
- **System Version**: `v1.1.0-calibrated-frozen`
- **Model Engine**: Groq API (`qwen/qwen3.8-27b`)
- **Geographic & Routing Provider**: Geoapify REST APIs (Geocoding, Places, Route Matrix) with 10-second timeout guards
- **Optimization Core**: Deterministic Beam Search ($W=12$, $D=2$) with Pareto multi-objective scoring
- **Validation Engine**: 14 hard constraint deterministic checks (Budget, Deadlines, Operating Hours, Monotonic Route Physics, Non-overlapping Activities, Zero Fabrication)
- **Evaluator**: Semantic Intent-Aware Evaluator v2.0.0 with tight-trip physical realism

---

## 3. Holdout Evaluation Rules
1. **Single-Pass Execution**: The 22 holdout cases must be executed exactly **once** without iterative trial-and-error or post-hoc adjustments.
2. **Zero Code Changes**: No modifications to `src/`, `scripts/`, or configuration files are permitted between development freeze and holdout execution.
3. **Identical Evaluator**: The holdout run must use the identical intent-aware semantic evaluator (`v2.0.0`) that evaluated the 78 development cases.
4. **Transparent Diagnostics**: Any failures, partial passes, or constraint breaches on holdout cases must be reported transparently and attributed honestly without system modifications.
5. **No Data Leakage**: The holdout results will serve as the final unbiased benchmark of generalizability across unseen scenarios, constraints, and cities.

---

## 4. Evaluation Targets & Success Criteria
For the holdout dataset to confirm production readiness:
- **Hard Constraint Satisfaction**: Must achieve $\ge 95\%$ (Target: 100%).
- **Primary Intent Relevance Rate**: Must achieve $\ge 90\%$.
- **Tourist Relevance Stop Rate**: Must achieve $\ge 85\%$.
- **Dynamic Replanning Success**: Must achieve $100\%$ on all adaptive change scenarios.
- **Fabrication Rate**: Strictly $0\%$ (100% verified real geographic entities).
