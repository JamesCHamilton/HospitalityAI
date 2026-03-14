"use client";
import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, XCircle, Activity, HeartPulse, ShieldCheck, MapPin, ArrowRight, FileText, Trash2, Filter, Clock, Users, Building } from 'lucide-react';

export default function PatientPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Intake State
  const [formData, setFormData] = useState({
    name: "",
    history: "",
    insurance: "fid_med_ny"
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Refinement Filters
  const [filters, setFilters] = useState({
    zipcode: "",
    specialization: "Cardiology",
    sex: "No Preference",
    max_wait_days: 14
  });

  const [matches, setMatches] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [handoffResult, setHandoffResult] = useState<any>(null);
  const [extractedContext, setExtractedContext] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInitialIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const data = new FormData();
    data.append('patient_name', formData.name);
    data.append('clinical_history', formData.history);
    data.append('insurance_id', formData.insurance);
    if (selectedFile) data.append('referral_pdf', selectedFile);

    try {
      const ingestRes = await fetch('http://localhost:8081/api/ingest', { method: 'POST', body: data });
      const ingestData = await ingestRes.json();
      setExtractedContext(ingestData.extracted?.clinical_reason || formData.history);
      setStep(2); // Move to Refinement
    } catch (err) {
      console.error("Ingestion failed", err);
      alert("Backend service unreachable.");
    } finally {
      setLoading(false);
    }
  };

  const getFinalMatches = async () => {
    setLoading(true);
    try {
      const matchRes = await fetch('http://localhost:8080/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          patientContext: extractedContext,
          filters: filters
        })
      });
      const matchData = await matchRes.json();
      setMatches(matchData.matches || []);
      setStep(3);
    } catch (err) {
      console.error("Match failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      {/* Step 1: Ingestion Form */}
      {step === 1 && (
        <div className="bg-white p-10 rounded-[40px] shadow-2xl border border-gray-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-10 flex justify-between items-end">
            <div>
              <h1 className="text-4xl font-black text-gray-900 tracking-tighter leading-none">Intake</h1>
              <p className="text-sm text-gray-400 font-medium mt-2">Start your AI-powered specialist search.</p>
            </div>
            <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-200">
              Step 1 of 3
            </div>
          </div>

          <form onSubmit={handleInitialIngest} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-2">Full Name</label>
                <input 
                  type="text" required
                  className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-2 border-gray-50 focus:border-blue-500 focus:bg-white outline-none font-bold text-gray-800 transition-all shadow-sm"
                  placeholder="e.g. John Doe"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-2">Insurance</label>
                <select 
                  className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-2 border-gray-50 focus:border-blue-500 focus:bg-white outline-none font-bold text-gray-800 transition-all cursor-pointer shadow-sm"
                  value={formData.insurance}
                  onChange={e => setFormData({...formData, insurance: e.target.value})}
                >
                  <option value="fid_med_ny">Fidelis Care Medicaid</option>
                  <option value="aet_choice_ppo">Aetna Choice PPO</option>
                  <option value="bcbs_blue_empire">Empire BCBS</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-2">Clinical Context</label>
              <textarea 
                required
                className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-2 border-gray-50 focus:border-blue-500 focus:bg-white outline-none font-medium text-gray-700 h-32 transition-all shadow-sm"
                placeholder="Describe your symptoms or medical concern..."
                value={formData.history}
                onChange={e => setFormData({...formData, history: e.target.value})}
              />
            </div>

            {/* Optional PDF Upload with Removal */}
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
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                        className="p-1 hover:bg-green-100 rounded text-green-700 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-gray-400 font-bold group-hover:text-blue-500 transition-colors">
                      <FileText className="w-5 h-5" /> Optional PDF Referral
                    </div>
                    <span className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">AI will extract clinical data</span>
                  </>
                )}
              </div>
            </div>

            <button 
              type="submit" disabled={loading}
              className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-3 disabled:bg-blue-300"
            >
              {loading ? <><Activity className="animate-spin" /> Analyzing via Unsiloed...</> : <>Next: Personalize Search <ArrowRight className="w-6 h-6" /></>}
            </button>
          </form>
        </div>
      )}

      {/* Step 2: Personalization Filters */}
      {step === 2 && (
        <div className="bg-white p-10 rounded-[40px] shadow-2xl border border-gray-50 animate-in fade-in zoom-in duration-500">
          <div className="mb-10 flex justify-between items-end">
            <div>
              <h1 className="text-4xl font-black text-gray-900 tracking-tighter leading-none">Refine</h1>
              <p className="text-sm text-gray-400 font-medium mt-2">Personalize your ideal specialist match.</p>
            </div>
            <div className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-purple-200">
              Step 2 of 3
            </div>
          </div>

          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4 flex items-center">
                  <MapPin className="w-3 h-3 mr-2" /> Zipcode
                </label>
                <input 
                  type="text" placeholder="10001"
                  className="w-full bg-transparent outline-none text-xl font-bold text-gray-800 placeholder:text-gray-300"
                  value={filters.zipcode}
                  onChange={e => setFilters({...filters, zipcode: e.target.value})}
                />
              </div>
              <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4 flex items-center">
                  <Building className="w-3 h-3 mr-2" /> Specialty
                </label>
                <select 
                  className="w-full bg-transparent outline-none text-lg font-bold text-gray-800 cursor-pointer"
                  value={filters.specialization}
                  onChange={e => setFilters({...filters, specialization: e.target.value})}
                >
                  <option value="Cardiology">Cardiology</option>
                  <option value="Dermatology">Dermatology</option>
                  <option value="Pediatrics">Pediatrics</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4 flex items-center">
                  <Users className="w-3 h-3 mr-2" /> Provider Gender
                </label>
                <select 
                  className="w-full bg-transparent outline-none text-lg font-bold text-gray-800 cursor-pointer"
                  value={filters.sex}
                  onChange={e => setFilters({...filters, sex: e.target.value})}
                >
                  <option value="No Preference">No Preference</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4 flex items-center">
                  <Clock className="w-3 h-3 mr-2" /> Max Wait Time
                </label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" min="1" max="60" 
                    className="flex-1 accent-purple-600"
                    value={filters.max_wait_days}
                    onChange={e => setFilters({...filters, max_wait_days: parseInt(e.target.value)})}
                  />
                  <span className="text-lg font-black text-purple-700 min-w-[3ch]">{filters.max_wait_days}d</span>
                </div>
              </div>
            </div>

            <button 
              onClick={getFinalMatches} disabled={loading}
              className="w-full py-5 bg-purple-600 text-white rounded-3xl font-black text-xl hover:bg-purple-700 transition-all shadow-xl shadow-purple-100 flex items-center justify-center gap-3 disabled:bg-purple-300"
            >
              {loading ? <><Activity className="animate-spin" /> Reasoning Engine Mapping...</> : <>Show Best Matches <ArrowRight className="w-6 h-6" /></>}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Match Results */}
      {step === 3 && matches[idx] && (
        <div className="relative animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-gray-100 p-10">
            {/* Same match card logic as before */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-4xl font-black text-gray-900 tracking-tighter leading-none mb-2">{matches[idx].full_name}</h3>
                <div className="flex items-center gap-4">
                  <p className="text-blue-600 font-bold text-sm bg-blue-50 px-3 py-1 rounded-lg">NPI: {matches[idx].npi}</p>
                  <p className="flex items-center text-gray-400 text-xs font-bold uppercase tracking-widest"><MapPin className="h-3 w-3 mr-1" /> NYC</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-5xl font-black text-green-500 leading-none">{matches[idx].match_score}%</div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Match Quality</p>
              </div>
            </div>
            <div className="space-y-6 mb-10">
              <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100">
                <h4 className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-3 flex items-center"><ShieldCheck className="h-4 w-4 mr-2" /> Clinical Justification</h4>
                <p className="text-sm text-gray-700 leading-relaxed font-medium">{matches[idx].medical_indications_justification}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setIdx((idx + 1) % matches.length)} className="flex-1 py-5 border-2 border-gray-100 rounded-3xl flex justify-center items-center hover:bg-red-50 transition-all group">
                <XCircle className="text-gray-300 group-hover:text-red-500 h-10 w-10 transition-colors" />
              </button>
              <button onClick={() => alert("Handoff Initiated!")} className="flex-[2] py-5 bg-blue-600 text-white rounded-3xl flex justify-center items-center hover:bg-blue-700 transition-all shadow-2xl font-black text-xl gap-3">
                <CheckCircle className="h-8 w-8" /> Select Provider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
