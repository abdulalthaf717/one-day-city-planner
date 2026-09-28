# One-Day City Planner: Interactive Demo Checklist & Walkthrough

Follow this step-by-step guide to run and evaluate the live application, demonstrate the interactive demo scenarios, test dynamic replanning, verify multimodal image understanding, and audit automated failure recovery.

---

## 1. Prerequisites & Launching the Application

1. Verify environment configuration in `.env.local`:
   ```bash
   GROQ_API_KEY=your_groq_api_key_here
   GROQ_MODEL=qwen/qwen3.8-27b
   GEOAPIFY_API_KEY=your_geoapify_api_key_here
   ```
2. Start the Next.js development server:
   ```bash
   npm run dev
   ```
3. Open your browser and navigate to:
   ```text
   http://localhost:3000
   ```

---

## 2. Interactive Demo Walkthrough

### Step 1: Load Hyderabad Heritage Scenario
1. At the top of the **Trip Planning Parameters** card, locate the **Quick Demo Scenarios** shortcut bar.
2. Click **[ ⚡ Load Hyderabad Scenario ]**.
   - *Start Point:* `VNR VJIET, Bachupally, Hyderabad`
   - *Destination:* `Secunderabad Railway Station, Hyderabad`
   - *Time Window:* `09:30` to `18:30` (9-hour window)
   - *Budget:* `₹2,000` (for 2 people)
   - *Travel Mode:* `Driving (drive)`
   - *Interests:* `History, Nature, Food`
3. Click the primary button: **[ Generate Optimized Plan ]**.
4. **Verify Generated Output:**
   - **4 KPI Summary Tiles:** Total Cost (`₹400`), Road Transit (`~65 min`), Activity Duration (`~285 min`), Safety Buffer (`~190 min`).
   - **Cost Breakdown Card:** Transparent cost accounting showing Known Costs (`₹400`), Estimated Costs (`₹0`), Free Activities (Lumbini Park & Hussain Sagar), and Unknown Fees count.
   - **Time & Schedule Flow Card:** Road-network transit attribution, safety buffer policy status (`Comfortable >15m`), and traffic buffer notice.
   - **Interactive Leaflet / OpenStreetMap Map:** Numbered circle markers for Start (`S`), intermediate stops (`1`, `2`, `3`), and End (`E`), with connected colored routing polylines and compliant OSM attribution (`© OpenStreetMap contributors`).
   - **Chronological Timeline:** Numbered sequence badges (`Stop 1: Golconda Fort`, `Stop 2: Charminar`, `Stop 3: Lumbini Park`), verified catalog tags, category durations, and authentic navigation links (no fabricated booking links).

---

### Step 2: Dynamic Replanning via Budget Cut (Surgical Invalidation)
1. In the Quick Demo Scenarios bar, click **[ 💰 Cut Budget to ₹1,000 ]**.
2. Click **[ Re-plan Itinerary ]**.
3. **Verify Agentic Replanning Behavior:**
   - **ChangeAlert Banner:** Appears above the summary showing:
     - *Constraint Diffs:* Budget updated from `₹2,000` $\to$ `₹1,000`.
     - *Plan Impacts:* Any dining or premium admissions exceeding the budget are pruned; total cost adapts to remain $\le$ ₹1,000.
     - *Surgical Invalidation:* Console logs confirm candidate places and route matrix were preserved from cache; zero duplicate Geoapify API credits consumed.

---

### Step 3: Travel Mode Switch (Drive → Walk)
1. In the Quick Demo Scenarios bar, click **[ 🚶 Switch to Walking ]**.
2. Click **[ Re-plan Itinerary ]**.
3. **Verify Invalidation & Recalculation:**
   - **ChangeAlert Banner:** Shows Travel Mode updated from `drive` $\to$ `walk`.
   - **Route Matrix Invalidation:** The Planner Agent invalidates the driving route matrix and recalculates walking durations for pedestrian transit speeds.
   - **Schedule Update:** Transit times increase realistically; stops re-order or prune to ensure arrival at Secunderabad Station strictly before the 18:30 deadline with $\ge 15$m safety buffer.

---

### Step 4: Multimodal Image Upload & Landmark Verification
1. Scroll down to the **"Add Landmark from Photo"** card on the right-hand panel.
2. Click the one-click demo button: **[ ⚡ Try Demo Photo: Charminar (Hyderabad) ]**.
   - An authentic photo of Charminar is loaded automatically into the upload dropzone.
3. Click **[ Analyze & Verify Photo ]**.
4. **Verify Multimodal Pipeline:**
   - **Visual Recognition:** Groq Vision (`qwen/qwen3.8-27b`) identifies the monument as `Charminar` (confidence: `98%`).
   - **Place Verification:** The name is cross-verified against factual Geoapify Places records in Hyderabad (`Charminar Rd, Old City`).
   - **Feasibility Buffer Check:** The system evaluates whether the 60 min visit + detour fits into the remaining schedule buffer.
   - **User Confirmation Card:** A card appears showing the photo thumbnail, verified name, address, category, admission cost (`₹50/person`), and feasibility status badge (`Feasible`).
5. Click **[ Add to Itinerary & Re-plan ]**.
6. **Verify Itinerary Integration:**
   - The itinerary re-optimizes with Charminar pinned as a priority stop.
   - The map updates with Charminar's marker and new routing legs.
   - The timeline reflects the added stop, cost adjustment, and updated arrival times.

---

### Step 5: Pre-Flight Validation & Error Handling
1. **Time Ordering Error:** Set Start Time to `18:00` and Latest Arrival to `10:00`.
   - Notice the inline error badge: *"Start time must be before destination arrival time."*
   - The submit button is disabled.
2. **Negative Budget:** Enter `-500` in the budget input.
   - Notice the inline error badge: *"Budget must be greater than zero."*
3. **Empty Location:** Clear the Starting Location field.
   - Notice the inline error badge: *"Starting location is required."*
4. **Unrecognized Location:** Enter `xyz987qwer_nonexistent_fictional_place_12345` as starting location and submit.
   - Notice the courteous error notification: *"Location Not Found: We couldn't identify that starting point. Try specifying the neighborhood or city."* Zero fake coordinates or crash traces.

---

## 3. Command-Line Verification Suite

Run the following commands in your terminal to verify all test suites and evaluation benchmarks:

```bash
# 1. Run all 7 test suites sequentially (Master Verification)
npm run test:all

# 2. Run the 20-Scenario Benchmark & 12 Rubric Metrics Suite
npm run test:evaluation

# 3. Verify TypeScript Compilation (Strict Mode, Zero Errors)
npx tsc --noEmit

# 4. Verify ESLint Compliance (Zero Warnings or Errors)
npm run lint

# 5. Verify Production Build
npm run build
```

### Expected Output Summary
- `npm run test:all`: **ALL 7 TEST SUITES PASSED (100% SUCCESS)**
  - `1. Tools & Geoapify API` [PASS]
  - `2. Candidate Place Discovery` [PASS]
  - `3. Deterministic Optimizer & Validator` [PASS]
  - `4. Planner Agent & Replanning` [PASS]
  - `5. Groq LLM Tool Calling` [PASS]
  - `6. Multimodal Vision & Verification` [PASS]
  - `7. Comprehensive Evaluation Benchmark` [PASS]
- `npm run test:evaluation`: **20/20 Scenarios PASS**, **5/5 Recovery Cases PASS**, **100% Constraint Success Rate**, **100% Deterministic Reproducibility Rate**, structured results written to `evaluation-results.json`.
