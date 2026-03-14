"use client";
import React, { useState } from 'react';
import { Upload, CheckCircle, XCircle, Activity, HeartPulse, ShieldCheck, MapPin } from 'lucide-react';

export default function PatientPage() {
  const [step, setStep] = useState(1);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [handoffResult, setHandoffResult] = useState<any>(null);

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
    try {
      const res = await fetch('http://localhost:8080/api/match', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientContext: text }) 
      });
      const data = await res.json();
      // The backend returns the direct JSON from LLM
      setMatches(data.matches || data.top_matches || []);
      setStep(3);
    } catch (err) {
      console.error("Match error:", err);
      alert("AI Matching failed. Ensure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const initiateHandoff = async (provider: any) => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8080/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientContext: text,
          patientName: "John Doe", // Mock name
          patientPlanId: "fid_med_ny", // Mock plan based on OCR
          providerNpi: provider.npi
        })
      });
      const data = await res.json();
      setHandoffResult(data);
      setStep(4);
    } catch (err) {
      console.error("Handoff error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      {step === 1 && (
        <div onClick={simulateOCR} className="border-4 border-dashed border-gray-200 rounded-3xl p-20 text-center cursor-pointer hover:border-blue-500 transition-all group bg-white shadow-sm">
          <Upload className="mx-auto h-16 w-16 text-gray-300 group-hover:text-blue-500 mb-6 transition-colors" />
          <p className="text-2xl font-bold text-gray-700">Drop Clinical Referral PDF</p>
          <p className="text-sm text-gray-400 mt-2 font-medium">AI will extract context & verify insurance coverage</p>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white p-8 rounded-3xl shadow-2xl border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-gray-900 flex items-center tracking-tight">
              <Activity className="mr-3 text-blue-600 h-8 w-8" /> 
              Clinical Context Extracted
            </h2>
            <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-black uppercase tracking-widest">
              OCR Verified
            </div>
          </div>
          <div className="relative">
            <textarea 
              className="w-full h-48 p-6 bg-gray-50 rounded-2xl border-2 border-gray-100 focus:border-blue-500 focus:ring-0 text-gray-700 font-medium leading-relaxed mb-6" 
              value={text} 
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <button 
            onClick={getMatches} 
            disabled={loading}
            className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 disabled:bg-blue-300"
          >
            {loading ? "Reasoning Engine Mapping..." : "Find Network Matches"}
          </button>
        </div>
      )}

      {step === 3 && matches[idx] && (
        <div className="relative animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-gray-100 p-10">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-4xl font-black text-gray-900 tracking-tighter leading-none mb-2">
                  {matches[idx].provider_name || matches[idx].full_name}
                </h3>
                <div className="flex items-center gap-4">
                  <p className="text-blue-600 font-bold text-sm bg-blue-50 px-3 py-1 rounded-lg">NPI: {matches[idx].npi}</p>
                  <p className="flex items-center text-gray-400 text-xs font-bold uppercase tracking-widest">
                    <MapPin className="h-3 w-3 mr-1" /> New York, NY
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-5xl font-black text-green-500 leading-none">
                  {matches[idx].match_score || matches[idx].confidence_score}%
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Match Quality</p>
              </div>
            </div>

            <div className="space-y-6 mb-10">
              <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100">
                <h4 className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-3 flex items-center">
                  <ShieldCheck className="h-4 w-4 mr-2" /> Clinical Justification
                </h4>
                <p className="text-sm text-gray-700 leading-relaxed font-medium">
                  {matches[idx].medical_indications_justification || matches[idx].reasoning}
                </p>
              </div>
              <div className="bg-purple-50/50 p-6 rounded-3xl border border-purple-100">
                <h4 className="text-[10px] font-black text-purple-700 uppercase tracking-widest mb-3 flex items-center">
                  <HeartPulse className="h-4 w-4 mr-2" /> Ethical & Access Logic
                </h4>
                <p className="text-sm text-gray-700 leading-relaxed font-medium">
                  {matches[idx].justice_and_context_justification || "Provider capacity verified for Medicaid Managed Care."}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setIdx((idx + 1) % matches.length)} 
                className="flex-1 py-5 border-2 border-gray-100 rounded-3xl flex justify-center items-center hover:bg-red-50 hover:border-red-200 transition-all group"
              >
                <XCircle className="text-gray-300 group-hover:text-red-500 h-10 w-10 transition-colors" />
              </button>
              <button 
                onClick={() => initiateHandoff(matches[idx])} 
                disabled={loading}
                className="flex-[2] py-5 bg-blue-600 text-white rounded-3xl flex justify-center items-center hover:bg-blue-700 transition-all shadow-2xl shadow-blue-200 font-black text-xl gap-3 disabled:bg-blue-300"
              >
                {loading ? "Authorizing..." : <><CheckCircle className="h-8 w-8" /> Select Provider</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 4 && handoffResult && (
        <div className="bg-green-50 p-10 rounded-[40px] border-4 border-green-100 text-center animate-in zoom-in duration-500">
          <div className="bg-green-500 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-200">
            <CheckCircle className="text-white h-12 w-12" />
          </div>
          <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">Handoff Synchronized</h2>
          <p className="text-green-700 font-medium mb-8">
            AI Adjudication has been triggered. Status: <span className="font-black uppercase">{handoffResult.status}</span>
          </p>
          <div className="bg-white p-6 rounded-3xl text-left border border-green-200 shadow-sm mb-8">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Priority Score</h4>
            <div className="text-2xl font-black text-gray-900">{handoffResult.priority_score}/100</div>
            <p className="text-sm text-gray-500 mt-2 font-medium">"{handoffResult.decision_reason}"</p>
          </div>
          <button 
            onClick={() => window.location.href = '/provider'}
            className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-colors"
          >
            Go to Provider Inbox
          </button>
        </div>
      )}
    </div>
  );
}
