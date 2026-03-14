"use client";
import { ShieldCheck, ShieldAlert, Clock } from 'lucide-react';

export default function InsuranceQueue() {
  const claims = [
    { id: "CLM-001", name: "John Doe", score: 95, status: "AUTO-APPROVED", reason: "Acute cardiac escalation + In-Network" },
    { id: "CLM-002", name: "Jane Smith", score: 40, status: "AUTO-DENIED", reason: "Step Therapy Violation: MRI requested before PT" },
    { id: "CLM-003", name: "Bob Johnson", score: 82, status: "MANUAL_REVIEW", reason: "Ambiguous symptoms; review confidence < 85%" }
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Payer Authorization Dashboard</h1>
      <div className="space-y-4">
        {claims.map((c) => (
          <div key={c.id} className={`p-6 rounded-2xl border-2 flex items-center justify-between ${
            c.status === 'AUTO-APPROVED' ? 'bg-green-50 border-green-100' : 
            c.status === 'AUTO-DENIED' ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'
          }`}>
            <div className="flex items-center space-x-4">
              {c.status === 'AUTO-APPROVED' && <ShieldCheck className="text-green-600 h-8 w-8" />}
              {c.status === 'AUTO-DENIED' && <ShieldAlert className="text-red-600 h-8 w-8" />}
              {c.status === 'MANUAL_REVIEW' && <Clock className="text-yellow-600 h-8 w-8" />}
              <div>
                <h3 className="font-bold text-lg">{c.name} <span className="text-xs text-gray-400 ml-2">{c.id}</span></h3>
                <p className="text-sm text-gray-600 italic">"{c.reason}"</p>
                <div className="flex gap-4 mt-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Priority: {c.score}/100</span>
                </div>
              </div>
            </div>
            <div className="text-right font-black text-xs uppercase tracking-widest">
              {c.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}