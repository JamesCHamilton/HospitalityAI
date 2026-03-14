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

type Claim struct {
	ClaimID        string `json:"claim_id"`
	PatientName    string `json:"patient_name"`
	Status         string `json:"status"`
	PriorityScore  int    `json:"priority_score"`
	DecisionReason string `json:"decision_reason"`
	FHIRPayload    string `json:"fhir_payload"`
	EFaxPayload    string `json:"efax_payload"`
}

type Provider struct {
	NPI                 int      `json:"npi"`
	FullName            string   `json:"full_name"`
	Specialty           string   `json:"specialty"`
	Address             string   `json:"address"`
	WaitTimeDays        int      `json:"wait_time_days"`
	AcceptedPlans       []string `json:"accepted_plans"`
	YearsExperience     int      `json:"years_experience"`
	ClinicSize          int      `json:"clinic_staff_count"`
	OfficialWebsite     string   `json:"official_website"`
	DataDiscrepancyFlag bool     `json:"data_discrepancy_flag"`
}

var db *sql.DB

func handleMatch(w http.ResponseWriter, r *http.Request) {
	setupCORS(&w, r)
	if r.Method == "OPTIONS" {
		return
	}

	rows, err := db.Query(`
		SELECT p.npi, p.full_name, p.specialty, p.address, p.wait_time_days, p.years_experience, p.clinic_size, p.official_website, p.data_discrepancy_flag,
		       COALESCE(array_agg(i.id), '{}') as accepted_plans
		FROM provider p
		LEFT JOIN provider_insurance pi ON p.npi = pi.provider_npi
		LEFT JOIN insurance i ON pi.insurance_id = i.id
		GROUP BY p.npi`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var providers []Provider
	for rows.Next() {
		var p Provider
		var plans []string
		if err := rows.Scan(&p.NPI, &p.FullName, &p.Specialty, &p.Address, &p.WaitTimeDays, &p.YearsExperience, &p.ClinicSize, &p.OfficialWebsite, &p.DataDiscrepancyFlag, (*pq_StringArray)(&plans)); err != nil {
			log.Printf("Scan error: %v", err)
			continue
		}
		p.AcceptedPlans = plans
		providers = append(providers, p)
	}

	providersJSON, _ := json.Marshal(providers)
	var reqBody map[string]string
	json.NewDecoder(r.Body).Decode(&reqBody)

	prompt := fmt.Sprintf("Analyze these providers: %s against patient: %s. Return top 3 matches in JSON.", string(providersJSON), reqBody["patientContext"])
	resp, _ := callLLM(prompt, true)
	w.Write(resp)
}

// Helper for scanning postgres arrays
type pq_StringArray []string

func (a *pq_StringArray) Scan(src interface{}) error {
	if src == nil {
		*a = []string{}
		return nil
	}
	s := src.(string)
	s = strings.Trim(s, "{}")
	if s == "" {
		*a = []string{}
		return nil
	}
	*a = strings.Split(s, ",")
	return nil
}

func handleHandoff(w http.ResponseWriter, r *http.Request) {
	setupCORS(&w, r)
	var req HandoffRequest
	json.NewDecoder(r.Body).Decode(&req)

	// 1. Ensure Patient exists
	var patientID string
	err := db.QueryRow(`
		INSERT INTO patient (name, context, insurance_id)
		VALUES ($1, $2, $3)
		RETURNING id`,
		req.PatientName, req.PatientContext, strings.ToLower(req.PatientPlanID)).Scan(&patientID)
	if err != nil {
		// Fallback if insurance_id doesn't exist yet
		err = db.QueryRow(`
			INSERT INTO patient (name, context)
			VALUES ($1, $2)
			RETURNING id`,
			req.PatientName, req.PatientContext).Scan(&patientID)
	}

	systemPrompt := `You are an Insurance Adjudicator. 
	1. Generate a FHIR JSON payload.
	2. Generate a plain-text e-Fax fallback.
	3. AUTO-APPROVE if condition is acute and provider is in-network. 
	4. AUTO-DENY if it violates Step Therapy (e.g. Surgery before PT).
	Return JSON with: priority_score, status, decision_reason, fhir_payload, efax_payload.`

	prompt := fmt.Sprintf("Patient: %s, Plan: %s, Provider NPI: %d", req.PatientContext, req.PatientPlanID, req.ProviderNPI)
	llmResp, _ := callLLM(systemPrompt+prompt, false)

	var c Claim
	json.Unmarshal(llmResp, &c)
	c.ClaimID = fmt.Sprintf("CLM-%d-%s", req.ProviderNPI, patientID[:8])
	c.PatientName = req.PatientName

	// 2. Save Claim to DB
	_, err = db.Exec(`
		INSERT INTO claim (claim_id, patient_id, status, priority_score, decision_reason, fhir_payload, efax_payload)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		c.ClaimID, patientID, c.Status, c.PriorityScore, c.DecisionReason, c.FHIRPayload, c.EFaxPayload)
	if err != nil {
		log.Printf("Error saving claim: %v", err)
	}

	w.Write(llmResp)
}

func getQueue(w http.ResponseWriter, r *http.Request) {
	setupCORS(&w, r)
	rows, err := db.Query(`
		SELECT c.claim_id, p.name as patient_name, c.status, c.priority_score, c.decision_reason, c.fhir_payload, c.efax_payload
		FROM claim c
		JOIN patient p ON c.patient_id = p.id
		ORDER BY c.priority_score DESC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var claims []Claim
	for rows.Next() {
		var c Claim
		if err := rows.Scan(&c.ClaimID, &c.PatientName, &c.Status, &c.PriorityScore, &c.DecisionReason, &c.FHIRPayload, &c.EFaxPayload); err != nil {
			continue
		}
		claims = append(claims, c)
	}
	json.NewEncoder(w).Encode(claims)
}

func callLLM(prompt string, isMatch bool) ([]byte, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	url := "https://api.openai.com/v1/chat/completions"

	payload := map[string]interface{}{
		"model":           "gpt-4o",
		"messages":        []map[string]string{{"role": "user", "content": prompt}},
		"response_format": map[string]string{"type": "json_object"},
	}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, _ := client.Do(req)
	defer resp.Body.Close()

	var result struct {
		Choices []struct{ Message struct{ Content string } }
	}
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
	log.Fatal(http.ListenAndServe(":8080", nil))
}
