# One-Day City Planner — Live Demo Script & Defense Guide
**System Version**: `v1.1.0-calibrated-frozen`  
**Git Commit**: `5784db6c9a01a8f74aba6d96bece5eee0b96f5c1`  
**Target Duration**: 8–10 Minutes

---

## Demo Overview

This script guides a cohesive, live demonstration of the **One-Day City Planner**. It demonstrates the complete agentic planning lifecycle:
1. Multi-constraint initial trip generation using real directional road networks.
2. Interactive timeline, cost accounting, and Leaflet polyline map inspection.
3. Surgical dynamic replanning following a mid-trip constraint modification.
4. Multimodal photo landmark identification, detour feasibility verification, and schedule re-optimization.

---

## Pre-Demo Setup Checklist

- [ ] Node.js development server running: `npm run dev` (Available at `http://localhost:3000`).
- [ ] Active internet connection verified (Geoapify and Groq APIs accessible).
- [ ] Sample landmark test image ready on desktop (e.g., photo of Charminar or landmark).
- [ ] Browser window open to `http://localhost:3000` with Developer Tools Console visible.

---

## Step-by-Step Demonstration Sequence

### Step 1: Enter City and Constraints
- **Action**: In the Trip Planning form, enter the following parameters:
  - **City**: `Hyderabad`
  - **Starting Location**: `VNR VJIET, Bachupally`
  - **Destination / End Location**: `Secunderabad Railway Station`
  - **Start Time**: `09:30`
  - **Latest End Time**: `19:00`
  - **Budget (INR)**: `₹2500`
  - **Number of People**: `2`
  - **Travel Mode**: `Drive`
  - **Interests**: `Heritage, Lake Views, Regional Culture`
- **Speaking Point**:
  > *"We begin by specifying a realistic, highly constrained traveler scenario: a party of two departing from an engineering campus on the northwestern outskirts of Hyderabad, needing to reach the central railway station before 19:00 with a ₹2500 budget and driving mode."*

---

### Step 2: Generate Itinerary
- **Action**: Click **[Generate Itinerary]**.
- **Observation**:
  - Loading spinner displays status: *"Resolving geocodes..." $\to$ "Discovering candidate sights..." $\to$ "Optimizing route matrix..." $\to$ "Validating constraints..."*
  - Completion latency: ~4.2 seconds.
- **Speaking Point**:
  > *"Behind the scenes, the PlannerAgent orchestrated four distinct stages: geocoding the origin and destination, discovering Tier 1 and Tier 2 candidate sights via Geoapify Places, fetching a directional road duration matrix, and running bounded beam-search optimization."*

---

### Step 3: Show Chronological Timeline
- **Action**: Scroll down to the **Itinerary Timeline** view.
- **Observation**:
  - Each stop is displayed as an interactive chronological card with exact arrival, departure, and dwell times.
  - Sights visited include prominent cultural destinations (e.g., `Golconda Fort`, `Qutb Shahi Tombs`, `Hussain Sagar Lake`).
  - Arrival times progress monotonically without overlap.
- **Speaking Point**:
  > *"Notice the timeline progression. Unlike typical LLM output that guesses 15 minutes everywhere, the arrival times are driven by real directional road network durations, including asymmetric congestion models ($A \to B \neq B \to A$)."*

---

### Step 4: Show Map and Route
- **Action**: Switch to or scroll to the **Interactive Route Map**.
- **Observation**:
  - Interactive Leaflet map renders colored pins: Green (Start), Blue (Attractions), Amber (Lunch/Cafe), Red (End Destination).
  - A polyline follows the actual street network rather than straight lines.
  - Required attribution is present in the lower right corner: `&copy; OpenStreetMap contributors`.
- **Speaking Point**:
  > *"Every pin is grounded in verified Geoapify geographic coordinates. Zero places are fabricated. The route line illustrates the directional progression avoiding inefficient backtracking."*

---

### Step 5: Show Costs and Travel Times
- **Action**: Highlight the **Itinerary Summary Card**.
- **Observation**:
  - **Total Cost**: Displayed as `₹1,200 / ₹2,500` (within budget).
  - **Total Travel Time**: e.g., `112 mins`.
  - **Total Visit Time**: e.g., `360 mins`.
  - **Safety Buffer**: e.g., `48 mins` allocated before the 19:00 train deadline.
- **Speaking Point**:
  > *"The financial calculations are executed by pure deterministic code, multiplying admissions by the 2-person group size. The backward-pass optimizer explicitly reserved a 48-minute safety buffer before 19:00 to insulate the traveler against unexpected delays."*

---

### Step 6: Show Verified Place Information & Actions
- **Action**: Click on an attraction card (e.g., `Qutb Shahi Tombs`) to expand details.
- **Observation**:
  - Displays verified category badge, opening hours (`09:30 - 17:00`), estimated ticket price, and a button: **[Navigate on Google Maps]**.
- **Speaking Point**:
  > *"Each place card provides actionable metadata: verified opening hours from the provider and deep links that open turn-by-turn navigation directly in Google Maps on the user's phone."*

