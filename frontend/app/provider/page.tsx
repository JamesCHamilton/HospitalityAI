"use client";
import { FileText, Database, Send, Printer } from 'lucide-react';

export default function ProviderDashboard() {
  const mockHandoff = {
    clinical_brief: "Patient presents with acute chest pain and history of hypertension. Symptoms suggest potential CAD. Medicaid Fidelis identified.",
    fhir: { resourceType: "ServiceRequest", status: "active", intent: "order", code: { coding: [{ system: "http://loinc.org", code: "34534-1" }] } },
    fax: "CLINICAL REFERRAL MEMO\nTO: Cardiology Dept\nFROM: Ethical Matcher Agent\nSUBJECT: Patient John Doe\n\nClinical Summary: ..."
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Provider Clinical Inbox</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left: Summary */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-sm font-bold text-gray-400 uppercase mb-4 flex items-center">
              <FileText className="w-4 h-4 mr-2" /> AI Clinical Summary
            </h2>
            <p className="text-lg text-gray-800 leading-relaxed">{mockHandoff.clinical_brief}</p>
          </div>

          <div className="bg-gray-900 p-6 rounded-2xl shadow-xl">
            <h2 className="text-sm font-bold text-green-400 uppercase mb-4 flex items-center">
              <Database className="w-4 h-4 mr-2" /> Modern Interoperability (FHIR)
            </h2>
            <pre className="text-xs text-green-500 font-mono overflow-auto max-h-60">
              {JSON.stringify(mockHandoff.fhir, null, 2)}
            </pre>
            <button className="mt-6 w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 flex justify-center items-center">
              <Send className="w-4 h-4 mr-2" /> Sync to EPIC / Cerner
            </button>
          </div>
        </div>

        {/* Right: Legacy Fallback */}
        <div className="bg-gray-100 p-6 rounded-2xl border border-gray-200">
          <h2 className="text-sm font-bold text-gray-500 uppercase mb-4 flex items-center">
            <Printer className="w-4 h-4 mr-2" /> Legacy Fallback (Fax)
          </h2>
          <div className="bg-white p-4 h-96 text-[10px] font-mono whitespace-pre border border-gray-300 shadow-inner">
            {mockHandoff.fax}
          </div>
          <button className="mt-6 w-full py-3 bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-900">
            Transmit via e-Fax
          </button>
        </div>
      </div>
    </div>
  );
}