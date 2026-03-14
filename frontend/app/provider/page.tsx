"use client";
import React, { useEffect, useState } from 'react';
import { FileText, Database, Send, Printer, User, Clock, AlertCircle } from 'lucide-react';

export default function ProviderDashboard() {
  const [authorizations, setAuthorizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAuth = async () => {
      try {
        const res = await fetch('http://localhost:8080/api/queue');
        const data = await res.json();
        setAuthorizations(data || []);
      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAuth();
  }, []);

  const activeAuth = authorizations[0]; // Show the most recent one

  if (loading) return <div className="p-20 text-center font-bold text-gray-400 animate-pulse">Accessing Secure Clinical Inbox...</div>;

  if (!activeAuth) return (
    <div className="p-20 text-center">
      <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[40px] p-20 inline-block">
        <Clock className="h-16 w-16 text-gray-200 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-gray-400">No Pending Referrals</h2>
        <p className="text-gray-400 mt-2">Waiting for patient handoffs from the AI Matcher.</p>
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-6xl mx-auto animate-in fade-in duration-700">
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter">Clinical Inbox</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest flex items-center">
              <User className="w-3 h-3 mr-1" /> {activeAuth.patient_name}
            </span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              ID: {activeAuth.id.substring(0,8)}
            </span>
          </div>
        </div>
        <div className={`px-6 py-2 rounded-2xl font-black text-sm uppercase tracking-widest border-2 ${
          activeAuth.status === 'AUTO-APPROVED' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-yellow-50 border-yellow-200 text-yellow-700'
        }`}>
          {activeAuth.status}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left: Summary */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-10 rounded-[40px] shadow-sm border border-gray-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-blue-600"></div>
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center">
              <FileText className="w-4 h-4 mr-2 text-blue-600" /> AI Adjudication Summary
            </h2>
            <p className="text-2xl text-gray-800 leading-tight font-bold mb-4 italic">
              "{activeAuth.decision_reason}"
            </p>
            <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
              <h4 className="text-[10px] font-black text-gray-400 uppercase mb-2">Clinical Intent</h4>
              <p className="text-sm text-gray-600 leading-relaxed font-medium">
                Patient prioritized with score {activeAuth.priority_score}/100. FHIR payload contains mapped LOINC codes for Cardiology consultation.
              </p>
            </div>
          </div>

          <div className="bg-gray-900 p-10 rounded-[40px] shadow-2xl relative">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-[10px] font-black text-green-400 uppercase tracking-[0.2em] flex items-center">
                <Database className="w-4 h-4 mr-2" /> Interoperability Layer (FHIR)
              </h2>
              <span className="text-[10px] text-gray-500 font-mono">v4.0.1</span>
            </div>
            <div className="bg-black/50 p-6 rounded-3xl border border-gray-800">
              <pre className="text-xs text-green-500 font-mono overflow-auto max-h-80 custom-scrollbar">
                {JSON.stringify(activeAuth.fhir_blob, null, 2)}
              </pre>
            </div>
            <button className="mt-8 w-full py-5 bg-green-600 text-white rounded-2xl font-black text-lg hover:bg-green-700 flex justify-center items-center transition-all shadow-xl shadow-green-900/20">
              <Send className="w-5 h-5 mr-3" /> Push to EHR (EPIC/Cerner)
            </button>
          </div>
        </div>

        {/* Right: Legacy Fallback */}
        <div className="bg-gray-50 p-8 rounded-[40px] border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] flex items-center">
              <Printer className="w-4 h-4 mr-2" /> e-Fax Fallback
            </h2>
            <AlertCircle className="w-4 h-4 text-gray-300" />
          </div>
          <div className="bg-white p-6 h-[500px] text-[10px] font-mono whitespace-pre border border-gray-200 shadow-inner rounded-2xl overflow-auto leading-relaxed text-gray-500">
            {activeAuth.efax_payload}
          </div>
          <button className="mt-6 w-full py-4 bg-gray-800 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-black transition-colors">
            Transmit via e-Fax
          </button>
          <p className="text-[10px] text-center text-gray-400 mt-4 font-bold uppercase tracking-tighter">
            Compliant with HIPAA Security Rule
          </p>
        </div>
      </div>
    </div>
  );
}
