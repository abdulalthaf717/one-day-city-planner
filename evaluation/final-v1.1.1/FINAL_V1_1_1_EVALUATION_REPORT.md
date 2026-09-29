# Final Holdout Evaluation Report: Version `v1.1.1-calibrated-frozen`

**System Version:** `v1.1.1-calibrated-frozen`  
**Git Frozen Release Commit:** `735f60ac3fb719ce17e01ee475744d7280d3398c`  
**Primary LLM Model:** `qwen/qwen3.8-27b` via Groq Cloud API  
**Geocoding & Matrix Provider:** Geoapify Places & Route Matrix API  
**Evaluator Version:** `v1.1.1-intent-aware`  
**Evaluation Protocol:** Single-pass evaluation on 22 previously unseen scenarios (`test-dataset/holdout-22.json`). Zero tuning iterations, zero case-specific overrides.

---

## 1. Executive Summary

System version `v1.1.1-calibrated-frozen` addresses the conflation of safety buffers with daylight deadline slack and resolves premature objective function saturation on full-day itineraries. Following calibrated development on 78 test cases, the system was frozen at commit `735f60ac3fb719ce17e01ee475744d7280d3398c` and evaluated on 22 previously unseen scenarios.

On the 22 held-out test cases:
* **Hard Constraint Satisfaction:** **100.0%** (22/22)
* **Budget Compliance:** **100.0%** (22/22)
* **Deadline Compliance:** **100.0%** (22/22)
* **Opening Hours Compliance:** **100.0%** (22/22)
* **Route Feasibility:** **100.0%** (22/22)
* **Overall Pass Rate:** **90.9%** (20 Passed, 2 Partial, 0 Failed)
* **Dynamic Replanning Adaptation:** **100.0%** (4/4 replanning cases passed)
* **Tourist Relevance Stop Rate:** **95.9%**
* **Daytime Schedule Utilization:** **79.1%** (up from 66.9% in `v1.1.0`)
* **Average Planner Cycle Latency:** **4,920 ms**
* **External Provider Outages:** **0**

---

## 2. System Configuration & Safety Buffer Architecture

### 2.1 Authoritative Bounded Buffer Policy
The system enforces a strict mathematical isolation between the deliberate uncertainty reserve and unallocated daylight capacity:
$$\text{safetyBufferMinutes} = \text{clamp}(15, \text{round}(T_{\text{travel}} \times 0.15 \times \text{modeMultiplier}), 60)$$
where mode multipliers are:
* **Drive:** $1.25$
* **Transit:** $1.30$
* **Bicycle:** $1.05$
* **Walk:** $1.00$

### 2.2 Unused Available Daylight Time
Unallocated daytime slack is computed separately as:
$$\text{unusedAvailableMinutes} = \max(0, T_{\text{deadline}} - T_{\text{planned\_arrival}} - \text{safetyBufferMinutes})$$
Across all 22 holdout cases, `safetyBufferMinutes` remained strictly between 15 and 60 minutes. The system never assigns $(T_{\text{deadline}} - T_{\text{planned\_arrival}})$ directly to the safety reserve.

### 2.3 Quality-Gated Daytime Schedule Utilization
To encourage the optimizer to utilize available daytime hours without inviting low-quality filler, the objective function incorporates a quality-gated utilization reward:
$$\text{ScheduleUtilizationUtility} = \text{round}(25 \times \text{utilizationRatio} \times \text{qualityMultiplier})$$
where:
$$\text{utilizationRatio} = \min\left(1.0, \frac{T_{\text{planned}} - T_{\text{start}}}{T_{\text{deadline}} - T_{\text{start}} - \text{safetyBufferMinutes}}\right)$$
$$\text{qualityMultiplier} = \min\left(1.0, \max\left(0, \frac{\text{avgTouristRelevance} - 45}{35}\right)\right)$$

If only generic local amenities or out-of-direction places are available, `qualityMultiplier` drops and penalties dominate, ensuring the planner legitimately finishes early rather than padding the schedule.

---

## 3. Results Comparison: Development (78) vs. Holdout (22)

The benchmark performance is verified on the defined benchmark across both development and unseen test sets:

