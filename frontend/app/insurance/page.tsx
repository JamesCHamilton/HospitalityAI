"use client";
import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function InsuranceQueue() {
  const [authorizations, setAuthorizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueue = async () => {
    try {
      const res = await fetch('http://localhost:8080/api/queue');
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setAuthorizations(data || []);
    } catch (err) {
      console.error("Failed to fetch queue", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('authorizations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'authorizations'
        },
        (payload) => {
          console.log('Change received!', payload);
          fetchQueue(); // Re-fetch to get the full joined data (patient name, etc.)
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) return (
    <div className="p-8 text-center animate-pulse text-blue-600 font-bold">
      AI Reasoning Engine Syncing...
    </div>
  );

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Payer Authorization Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">Real-time Auto-Adjudication Stream</p>
        </div>
        <div className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse border border-blue-200">
          Supabase Realtime Active
        </div>
      </div>
      
      <div className="space-y-4">
        {authorizations.length === 0 && (
          <div className="p-16 text-center border-4 border-dotted border-gray-100 rounded-[32px] text-gray-400">
            <Clock className="mx-auto h-12 w-12 text-gray-200 mb-4" />
            <p className="font-medium">Waiting for AI decisions...</p>
          </div>
        )}
        {authorizations.map((a) => (
          <div key={a.id} className={`p-6 rounded-[24px] border-2 flex items-center justify-between transition-all hover:shadow-xl hover:scale-[1.01] ${
            a.status === 'AUTO-APPROVED' ? 'bg-green-50 border-green-100' : 
            a.status === 'DENIED' ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'
          }`}>
            <div className="flex items-center space-x-6">
              <div className={`p-4 rounded-2xl ${
                a.status === 'AUTO-APPROVED' ? 'bg-green-100 text-green-600' : 
                a.status === 'DENIED' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'
              }`}>
                {a.status === 'AUTO-APPROVED' && <ShieldCheck className="h-8 w-8" />}
                {a.status === 'DENIED' && <ShieldAlert className="h-8 w-8" />}
                {a.status === 'MANUAL_REVIEW' && <Clock className="h-8 w-8" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-xl text-gray-900">{a.patient_name}</h3>
                  <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded text-gray-500 font-mono font-bold tracking-tighter">
                    {a.id.substring(0,8)}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1 max-w-md font-medium">
                  {a.decision_reason}
                </p>
                <div className="flex gap-4 mt-3 items-center">
                  <div className="px-3 py-1 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-tighter text-gray-400 block leading-none">Priority</span>
                    <span className="text-sm font-bold text-gray-700">{a.priority_score}/100</span>
                  </div>
                  <div className="px-3 py-1 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-tighter text-gray-400 block leading-none">Confidence</span>
                    <span className="text-sm font-bold text-gray-700">{a.confidence_score}%</span>
                  </div>
                  {a.confidence_score < 85 && a.status === 'MANUAL_REVIEW' && (
                    <div className="flex items-center px-3 py-1 bg-orange-100 rounded-lg text-orange-600 border border-orange-200">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      <span className="text-[10px] font-black uppercase tracking-tighter">Review Required</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-widest inline-block ${
                a.status === 'AUTO-APPROVED' ? 'bg-green-600 text-white' : 
                a.status === 'DENIED' ? 'bg-red-600 text-white' : 'bg-yellow-500 text-white'
              }`}>
                {a.status}
              </div>
              <div className="mt-4">
                <button className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest border-b-2 border-blue-100">
                  Inspect FHIR Bundle
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
