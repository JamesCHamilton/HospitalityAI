# HospitalityAI - The Frictionless Healthcare Referral Engine

**HospitalityAI** is an end-to-end clinical orchestration platform designed to eliminate the "20-day referral gap." By combining AI-powered document extraction, real-time practice enrichment, and automated insurance adjudication, we transform messy clinical data into instant, authorized medical matches.

---

## 🚀 The Vision
In the current healthcare system, getting a specialist referral authorized by insurance takes weeks of manual faxing and phone calls. HospitalityAI automates this entire lifecycle:
1. **Intake**: Parses messy medical PDFs instantly.
2. **Match**: Connects patients to "Best Fit" providers enriched with real-world practice data.
3. **Authorize**: Uses an AI Rules Engine to auto-adjudicate insurance claims, moving from weeks to milliseconds.

---

## 🏗️ System Architecture

### 1. Ingestion Layer (Unsiloed AI Gateway)
- **Tech**: Python FastAPI + Unsiloed AI API.
- **Function**: Accepts patient referral PDFs or manual forms. If a PDF is provided, Unsiloed AI extracts structured clinical context, patient intent, and insurance details using a custom JSON schema.
- **Impact**: Eliminates manual data entry and human error in clinical intake.

### 2. Data Enrichment Layer (Source of Truth)
- **Tech**: Python ETL + NYC Open Data + Crustdata API.
- **Function**: Joins the federal NPI registry with NYC Health Facility metadata. Enriches provider profiles with real-time "practice pulse" metrics from **Crustdata**, including clinic headcount, official websites, and employee growth.
- **Impact**: Provides the AI with a high-fidelity map of provider capacity and specialized capabilities.

### 3. Reasoning Layer (AI Adjudicator)
- **Tech**: OpenAI GPT-4o + Blaxel Logic.
- **Function**: 
    - **Matching**: Ranks providers based on a multi-factor `BEST_FIT_DEFINITION` (Insurance, Specialty, Distance, Wait Time).
    - **Adjudication**: Evaluates clinical context against **Step Therapy** and **Network Adequacy** rules.
- **Impact**: Automatically approves or denies claims based on medical necessity and policy compliance.

### 4. Persistence & Observability Layer
- **Tech**: Supabase (PostgreSQL) + Realtime.
- **Function**: A central "Source of Truth" for all providers and patients. The **Supabase Realtime** publication ensures the Insurance Dashboard reflects AI decisions the millisecond they are calculated.

---

## 🛠️ Tech Stack
- **Frontend**: Next.js, TailwindCSS, Lucide Icons.
- **Backend**: Python FastAPI, SQLAlchemy (ORM).
- **Database**: Supabase (PostgreSQL with Realtime enabled).
- **AI/ML**: Unsiloed AI (Document Extraction), OpenAI GPT-4o (Reasoning), Crustdata (Business Intelligence).

---

## ❓ Deep-Dive FAQ for Judges

### 🛠️ Technical & Data Engineering
**Q: How do you handle the "Cold Start" problem for new providers?**
**A:** When a new NPI is detected, our **Ingestion Service** automatically triggers a **Crustdata** enrichment sweep. We don't just wait for a match; we proactively build the "Source of Truth" by searching for clinic digital footprints to ensure every provider has a baseline capacity score before they enter the reasoning pool.

**Q: Why did you choose FastAPI over a traditional monolith?**
**A:** The asynchronous nature of FastAPI is critical for our **Unsiloed AI** integration. Document extraction is a multi-second process; using `asyncio` allows our gateway to handle multiple concurrent PDF uploads without blocking the main event loop, maintaining a responsive UI for the patient.

**Q: How do you ensure the Join between NYC Data and NPI is accurate?**
**A:** We use a weighted heuristic. We first match on the NPI location address. If the street address matches an NYC Health Facility record, we have high confidence. If not, we fall back to a "fuzzy match" on the Organization Name. If both fail, we flag the record with a `data_discrepancy_flag` to alert the AI Agent.

