"use client";
import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Clock, RefreshCcw, XCircle, CheckCircle2, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function InsuranceQueue() {
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClaims = async () => {
    try {
      // Using the detail-rich endpoint from your main.py
      const res = await fetch('http://localhost:8080/pending-with-claim');
      // Also fetch non-pending claims to fill the other columns
      // For a production app, we'd have a single endpoint, but we'll simulate here
      const resAll = await fetch('http://localhost:8080/api/queue'); 
      const data = await resAll.json();
      setClaims(data || []);
    } catch (err) {
      console.error("Failed to fetch claims", err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    await fetch(`http://localhost:8080/claims/${id}/approve`, { method: 'POST' });
    fetchClaims();
  };

  const handleDeny = async (id: string) => {
    await fetch(`http://localhost:8080/claims/${id}/disapprove`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: "Manual denial by adjudicator" })
    });
    fetchClaims();
  };

  const handleReopen = async (id: string) => {
    // Reopen moves it back to manual review (status: pending)
    await fetch(`http://localhost:8080/claims/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending' })
    });
    fetchClaims();
  };

  useEffect(() => {
    fetchClaims();
    // Subscribe to any changes in the authorizations/claims table
    const channel = supabase.channel('claims_sync').on('postgres_changes', { event: '*', schema: 'public', table: 'authorizations' }, () => fetchClaims()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) return <div className="p-20 text-center font-black text-blue-600 animate-pulse uppercase tracking-[0.2em]">Syncing Claims...</div>;

  // Filter based on the status strings used in your backend endpoints
  const manual = claims.filter(c => c.status === 'pending' || c.status === 'MANUAL_REVIEW');
  const accepted = claims.filter(c => c.status === 'approved' || c.status === 'AUTO-APPROVED');
  const denied = claims.filter(c => c.status === 'denied' || c.status === 'DENIED');

  const ClaimColumn = ({ title, items, color, icon: Icon, isManual }: any) => (
    <div className="flex-1 flex flex-col min-w-[350px] bg-gray-50/50 rounded-[32px] border border-gray-100 p-6 h-[calc(100vh-150px)]">
      <div className="flex items-center justify-between mb-6 px-2">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-white shadow-sm ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <h2 className="font-black uppercase tracking-widest text-xs text-gray-600">{title}</h2>
        </div>
        <span className="bg-white px-3 py-1 rounded-full text-[10px] font-bold text-gray-400 shadow-sm border border-gray-50">{items.length}</span>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
        {items.map((c: any) => (
          <div key={c.id || c.claim_id} className="bg-white p-6 rounded-2xl border-2 border-transparent shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all group">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-black text-gray-900 text-lg leading-none mb-1">{c.patient_name || "Patient"}</h3>
                <span className="text-[10px] font-mono text-gray-400 uppercase">Ref: {(c.id || c.claim_id).substring(0,8)}</span>
              </div>
              <div className="px-2 py-1 bg-gray-50 rounded text-[8px] font-black text-gray-400 uppercase tracking-tighter">Priority: {c.priority_score || 50}</div>
            </div>
            
            <p className="text-xs text-gray-500 font-medium leading-relaxed italic mb-6 line-clamp-3">
              "{c.decision_reason || c.description || "No clinical notes available."}"
            </p>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-50">
              {isManual ? (
                <>
                  <button 
                    onClick={() => handleApprove(c.id || c.claim_id)}
                    className="flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-700 transition-all shadow-lg shadow-green-900/20"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Accept
                  </button>
                  <button 
                    onClick={() => handleDeny(c.id || c.claim_id)}
                    className="flex items-center justify-center gap-2 py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-900/20"
                  >
                    <XCircle className="w-3 h-3" /> Deny
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => handleReopen(c.id || c.claim_id)}
                    className="flex items-center justify-center gap-2 py-3 border-2 border-gray-100 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all"
                  >
                    <RefreshCcw className="w-3 h-3" /> Reopen
                  </button>
                  <button className="flex items-center justify-center gap-2 py-3 border-2 border-gray-100 text-gray-300 rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-gray-500 transition-all cursor-not-allowed">
                    <Lock className="w-3 h-3" /> Close
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-10 h-screen overflow-hidden flex flex-col bg-white">
      <div className="flex justify-between items-end mb-10 shrink-0">
        <div>
          <h1 className="text-5xl font-black text-gray-900 tracking-tighter mb-2">Adjudication Pipeline</h1>
          <div className="flex items-center gap-4">
            <p className="text-sm text-gray-400 font-bold uppercase tracking-[0.2em]">Internal Insurance Terminal</p>
            <div className="h-1 w-1 rounded-full bg-gray-300"></div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-ping"></div>
              <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Real-time Connection Stable</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex gap-8 overflow-x-auto pb-6 flex-1 px-2">
        <ClaimColumn title="Manual Review" items={manual} color="text-yellow-500" icon={Clock} isManual={true} />
        <ClaimColumn title="Accepted" items={accepted} color="text-green-600" icon={ShieldCheck} isManual={false} />
        <ClaimColumn title="Denied" items={denied} color="text-red-600" icon={ShieldAlert} isManual={false} />
      </div>
    </div>
  );
}
