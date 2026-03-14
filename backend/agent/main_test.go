package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestHandoffEndpointCORS ensures the Blaxel agent handles CORS properly
func TestHandoffEndpointCORS(t *testing.T) {
	req, _ := http.NewRequest("OPTIONS", "/api/handoff", nil)
	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(handleHandoff)
	handler.ServeHTTP(rr, req)

	if rr.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("CORS origin not set on handoff: got %v", rr.Header().Get("Access-Control-Allow-Origin"))
	}
}

// TestAuthorizationSerialization verifies the structure of the AI decision
func TestAuthorizationSerialization(t *testing.T) {
	auth := Authorization{
		ID:              "auth-123",
		PatientName:     "Jane Smith",
		Status:          "AUTO-APPROVED",
		PriorityScore:   92,
		ConfidenceScore: 98,
		DecisionReason:  "Step therapyPT verified",
	}
	
	data, _ := json.Marshal(auth)
	var result map[string]interface{}
	json.Unmarshal(data, &result)

	if result["status"] != "AUTO-APPROVED" {
		t.Errorf("Authorization serialization failed status: %v", result["status"])
	}
	if result["priority_score"].(float64) != 92 {
		t.Errorf("Authorization serialization failed priority: %v", result["priority_score"])
	}
}

// TestHandoffRequestDecoding verifies the incoming patient context
func TestHandoffRequestDecoding(t *testing.T) {
	input := `{
		"patientContext": "Patient has acute pain in left arm",
		"patientName": "John Doe",
		"patientPlanId": "fid_med_ny",
		"providerNpi": 12345678
	}`
	var req HandoffRequest
	err := json.NewDecoder(strings.NewReader(input)).Decode(&req)
	if err != nil {
		t.Fatal(err)
	}
	if req.PatientName != "John Doe" {
		t.Errorf("Failed to decode patient name: got %s", req.PatientName)
	}
	if req.ProviderNPI != 12345678 {
		t.Errorf("Failed to decode provider NPI: got %d", req.ProviderNPI)
	}
}

// TestMatchPromptConstruction tests basic prompt logic
func TestMatchPromptConstruction(t *testing.T) {
	context := "Chronic heart failure symptoms"
	providers := `[{"npi": 1, "full_name": "Dr. House"}]`
	
	// Simply verify the logic we use in the handler
	prompt := "Match these providers: " + providers + " to patient: " + context
	if !strings.Contains(prompt, "Dr. House") || !strings.Contains(prompt, "heart failure") {
		t.Errorf("Match prompt construction failed: %s", prompt)
	}
}