**Q: Is your database schema optimized for search?**
**A:** Yes. We use **PostgreSQL JSONB** columns for `accepted_payers` and `fhir_blob`. This allows us to perform efficient GIN-indexed searches across insurance plans while maintaining the flexibility to store complex FHIR resource structures without rigid table migrations.

### 🩺 Clinical Reasoning & Safety
**Q: How does the AI calculate the "Priority Score"?**
**A:** The **Reasoning Engine** (GPT-4o) performs a clinical triage based on the extracted `clinical_history`. It looks for "Red Flag" keywords (e.g., *chest pain*, *radiating*, *shortness of breath*) to assign high scores (90+), while routine consults (e.g., *annual checkup*, *mild rash*) receive lower scores (20-40).

**Q: How do you prevent AI "Hallucinations" in medical decisions?**
**A:** We use **Constrained Output**. By enforcing a strict JSON schema via the `response_format` API, we ensure the AI only provides data within our defined bounds (e.g., specific status enums). Furthermore, any match with a confidence score < 85% is strictly routed to `MANUAL_REVIEW`.

**Q: What is the "Step Therapy" rule exactly?**
**A:** In insurance, Step Therapy requires patients to try less expensive or less invasive treatments first. For example, if a patient is referred for a *Knee Replacement* but the clinical history doesn't mention *Physical Therapy*, our AI Adjudicator detects this "skip" and flags the claim for review or denial.

**Q: How do you handle Provider Gender or Cultural preferences?**
**A:** These are handled in the `BEST_FIT_DEFINITION`. Unlike medical necessity (which is binary), these are "Soft Constraints." If a patient specifies a preference for a "Female" provider, the AI re-ranks the top matches to prioritize gender alignment while still maintaining the "In-Network" requirement.

### 💼 Business & Integration
**Q: How is this different from a standard EHR like EPIC?**
**A:** EHRs are "Islands of Data." **HospitalityAI** is the "Bridge." We sit *between* disparate hospital systems, using **Unsiloed AI** to read documents that EHRs normally ignore (PDF faxes) and **Crustdata** to find metrics that EHRs don't track (real-time clinic growth and web presence).

**Q: What is the FHIR vs. e-Fax dual-output strategy?**
**A:** We recognize that healthcare is in a transition state. Modern practices use **FHIR APIs** for interoperability, but 70% of referrals still happen via fax. We generate both: a machine-readable JSON bundle for modern systems and a formatted clinical memo for legacy fax machines.

**Q: How does Supabase Realtime improve the user experience?**
**A:** In a typical insurance portal, a staff member has to refresh the page to see new claims. With **Supabase Realtime**, our dashboard "listens" to the database. The moment the Python Reasoning Engine saves an adjudication, it "pops" onto the Insurance Dashboard without a refresh, simulating a truly automated live environment.

**Q: What is your "Source of Truth" strategy?**
**A:** Our Source of Truth isn't just one database—it's the *verified union* of three. NPI (Registry) + NYC Data (Facility Metadata) + Crustdata (Business Metrics). This triad allows our AI to make decisions based on where a doctor is *registered*, where they *practice*, and how *busy* they actually are.

### 🚀 Future Roadmap
**Q: Can this handle multi-payer environments?**
**A:** Yes. The `accepted_payers` array is designed to hold dozens of plan IDs. The AI Adjudicator can be scaled to support different "Rule Books" for different insurance carriers (e.g., UnitedHealthcare vs. Medicare).

**Q: Could you integrate scheduling?**
**A:** Absolutely. Since **Crustdata** gives us the `official_website`, our next step would be to scrape or integrate with the provider's booking API (like Zocdoc or MyChart) to allow the patient to book the appointment the moment the AI authorizes the claim.

---

## 📈 Demo Instructions
1. **Intake**: Go to the Patient Portal, fill in "John Doe," and attach a referral PDF.
2. **Refine**: Set your preferences (Specialization: Cardiology, Max Wait: 10 days).
3. **Match**: Select the top match generated by the AI.
4. **Observe**: Open the **Insurance Dashboard** in a separate tab to see the claim appear and adjudicate in real-time via Supabase.
5. **Review**: Check the **Provider Inbox** to see the generated FHIR bundle and e-Fax referral.
