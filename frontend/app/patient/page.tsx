"use client";
import React, { useState } from 'react';
import { Upload, CheckCircle, XCircle, AlertTriangle, Activity } from 'lucide-react';

export default function PatientPage() {
  const [step, setStep] = useState(1);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);

  const simulateOCR = () => {
    setLoading(true);
    setTimeout(() => {
      setText("65yo Male, acute chest pain, radiating to left arm. Medicaid (Fidelis). Needs cardiology consult. Patient has hypertension history but no recent EKG.");
      setLoading(false);
      setStep(2);
    }, 1500);
  };

  const getMatches = async () => {
    setLoading(true);
    // Replace with your live Blaxel URL
    const res = await fetch('/api/proxy/match', { 
      method: 'POST', 
      body: JSON.stringify({ patientContext: text }) 
    });
    const data = await res.json();
    setMatches(data.matches || []);
    setStep(3);
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      {step === 1 && (
        <div onClick={simulateOCR} className="border-4 border-dashed border-gray-200 rounded-2xl p-20 text-center cursor-pointer hover:border-blue-500 transition-all group">
          <Upload className="mx-auto h-12 w-12 text-gray-400 group-hover:text-blue-500 mb-4" />
          <p className="text-xl font-medium text-gray-600">Upload Messy Referral PDF</p>
          <p className="text-sm text-gray-400 mt-2">Simulate OCR extraction for the judges</p>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
          <h2 className="text-2xl font-bold mb-4 flex items-center"><Activity className="mr-2 text-blue-600" /> Extracted Clinical Context</h2>
          <textarea className="w-full h-40 p-4 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500 mb-6" value={text} readOnly />
          <button onClick={getMatches} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition">
            {loading ? "AI Reasoning in Progress..." : "Find Best Specialists"}
          </button>
        </div>
      )}

      {step === 3 && matches[idx] && (
        <div className="relative">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 p-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-3xl font-extrabold text-gray-900">{matches[idx].provider_name}</h3>
                <p className="text-blue-600 font-medium">NPI: {matches[idx].npi}</p>
              </div>
              <div className="text-right">
                <span className="text-4xl font-black text-green-500">{matches[idx].match_score}%</span>
                <p className="text-xs font-bold text-gray-400 uppercase">Match Score</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-xl">
                <h4 className="text-xs font-bold text-blue-700 uppercase mb-1">Clinical Justification</h4>
                <p className="text-sm text-gray-700">{matches[idx].medical_indications_justification}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-xl">
                <h4 className="text-xs font-bold text-purple-700 uppercase mb-1">Ethical & Access Logic</h4>
                <p className="text-sm text-gray-700">{matches[idx].justice_and_context_justification}</p>
              </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button onClick={() => setIdx(idx + 1)} className="flex-1 py-4 border-2 border-gray-100 rounded-2xl flex justify-center items-center hover:bg-red-50 hover:border-red-100 transition">
                <XCircle className="text-red-500 h-8 w-8" />
              </button>
              <button onClick={() => alert("Handoff Initiated!")} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl flex justify-center items-center hover:bg-blue-700 transition shadow-lg shadow-blue-200">
                <CheckCircle className="h-8 w-8" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}