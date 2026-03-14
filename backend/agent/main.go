package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"sync"
	"time"
)

// --- Structs for Incoming Requests ---
type MatchRequest struct {
	PatientContext string `json:"patientContext"`
}

type HandoffRequest struct {
	PatientContext    string `json:"patientContext"`
	PatientName       string `json:"patientName"`
	ProviderNPI       int    `json:"providerNpi"`
	ProviderName      string `json:"providerName"`
	ProviderInNetwork bool   `json:"providerInNetwork"`
}

// --- Structs for the Priority Queue ---
type Claim struct {
	ClaimID         string `json:"claim_id"`
	PatientName     string `json:"patient_name"`
	ProviderName    string `json:"provider_name"`
	PriorityScore   int    `json:"priority_score"`
	ConfidenceScore int    `json:"confidence_score"`
	Status          string `json:"status"` // "AUTO-APPROVED", "AUTO-DENIED", "MANUAL_REVIEW"
	DecisionReason  string `json:"decision_reason"`
	ClinicalBrief   string `json:"clinical_brief"`
	FHIRPayload     string `json:"fhir_payload"`
	EFaxPayload     string `json:"efax_payload"`
}

var (
	claimQueue []Claim
	queueMutex sync.Mutex
)

// --- Endpoint 1: Ethical Patient Matcher ---
func handleMatch(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w, r)
	if r.Method == "OPTIONS" {
		return
	}

	var reqData MatchRequest
	if err := json.NewDecoder(r.Body).Decode(&reqData); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	providersData, err := os.ReadFile("clean_providers.json")
	if err != nil {
		http.Error(w, "Provider data missing. Run ETL first.", http.StatusInternalServerError)
		return
	}

	systemPrompt := `You are an AI Clinical Triage Agent operating within the Four-Box Medical Ethics Model. 
Evaluate the specialists and return a strict JSON object with a 'matches' array containing the top 3 optimal specialists.
Each match MUST have:
1. "npi" (number)
2. "match_score" (number 0-100)
3. "medical_indications_justification" (string)
4. "justice_and_context_justification" (string)
5. "provider_name" (string)`

	promptContent := fmt.Sprintf("Patient Context: %s\n\nProviders: %s", reqData.PatientContext, string(providersData))

	llmResponse, err := callLLM(systemPrompt, promptContent)
	if err != nil {
		http.Error(w, "AI reasoning failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(llmResponse)
}

// --- Endpoint 2: Zero-Touch Handoff & Auto-Adjudication ---
func handleHandoffAndClaim(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w, r)
	if r.Method == "OPTIONS" {
		return
	}

	var reqData HandoffRequest
	json.NewDecoder(r.Body).Decode(&reqData)

	systemPrompt := `You are a dual-role AI: A Medical Scribe and a strict Insurance Adjudicator.
TASK 1: GENERATE INTEGRATION ARTIFACTS
1. "clinical_brief": 3 sentences summarizing Chief Complaint and History.
2. "fhir_payload": Strict JSON string for an HL7 ServiceRequest.
3. "efax_payload": Plain-text memo formatted like a traditional Fax cover sheet (Legacy Fallback).

TASK 2: AUTO-ADJUDICATE
AUTO-DENY FACTORS: Step Therapy Violation (requests advanced imaging/surgery without failing conservative therapy), or Out-of-Network Elective.
AUTO-APPROVE FACTORS (Must meet ALL): Provider is In-Network AND Specialty matches AND condition is an acute escalation.
MANUAL REVIEW: Ambiguous symptoms, or Network Adequacy Exception (Out-of-network requested because no in-network accessible).

TASK 3: SCORING
"priority_score" (0-100): Clinical urgency (100 = immediate risk).
"confidence_score" (0-100): Confidence in auto-adjudication. Penalize messy/vague input. ANY score < 85 MUST force status to "MANUAL_REVIEW".

Output a STRICT JSON object with exactly these keys: "priority_score", "confidence_score", "status", "decision_reason", "clinical_brief", "fhir_payload", "efax_payload".`

	promptContent := fmt.Sprintf("Patient Name: %s\nPatient Context: %s\nMatched Provider: %s (NPI: %d)\nIs Provider In-Network: %t",
		reqData.PatientName, reqData.PatientContext, reqData.ProviderName, reqData.ProviderNPI, reqData.ProviderInNetwork)

	llmResponse, err := callLLM(systemPrompt, promptContent)
	if err != nil {
		http.Error(w, "AI reasoning failed", http.StatusInternalServerError)
		return
	}

	var adjudicatedClaim Claim
	json.Unmarshal(llmResponse, &adjudicatedClaim)

	// HARDCODED SAFETY CONSTRAINT: Defense in Depth against LLM Hallucinations
	if adjudicatedClaim.ConfidenceScore < 85 && adjudicatedClaim.Status != "AUTO-DENIED" {
		adjudicatedClaim.Status = "MANUAL_REVIEW"
		adjudicatedClaim.DecisionReason = "Forced to Manual Review: AI Confidence Score too low for safe auto-approval."
	}

	adjudicatedClaim.ClaimID = fmt.Sprintf("CLM-%d", time.Now().Unix())
	adjudicatedClaim.PatientName = reqData.PatientName
	adjudicatedClaim.ProviderName = reqData.ProviderName

	queueMutex.Lock()
	claimQueue = append(claimQueue, adjudicatedClaim)
	sort.Slice(claimQueue, func(i, j int) bool {
		return claimQueue[i].PriorityScore > claimQueue[j].PriorityScore
	})
	queueMutex.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(adjudicatedClaim)
}

// --- Endpoint 3: Insurance Priority Queue ---
func getQueue(w http.ResponseWriter, r *http.Request) {
	setCorsHeaders(w, r)
	if r.Method == "OPTIONS" {
		return
	}

	queueMutex.Lock()
	defer queueMutex.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(claimQueue)
}

// --- Helper: LLM Integration ---
func callLLM(systemPrompt, userPrompt string) ([]byte, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	payload := map[string]interface{}{
		"model":           "gpt-4o",
		"response_format": map[string]string{"type": "json_object"},
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
	}
	jsonPayload, _ := json.Marshal(payload)

	req, _ := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewBuffer(jsonPayload))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var openAIResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	json.Unmarshal(body, &openAIResp)

	if len(openAIResp.Choices) == 0 {
		return nil, fmt.Errorf("empty response")
	}
	return []byte(openAIResp.Choices[0].Message.Content), nil
}

// --- Helper: CORS ---
func setCorsHeaders(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/api/match", handleMatch)
	http.HandleFunc("/api/handoff", handleHandoffAndClaim)
	http.HandleFunc("/api/queue", getQueue)

	fmt.Printf("Blaxel Adjudication Agent running on port %s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
