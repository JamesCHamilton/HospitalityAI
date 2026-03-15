"use client";
import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, XCircle, Activity, ShieldCheck, MapPin, ArrowRight, FileText, Trash2 } from 'lucide-react';

export default function PatientPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Unified Form State
  const [formData, setFormData] = useState({
    name: "",
    history: "",
    insurance: "fid_med_ny"
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [handoffResult, setHandoffResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleWorkflowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const data = new FormData();
    data.append('patient_name', formData.name);
    data.append('clinical_history', formData.history);
    data.append('insurance_id', formData.insurance);
    if (selectedFile) data.append('referral_pdf', selectedFile);

    try {
      // 1. Ingest Data (Unsiloed Extraction)
      const ingestRes = await fetch('http://localhost:8081/api/ingest', { method: 'POST', body: data });
      const ingestData = await ingestRes.json();
      const patientContext = ingestData.extracted?.clinical_reason || formData.history;

      // 2. Direct AI Match (Skipping refinement step as requested)
      const matchRes = await fetch('http://localhost:8080/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientContext,
          filters: { insurance: formData.insurance } // Pass basic context
        })
      });
      const matchData = await matchRes.json();
      setMatches(matchData.matches || matchData.top_matches || []);
      setStep(3); // Jump straight to results
    } catch (err) {
      console.error("Workflow failed", err);
      alert("System error. Check if backends are running.");
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
          patientContext: formData.history,
          patientName: formData.name,
          patientPlanId: formData.insurance,
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
        <div className="bg-white p-10 rounded-[40px] shadow-2xl border border-gray-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-10">
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter leading-none">Clinical Intake</h1>
            <p className="text-sm text-gray-400 font-medium mt-2">Find your specialist in seconds.</p>
          </div>

          <form onSubmit={handleWorkflowSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-2">Full Name</label>
                <input
                  type="text" required
                  className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-2 border-gray-50 focus:border-blue-500 focus:bg-white outline-none font-bold text-gray-800 transition-all shadow-sm"
                  placeholder="e.g. John Doe"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-2">Insurance</label>
                <select
                  className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-2 border-gray-50 focus:border-blue-500 focus:bg-white outline-none font-bold text-gray-800 transition-all cursor-pointer shadow-sm"
                  value={formData.insurance}
                  onChange={e => setFormData({ ...formData, insurance: e.target.value })}
                >
                  <option value="FAKE_BCBS_HMO_001">BlueCross HMO Silver</option>
                  <option value="FAKE_UNITED_PPO_002">United PPO Platinum</option>
                  <option value="FAKE_AETNA_EPO_003">Aetna EPO Gold</option>
                  <option value="FAKE_MEDICAID_NY_004">NY State Medicaid</option>
                  <option value="FAKE_OSCAR_HMO_005">Oscar Classic HMO</option>
                  <option value="FAKE_EMPIRE_POS_006">Empire POS Flexible</option>
                  <option value="FAKE_CIGNA_OAP_007">Cigna Open Access Plus</option>
                  <option value="FAKE_HUMANA_HMO_008">Humana Essential HMO</option>
                  <option value="FAKE_MEDICARE_009">Original Medicare</option>
                  <option value="FAKE_FIDELIS_NY_010">Fidelis Care Essential Plan</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-2">Clinical Context</label>
              <textarea
                required
                className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-2 border-gray-50 focus:border-blue-500 focus:bg-white outline-none font-medium text-gray-700 h-32 transition-all shadow-sm"
                placeholder="Describe symptoms or reason for consult..."
                value={formData.history}
                onChange={e => setFormData({ ...formData, history: e.target.value })}
              />
            </div>

            <div className="relative">
              <input
                type="file" ref={fileInputRef} className="hidden" accept=".pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
              <div
                className={`w-full py-6 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all group ${
                  selectedFile ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50 hover:border-blue-200 hover:bg-blue-50/30 cursor-pointer'
                }`}
                onClick={() => !selectedFile && fileInputRef.current?.click()}
              >
                {selectedFile ? (
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 text-green-600 font-bold mb-1">
                      <CheckCircle className="w-5 h-5" /> Referral Attached
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-green-500 font-mono max-w-[200px] truncate">{selectedFile.name}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="p-1 hover:bg-green-100 rounded text-green-700 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-gray-400 font-bold group-hover:text-blue-500 transition-colors">
                      <FileText className="w-5 h-5" /> Optional PDF Referral
                    </div>
                    <span className="text-[10px] text-gray-400 uppercase tracking-widest mt-1 text-center px-4 leading-tight">AI will extract clinical details if provided</span>
                  </>
                )}
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-3 disabled:bg-blue-300"
            >
              {loading ? <><Activity className="animate-spin" /> Clinical Intelligence Syncing...</> : <>Find My Specialist <ArrowRight className="w-6 h-6" /></>}
            </button>
          </form>
        </div>
      )}

      {step === 3 && matches[idx] && (
        <div className="relative animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-gray-100 p-10">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-4xl font-black text-gray-900 tracking-tighter leading-none mb-2">{matches[idx].first_name +' '+matches[idx].last_name}</h3>
                <div className="flex items-center gap-4">
                  <p className="text-blue-600 font-bold text-sm bg-blue-50 px-3 py-1 rounded-lg">NPI: {matches[idx].npi}</p>
                  <p className="flex items-center text-gray-400 text-xs font-bold uppercase tracking-widest"><MapPin className="h-3 w-3 mr-1" /> New York, NY</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-5xl font-black text-green-500 leading-none">
                  {/* Show as percent, rounded */}
                  {Math.round((matches[idx].match_score ?? 0) * 100)}%
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                  Match Quality
                </p>
              </div>
            </div>

            <div className="space-y-6 mb-10">
              <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100">
                <h4 className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-3 flex items-center"><ShieldCheck className="h-4 w-4 mr-2" /> Clinical Justification</h4>
                <p className="text-sm text-gray-700 leading-relaxed font-medium">{matches[idx].medical_indications_justification || matches[idx].reason}</p>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setIdx((idx + 1) % matches.length)}
                className="flex-1 py-5 border-2 border-gray-100 rounded-3xl flex justify-center items-center hover:bg-red-50 transition-all group"
              >
                <XCircle className="text-gray-300 group-hover:text-red-500 h-10 w-10 transition-colors" />
              </button>
              <button onClick={() => initiateHandoff(matches[idx])} disabled={loading} className="flex-[2] py-5 bg-blue-600 text-white rounded-3xl flex justify-center items-center hover:bg-blue-700 transition-all shadow-2xl font-black text-xl gap-3 disabled:bg-blue-300">
                {loading ? "Authorizing..." : <><CheckCircle className="h-8 w-8" /> Select Provider</>}
              </button>
            </div>
          </div>

          {/* Optionally, show navigation dots for matches */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {matches.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`w-3 h-3 rounded-full border ${i === idx ? 'bg-purple-600 border-purple-600' : 'bg-gray-200 border-gray-300'} transition-all`}
                aria-label={`Provider match ${i + 1}`}
                tabIndex={0}
              />
            ))}
          </div>
        </div>
      )}

      {step === 4 && handoffResult && (
        <div className="bg-green-50 p-10 rounded-[40px] border-4 border-green-100 text-center animate-in zoom-in duration-500">
          <div className="bg-green-500 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-200">
            <CheckCircle className="text-white h-12 w-12" />
          </div>
          <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">Handoff Synchronized</h2>
          <p className="text-green-700 font-medium mb-8">AI Adjudication Triggered. Status: <span className="font-black uppercase">{handoffResult.status}</span></p>
          <button onClick={() => window.location.href = '/provider'} className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-colors">Go to Provider Inbox</button>
        </div>
      )}
    </div>
  );
}
