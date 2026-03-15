"use client";
import React, { useEffect, useState } from "react";
import { CheckCircle, XCircle, Activity } from "lucide-react";

type MatchResult = {
  npi: string;
  full_name: string;
  specialty: string;
  priority_score: number;
  insurance_valid: boolean;
  accepted_payers?: string[];
};

const MOCK_RESULTS: MatchResult[] = [
  {
    npi: "1234567890",
    full_name: "Dr. Alice Smith",
    specialty: "Cardiology",
    priority_score: 0.93,
    insurance_valid: true,
    accepted_payers: ["Fidelis", "Aetna", "Cigna"],
  },
  {
    npi: "2345678901",
    full_name: "Dr. Bob Lee",
    specialty: "Cardiology",
    priority_score: 0.87,
    insurance_valid: false,
    accepted_payers: ["Aetna", "Cigna"],
  },
  {
    npi: "3456789012",
    full_name: "Dr. Carol Jones",
    specialty: "Cardiology",
    priority_score: 0.83,
    insurance_valid: true,
    accepted_payers: ["Fidelis", "MVP"],
  },
];

export default function MatchResultsPage({ params }: { params: { id: string } }) {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMatches() {
      setLoading(true);
      try {
        // Replace below with your actual backend API endpoint as needed
        // const res = await fetch(`http://localhost:8080/api/match/${params.id}`);
        // const data = await res.json();
        // setMatches(data.matches || []);
        // For now, use mock data
        setTimeout(() => {
          setMatches(MOCK_RESULTS);
          setLoading(false);
        }, 800);
      } catch (err) {
        setMatches(MOCK_RESULTS);
        setLoading(false);
      }
    }
    fetchMatches();
  }, [params.id]);

  return (
    <div className="max-w-2xl mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6 text-center">Best Matching Clinics</h1>
      {loading ? (
        <div className="flex flex-col items-center text-muted-foreground">
          <Activity className="animate-spin mb-2" />
          <span>Loading top matches...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.length === 0 && (
            <div className="text-center text-gray-500">No matches found for this patient.</div>
          )}
          {matches.map((match, i) => (
            <div
              key={match.npi}
              className="border rounded-lg shadow p-5 flex items-center gap-4 bg-white"
            >
              <div className="flex flex-col flex-1">
                <span className="text-lg font-semibold">{match.full_name}</span>
                <span className="text-gray-600">{match.specialty}</span>
                <span className="text-xs text-gray-400">NPI: {match.npi}</span>
                <span className="mt-2 text-sm">
                  Accepted Insurance:
                  <span className="ml-1">
                    {match.accepted_payers?.join(", ") || "Unknown"}
                  </span>
                </span>
              </div>
              <div className="flex flex-col items-center">
                <div className="text-xl font-bold mb-1">
                  {(match.priority_score * 100).toFixed(0)}<span className="text-gray-500 text-base">/100</span>
                </div>
                <div className="flex items-center gap-1">
                  {match.insurance_valid ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600" />{" "}
                      <span className="text-green-700 text-sm">Insurance Valid</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-600" />{" "}
                      <span className="text-red-700 text-sm">Insurance Not Accepted</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-8 text-center text-gray-600 text-sm">
        Don&apos;t see your clinic or insurance? Contact your provider or insurance company for more info.
      </div>
    </div>
  );
}