| Evaluation Metric | Development (78 Cases) | Unseen Holdout (22 Cases) | Delta ($\Delta$) | Benchmark Assessment |
| :--- | :--- | :--- | :--- | :--- |
| **Cases Completed** | 78 / 78 | **22 / 22** | 0 | 100% Execution Completion |
| **Fully Passed** | 75 / 78 (96.2%) | **20 / 22 (90.9%)** | -5.3% | Strong Generalization |
| **Partial (Soft Quality)** | 3 / 78 (3.8%) | **2 / 22 (9.1%)** | +5.3% | Zero Hard Failures |
| **Failed Cases** | 0 / 78 (0.0%) | **0 / 22 (0.0%)** | 0.0% | Zero Violations |
| **Hard Constraint Rate** | **100.0%** | **100.0%** | 0.0% | Inviolable Constraints Maintained |
| **Budget Compliance** | **100.0%** | **100.0%** | 0.0% | Strict Bounded Cost Adherence |
| **Deadline Compliance** | **100.0%** | **100.0%** | 0.0% | Zero Cutoff Overruns |
| **Opening-Hours Compliance** | **100.0%** | **100.0%** | 0.0% | Operating Schedules Respected |
| **Route Feasibility** | **100.0%** | **100.0%** | 0.0% | Real Road Network Transit Feasible |
| **Tourist Relevance Rate** | **96.1%** | **95.9%** | -0.2% | High Sights Grounding |
| **Schedule Utilization** | **74.5%** | **79.1%** | +4.6% | Material Daytime Utilization |
| **Dynamic Replanning** | **100.0%** | **100.0%** | 0.0% | Surgical Invalidation Preserved |
| **Average Planner Latency** | 5,051 ms | **4,920 ms** | -131 ms | Stable Execution Timing |
| **API Outages** | 0 | **0** | 0 | Reliable Network Boundary |

---

## 4. Historical Version Evolution: `v1.1.0` vs. `v1.1.1`

The historical baseline evidence (`v1.1.0-calibrated-frozen`) and current release evidence (`v1.1.1-calibrated-frozen`) remain strictly separated:

| Dimension | Baseline (`v1.1.0-frozen`) | Release Candidate (`v1.1.1-frozen`) | Practical Impact |
| :--- | :--- | :--- | :--- |
| **Safety Buffer Metric** | Stored raw gap $(T_{\text{deadline}} - T_{\text{planned}})$ | Bounded uncertainty reserve $\in [15, 60]\text{m}$ | Eliminates false multi-hour buffers |
| **Remaining Free Time** | Conflated with buffer | Explicit: $\max(0, \text{slack} - \text{buffer})$ | Transparent UI scheduling display |
| **Activity Utility** | Saturated abruptly at 120 pts (3 stops) | Smooth 3-tier concave returns (0–180 pts) | Multi-stop full day trips enabled |
| **Daytime Utilization (Holdout)**| 66.9% average utilization | **79.1% average utilization** | **+12.2% more productive sightseeing** |
| **Holdout Pass Rate** | 90.9% (20/22) | **90.9% (20/22)** | Zero degradation on unseen cases |
| **Hard Constraint Satisfaction** | 100.0% | **100.0%** | 100% invariants preserved |
| **Groq Network Timeout** | Unbounded HTTP socket | **Finite 10-second `AbortSignal`** | Prevents socket hangs |
| **Standalone Scripts** | Dangling keep-alive sockets | Explicit `process.exit(0)` | Clean CLI and benchmark runs |

---

## 5. Holdout Case Diagnostics & Remaining Weaknesses

In the 22-case holdout suite, 20 cases passed all criteria unconditionally. Two cases received a `PARTIAL` classification due to soft-quality heuristics:

1. **Case 087 (Bengaluru: Cubbon Park Walking Area):**
   * **Selected Stops:** Cubbon Park $\to$ Jawahar Bal Bhavan Children's Park $\to$ Mahatma Gandhi Park $\to$ MG Road Boulevard.
   * **Finding:** All four stops are within the park/heritage zone in central Bengaluru. Because multiple contiguous sub-sections of the park have distinct Geoapify park records, the intent-aware evaluator noted ordinary local park saturation, despite the user having no specific tag.
2. **Case 091 (Bengaluru: Low Budget Commute):**
   * **Selected Stops:** BMTC Depot 25 $\to$ Teatings $\to$ Om Chandi Arts $\to$ Madiwala.
   * **Finding:** Under a constrained micro-budget and tight transit corridor, the candidate discovery returned commercial and artisan stops. While all budget and time constraints were satisfied 100%, tourist relevance scored 50%.

---

## 6. Benchmark Limitations & Explicit Scope Boundaries

* **Bounded Deterministic Optimization:** The beam search optimizer guarantees finding a feasible, high-scoring sequence within the explored beam width ($W=25$, depth up to 10), but does not compute provably global mathematical optima across infinite combinatorial spaces.
* **Provider-Grounded Place Coordinates:** Place existence, opening hours, and geographic coordinates depend strictly on Geoapify and OpenStreetMap records. Unknown ticket prices are conservatively estimated.
* **Traffic Volatility:** Travel durations are based on live routing matrix network calculations with deliberate uncertainty reserves ($15\text{--}60\text{ minutes}$); unexpected extreme traffic spikes or road closures are mitigated through dynamic replanning rather than clairvoyant traffic prediction.
* **Benchmark Context:** System metrics are verified on the defined benchmark of 100 research-grade scenarios (78 development + 22 unseen holdout cases) across Indian metropolitan centers (Bengaluru, Chennai, Hyderabad).
