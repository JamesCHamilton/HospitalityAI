package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	_ "github.com/lib/pq"
)

type HandoffRequest struct {
	PatientContext string `json:"patientContext"`
	PatientName    string `json:"patientName"`
	PatientPlanID  string `json:"patientPlanId"`
	ProviderNPI    int    `json:"providerNpi"`
}

type Authorization struct {
	ID              string      `json:"id"`
	PatientName     string      `json:"patient_name"`
	Status          string      `json:"status"`
	PriorityScore   int         `json:"priority_score"`
	ConfidenceScore int         `json:"confidence_score"`
	DecisionReason  string      `json:"decision_reason"`
	FHIRBlob        interface{} `json:"fhir_blob"`
	EFaxPayload     string      `json:"efax_payload"`
}

type Provider struct {
	NPI                 int             `json:"npi"`
	FullName            string          `json:"full_name"`
	Specialty           string          `json:"specialty"`
	Address             string          `json:"address"`
	WaitTimeDays        int             `json:"wait_time_days"`
	AcceptedPayers      json.RawMessage `json:"accepted_payers"`
	YearsExperience     int             `json:"years_experience"`
	ClinicSize          int             `json:"clinic_staff_count"`
	OfficialWebsite     string          `json:"official_website"`
	DataDiscrepancyFlag bool            `json:"data_discrepancy_flag"`
}

var db *sql.DB