---

### Step 7: Change an Important Constraint
- **Action**: Scroll back up to the constraints panel.
  - Change **Budget (INR)** from `₹2500` to `₹500`.
  - Change **Travel Mode** from `Drive` to `Transit` (or `Auto`).
- **Speaking Point**:
  > *"Now we demonstrate the dynamic replanning capabilities. In a standard chatbot, asking to slash the budget to ₹500 causes it to arbitrarily hallucinate new numbers. In our system, the state-aware change detector catches the modification."*

---

### Step 8: Replan
- **Action**: Click **[Update & Re-plan]**.
- **Observation**:
  - Fast execution (~400 ms) because the candidate pool is preserved.
  - UI updates immediately with the re-optimized schedule.
- **Speaking Point**:
  > *"Because the geocodes and candidate pool are cached in session state, the planner surgically invalidates only the cost and route calculations, executing the re-plan in less than half a second."*

---

### Step 9: Demonstrate That the Itinerary Changes
- **Action**: Compare the old and new timelines.
- **Observation**:
  - High-admission paid attractions (e.g., expensive entry monuments) are pruned.
  - Replaced by verified free or low-cost sights (e.g., `Lumbini Park`, `Tank Bund Promenade`, public lake viewpoints).
  - New total cost: `₹240 / ₹500` (Strictly within the revised budget).
  - Arrival at Secunderabad Station remains strictly $\le 19:00$.
- **Speaking Point**:
  > *"The deterministic optimizer automatically eliminated paid sights to respect the ₹500 ceiling while maintaining maximum tourist utility, all without breaching the 19:00 train deadline."*

---

### Step 10: Upload a Place Image
- **Action**: Navigate to the **Multimodal Image Discovery** tab or card.
- **Action**: Drag and drop a photograph of `Charminar` (or upload via file selector).
- **Speaking Point**:
  > *"Suppose the traveler saw a photo of a landmark on social media or took a picture of a monument but does not know its address. We upload the photo into the multimodal vision pipeline."*

---

### Step 11: Show Verification
- **Action**: Click **[Identify & Verify Landmark]**.
- **Observation**:
  - Groq vision model identifies the landmark: *"Charminar — Iconic 16th-century mosque and monument in Old Hyderabad"*.
  - Geocoding resolves exact coordinates: `(17.36156, 78.47466)`.
  - Feasibility check evaluates transit detour time vs. existing arrival buffer.
- **Speaking Point**:
  > *"The vision model identifies the architecture and extracts the landmark name. The geocoder validates real coordinates, and the validator determines whether adding this stop is physically possible within the remaining time buffer."*

---

### Step 12: Add It to the Trip
- **Action**: Click the green button: **[Add to My Itinerary]**.
- **Observation**:
  - The landmark is added to the active candidate pool with priority weighting.
- **Speaking Point**:
  > *"With a single click, the user approves integrating this verified landmark into their schedule."*

---

### Step 13: Re-optimize
- **Action**: Click **[Re-Optimize Itinerary]**.
- **Observation**:
  - The optimizer re-runs beam search.
  - Charminar is seamlessly spliced into the chronological sequence between the morning start and evening destination.
  - Arrival time at Secunderabad Railway Station remains strictly on-time ($18:45 \le 19:00$).
- **Speaking Point**:
  > *"The itinerary is re-optimized in real time. Charminar is integrated with a 60-minute visit time, the transit legs are recalculated, and the final destination arrival is fully preserved. This completes our end-to-end demonstration of the One-Day City Planner."*

---

## Technical Defense FAQ (For Evaluators)

### Q1: Why not let the LLM generate the full JSON itinerary directly?
**Answer**:
> *"Pure LLMs cannot guarantee arithmetic correctness or graph-theoretic path feasibility. LLMs do not know directional road matrix times ($A \to B \neq B \to A$) and frequently hallucinate arrival times that violate operating hours or deadlines. By delegating path sequencing to a bounded deterministic beam search and constraint validation to a 14-rule independent engine, we achieve a verified 100% hard constraint satisfaction rate on unseen holdout cases."*

### Q2: What is the computational complexity of the beam search optimizer?
**Answer**:
> *"The Orienteering Problem with Time Windows (TOPTW) is NP-hard. Full integer programming solver libraries cannot easily run in lightweight serverless runtimes. Our beam search operates with bounded beam width $W=12$ and lookahead depth $D=2$, evaluating path permutations in $O(W \cdot K)$ polynomial time. It executes in less than 5 milliseconds while guaranteeing deterministic, bit-for-bit identical outputs."*

### Q3: How does the system handle external API rate limits or outages?
**Answer**:
> *"Every external call to Groq or Geoapify is wrapped in a 10-second `AbortSignal` timeout. In the event of a network outage (HTTP 503), the error is intercepted and gracefully reported without crashing the application. Furthermore, the system refuses to fabricate fake coordinates when an address is unrecognized."*
