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
	ID              string `json:"id"`
	PatientName     string `json:"patient_name"`
	Status          string `json:"status"`
	PriorityScore   int    `json:"priority_score"`
	ConfidenceScore int    `json:"confidence_score"`
	DecisionReason  string `json:"decision_reason"`
	FHIRBlob        interface{} `json:"fhir_blob"`
	EFaxPayload     string `json:"efax_payload"`
}

var db *sql.DB

func handleMatch(w http.ResponseWriter, r *http.Request) {
	setupCORS(&w, r)
	if r.Method == "OPTIONS" { return }
	
	// Fetch from Supabase
	rows, _ := db.Query("SELECT npi, full_name, specialty, accepted_payers, data_discrepancy_flag FROM providers")
	defer rows.Close()

	var providers []map[string]interface{}
	for rows.Next() {
		var npi int
		var name, specialty string
		var payers json.RawMessage
		var flag bool
		rows.Scan(&npi, &name, &specialty, &payers, &flag)
		providers = append(providers, map[string]interface{}{"npi": npi, "full_name": name, "specialty": specialty, "accepted_payers": payers, "data_discrepancy_flag": flag})
	}

	var reqBody map[string]string
	json.NewDecoder(r.Body).Decode(&reqBody)
	providersJSON, _ := json.Marshal(providers)
	
	prompt := fmt.Sprintf("Match these providers: %s to patient: %s. Return top 3 as JSON.", string(providersJSON), reqBody["patientContext"])
	resp, _ := callLLM(prompt, "You are a Matching Specialist.")
	w.Write(resp)
}

func handleHandoff(w http.ResponseWriter, r *http.Request) {
	setupCORS(&w, r)
	if r.Method == "OPTIONS" { return }
	var req HandoffRequest
	json.NewDecoder(r.Body).Decode(&req)

	var flag bool
	var payers json.RawMessage
	db.QueryRow("SELECT data_discrepancy_flag, accepted_payers FROM providers WHERE npi = $1", req.ProviderNPI).Scan(&flag, &payers)

	safety := ""
	if flag { safety = "Warning: Data Inconsistent." }

	systemPrompt := fmt.Sprintf(`Rules: 1. Step Therapy 2. Network Adequacy. 
	Safety: %s
	Return JSON: priority_score, confidence_score, decision_reason, fhir_blob, efax_payload.`, safety)
	
	prompt := fmt.Sprintf("Patient: %s, Plan: %s, Provider Payers: %s", req.PatientContext, req.PatientPlanID, string(payers))
	llmResp, _ := callLLM(prompt, systemPrompt)

	var auth Authorization
	json.Unmarshal(llmResp, &auth)
	auth.Status = "MANUAL_REVIEW"
	if auth.ConfidenceScore > 85 { auth.Status = "AUTO-APPROVED" }

	var patientID string
	db.QueryRow("INSERT INTO patients (name, clinical_history, insurance_id) VALUES ($1, $2, $3) RETURNING id", req.PatientName, req.PatientContext, strings.ToLower(req.PatientPlanID)).Scan(&patientID)

	fhirJSON, _ := json.Marshal(auth.FHIRBlob)
	db.QueryRow(`INSERT INTO authorizations (patient_id, provider_id, priority_score, status, fhir_blob, efax_payload, decision_reason, confidence_score) 
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, 
		patientID, req.ProviderNPI, auth.PriorityScore, auth.Status, fhirJSON, auth.EFaxPayload, auth.DecisionReason, auth.ConfidenceScore).Scan(&auth.ID)

	auth.PatientName = req.PatientName
	json.NewEncoder(w).Encode(auth)
}

func getQueue(w http.ResponseWriter, r *http.Request) {
	setupCORS(&w, r)
	rows, _ := db.Query(`SELECT a.id, p.name, a.status, a.priority_score, a.decision_reason, a.fhir_blob, a.confidence_score 
		FROM authorizations a JOIN patients p ON a.patient_id = p.id ORDER BY a.priority_score DESC`)
	defer rows.Close()

	var auths []Authorization
	for rows.Next() {
		var a Authorization
		var fhir interface{}
		rows.Scan(&a.ID, &a.PatientName, &a.Status, &a.PriorityScore, &a.DecisionReason, &fhir, &a.ConfidenceScore)
		a.FHIRBlob = fhir
		auths = append(auths, a)
	}
	json.NewEncoder(w).Encode(auths)
}

func callLLM(prompt, sys string) ([]byte, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	payload := map[string]interface{}{
		"model": "gpt-4o",
		"messages": []map[string]string{{"role": "system", "content": sys}, {"role": "user", "content": prompt}},
		"response_format": map[string]string{"type": "json_object"},
	}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, _ := (&http.Client{}).Do(req)
	defer resp.Body.Close()
	var result struct{ Choices []struct{ Message struct{ Content string } } }
	resBody, _ := io.ReadAll(resp.Body)
	json.Unmarshal(resBody, &result)
	return []byte(result.Choices[0].Message.Content), nil
}

func setupCORS(w *http.ResponseWriter, r *http.Request) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" { dbURL = "postgres://user:password@localhost:5432/hospitality_db?sslmode=disable" }
	db, _ = sql.Open("postgres", dbURL)
	defer db.Close()

	http.HandleFunc("/api/match", handleMatch)
	http.HandleFunc("/api/handoff", handleHandoff)
	http.HandleFunc("/api/queue", getQueue)
	fmt.Println("🚀 Agent Engine on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