func handleMatch(w http.ResponseWriter, r *http.Request) {
	setupCORS(&w, r)
	if r.Method == "OPTIONS" {
		return
	}

	rows, err := db.Query(`
		SELECT npi, full_name, specialty, address, wait_time_days, years_experience, clinic_size, official_website, data_discrepancy_flag, accepted_payers
		FROM providers`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var providers []Provider
	for rows.Next() {
		var p Provider
		if err := rows.Scan(&p.NPI, &p.FullName, &p.Specialty, &p.Address, &p.WaitTimeDays, &p.YearsExperience, &p.ClinicSize, &p.OfficialWebsite, &p.DataDiscrepancyFlag, &p.AcceptedPayers); err != nil {
			log.Printf("Scan error: %v", err)
			continue
		}
		providers = append(providers, p)
	}

	var reqBody map[string]string
	json.NewDecoder(r.Body).Decode(&reqBody)

	providersJSON, _ := json.Marshal(providers)
	prompt := fmt.Sprintf("Analyze these providers: %s against patient: %s. Return top 3 matches in JSON.", string(providersJSON), reqBody["patientContext"])
	resp, _ := callLLM(prompt, "You are a healthcare matching specialist.")
	w.Write(resp)
}

func handleHandoff(w http.ResponseWriter, r *http.Request) {
	setupCORS(&w, r)
	if r.Method == "OPTIONS" {
		return
	}
	var req HandoffRequest
	json.NewDecoder(r.Body).Decode(&req)

	// 1. Fetch Provider Context (Step 2)
	var p Provider
	err := db.QueryRow(`
		SELECT npi, full_name, specialty, address, clinic_size, accepted_payers, data_discrepancy_flag
		FROM providers WHERE npi = $1`, req.ProviderNPI).Scan(&p.NPI, &p.FullName, &p.Specialty, &p.Address, &p.ClinicSize, &p.AcceptedPayers, &p.DataDiscrepancyFlag)
	if err != nil {
		http.Error(w, "Provider not found", http.StatusNotFound)
		return
	}

	// 2. Ensure Patient exists (Step 1 Persist)
	var patientID string
	err = db.QueryRow(`
		INSERT INTO patients (name, clinical_history, insurance_id)
		VALUES ($1, $2, $3)
		RETURNING id`,
		req.PatientName, req.PatientContext, strings.ToLower(req.PatientPlanID)).Scan(&patientID)
	if err != nil {
		// Fallback
		db.QueryRow(`SELECT id FROM patients WHERE name = $1 LIMIT 1`, req.PatientName).Scan(&patientID)
	}

	// 3. Safety Logic & Prompt Injection (Step 2 & 3)
	safetyWarning := ""
	if p.DataDiscrepancyFlag {
		safetyWarning = "Warning: Source data is inconsistent, prioritize manual verification."
	}

	systemPrompt := fmt.Sprintf(`You are an Insurance Adjudicator Reasoning Engine. 
	Safety Status: %s
	
	Rules Engine:
	1. Step Therapy: Check if the patient has tried conservative treatments (e.g., PT) before expensive procedures.
	2. Network Adequacy: Verify if the provider is in-network for the patient's plan.
	
	Tasks:
	1. Generate a FHIR JSON payload (fhir_blob).
	2. Generate a plain-text e-Fax fallback (efax_payload).
	3. Assign priority_score (0-100) based on clinical urgency.
	4. Assign confidence_score (0-100).
	5. Decision Reason: Explain based on Rules Engine.

	Return ONLY a JSON object with: priority_score, confidence_score, decision_reason, fhir_blob, efax_payload.`, safetyWarning)

	providerContext, _ := json.Marshal(p)
	prompt := fmt.Sprintf("Patient Context: %s, Plan: %s, Provider: %s", req.PatientContext, req.PatientPlanID, string(providerContext))
	llmResp, _ := callLLM(prompt, systemPrompt)

	var auth Authorization
	json.Unmarshal(llmResp, &auth)

	// Step 3: Confidence-based Auto-Adjudication
	auth.Status = "MANUAL_REVIEW"
	if auth.ConfidenceScore > 85 {
		auth.Status = "AUTO-APPROVED"
	}

	// 4. Save Authorization to DB (Step 3)
	fhirJSON, _ := json.Marshal(auth.FHIRBlob)
	err = db.QueryRow(`
		INSERT INTO authorizations (patient_id, provider_id, priority_score, status, fhir_blob, efax_payload, decision_reason, confidence_score)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id`,
		patientID, req.ProviderNPI, auth.PriorityScore, auth.Status, fhirJSON, auth.EFaxPayload, auth.DecisionReason, auth.ConfidenceScore).Scan(&auth.ID)
	if err != nil {
		log.Printf("Error saving authorization: %v", err)
	}

	auth.PatientName = req.PatientName
	json.NewEncoder(w).Encode(auth)
}

func getQueue(w http.ResponseWriter, r *http.Request) {
	setupCORS(&w, r)
	rows, err := db.Query(`
		SELECT a.id, p.name as patient_name, a.status, a.priority_score, a.decision_reason, a.fhir_blob, a.efax_payload, a.confidence_score
		FROM authorizations a
		JOIN patients p ON a.patient_id = p.id
		ORDER BY a.priority_score DESC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var authorizations []Authorization
	for rows.Next() {
		var a Authorization
		var fhir interface{}
		if err := rows.Scan(&a.ID, &a.PatientName, &a.Status, &a.PriorityScore, &a.DecisionReason, &fhir, &a.EFaxPayload, &a.ConfidenceScore); err != nil {
			log.Printf("Scan error: %v", err)
			continue
		}
		a.FHIRBlob = fhir
		authorizations = append(authorizations, a)
	}
	json.NewEncoder(w).Encode(authorizations)
}

func callLLM(prompt string, systemPrompt string) ([]byte, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	url := "https://api.openai.com/v1/chat/completions"

	payload := map[string]interface{}{
		"model": "gpt-4o",
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": prompt},
		},
		"response_format": map[string]string{"type": "json_object"},
	}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Choices []struct{ Message struct{ Content string } }
	}
	resBody, _ := io.ReadAll(resp.Body)
	json.Unmarshal(resBody, &result)
	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("no choices returned")
	}
	return []byte(result.Choices[0].Message.Content), nil
}

func setupCORS(w *http.ResponseWriter, r *http.Request) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://user:password@localhost:5432/hospitality_db?sslmode=disable"
	}

	var err error
	db, err = sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	http.HandleFunc("/api/match", handleMatch)
	http.HandleFunc("/api/handoff", handleHandoff)
	http.HandleFunc("/api/queue", getQueue)
	fmt.Println("🚀 Agent Reasoning Engine running on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
