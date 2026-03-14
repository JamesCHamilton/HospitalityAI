package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

const (
	UnsiloedBaseURL = "https://prod.visionapi.unsiloed.ai"
)

var (
	UnsiloedAPIKey = os.Getenv("UNSILOED_API_KEY")
	DB             *sql.DB
)

type ExtractionSchema struct {
	Type       string                 `json:"type"`
	Properties map[string]interface{} `json:"properties"`
	Required   []string               `json:"required"`
}

// callUnsiloedExtract handles the multipart upload and polling for Unsiloed AI
func callUnsiloedExtract(fileHeader *multipart.FileHeader, schema interface{}) (map[string]interface{}, error) {
	file, _ := fileHeader.Open()
	defer file.Close()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, _ := writer.CreateFormFile("pdf_file", fileHeader.Filename)
	io.Copy(part, file)

	schemaJSON, _ := json.Marshal(schema)
	writer.WriteField("schema_data", string(schemaJSON))
	writer.Close()

	req, _ := http.NewRequest("POST", UnsiloedBaseURL+"/v2/extract", body)
	req.Header.Set("api-key", UnsiloedAPIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		return nil, fmt.Errorf("unsiloed submission failed")
	}

	var submitRes struct {
		JobID string `json:"job_id"`
	}
	json.NewDecoder(resp.Body).Decode(&submitRes)

	// Polling
	for {
		time.Sleep(2 * time.Second)
		pollReq, _ := http.NewRequest("GET", UnsiloedBaseURL+"/extract/"+submitRes.JobID, nil)
		pollReq.Header.Set("api-key", UnsiloedAPIKey)
		pollResp, _ := client.Do(pollReq)

		var pollRes struct {
			Status        string                 `json:"status"`
			ExtractedData map[string]interface{} `json:"extracted_data"`
		}
		json.NewDecoder(pollResp.Body).Decode(&pollRes)

		if pollRes.Status == "completed" {
			return pollRes.ExtractedData, nil
		}
		if pollRes.Status == "failed" {
			return nil, fmt.Errorf("unsiloed job failed")
		}
	}
}

func handleIngest(w http.ResponseWriter, r *http.Request) {
	setupCORS(&w, r)
	if r.Method == "OPTIONS" {
		return
	}

	// 1. Parse Multipart Form (PDF or Form fields)
	r.ParseMultipartForm(10 << 20) // 10MB

	var patientName, clinicalHistory, insuranceID string

	file, header, err := r.FormFile("referral_pdf")
	if err == nil {
		defer file.Close()
		// If PDF exists, use Unsiloed to extract
		schema := ExtractionSchema{
			Type: "object",
			Properties: map[string]interface{}{
				"patient_name":    map[string]string{"type": "string"},
				"clinical_reason": map[string]string{"type": "string"},
				"insurance_payer": map[string]string{"type": "string"},
			},
			Required: []string{"patient_name", "clinical_reason", "insurance_payer"},
		}
		extracted, _ := callUnsiloedExtract(header, schema)
		patientName = extracted["patient_name"].(string)
		clinicalHistory = extracted["clinical_reason"].(string)
		insuranceID = strings.ToLower(extracted["insurance_payer"].(string))
	} else {
		// Fallback to Form Fields
		patientName = r.FormValue("patient_name")
		clinicalHistory = r.FormValue("clinical_history")
		insuranceID = strings.ToLower(r.FormValue("insurance_id"))
	}

	// 2. Persist to Supabase
	var id string
	err = DB.QueryRow(`
		INSERT INTO patients (name, clinical_history, insurance_id)
		VALUES ($1, $2, $3)
		RETURNING id`,
		patientName, clinicalHistory, insuranceID).Scan(&id)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success", "patient_id": id})
}

func setupCORS(w *http.ResponseWriter, r *http.Request) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Println("Warning: .env file not found")
	}
	dbURL := os.Getenv("DATABASE_URL")
	DB, _ = sql.Open("postgres", dbURL)
	defer DB.Close()

	http.HandleFunc("/api/ingest", handleIngest)
	fmt.Println("🚀 Ingestion Service (Unsiloed Gateway) running on :8081")
	log.Fatal(http.ListenAndServe(":8081", nil))
}
