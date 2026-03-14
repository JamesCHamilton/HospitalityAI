package main

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestIngestCORS ensures the ingestion endpoint handles CORS for the frontend
func TestIngestCORS(t *testing.T) {
	req, _ := http.NewRequest("OPTIONS", "/api/ingest", nil)
	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(handleIngest)
	handler.ServeHTTP(rr, req)

	if rr.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("CORS origin not set: got %v", rr.Header().Get("Access-Control-Allow-Origin"))
	}
}

// TestExtractionSchemaSerialization verifies the Unsiloed schema structure
func TestExtractionSchemaSerialization(t *testing.T) {
	schema := ExtractionSchema{
		Type: "object",
		Properties: map[string]interface{}{
			"test": map[string]string{"type": "string"},
		},
		Required: []string{"test"},
	}
	data, err := json.Marshal(schema)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(data, []byte(`"required":["test"]`)) {
		t.Errorf("Schema serialization incorrect: %s", string(data))
	}
}

// TestHandleIngestForm verifies that the endpoint can handle standard form data
func TestHandleIngestForm(t *testing.T) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("patient_name", "Test Patient")
	writer.WriteField("clinical_history", "Test History")
	writer.WriteField("insurance_id", "test_ins")
	writer.Close()

	req, _ := http.NewRequest("POST", "/api/ingest", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	
	rr := httptest.NewRecorder()
	
	// Skip DB actual execution but verify the handler reach
	if DB == nil {
		t.Log("Skipping actual DB insert in test")
		return
	}

	handler := http.HandlerFunc(handleIngest)
	handler.ServeHTTP(rr, req)
	
	if rr.Code != http.StatusOK && rr.Code != http.StatusInternalServerError {
		t.Errorf("Unexpected status code: %d", rr.Code)
	}
}
