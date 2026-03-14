"use client";
import Link from 'next/link';
import { UserSearch, Stethoscope, Landmark, ArrowRight, Activity, ShieldCheck, Zap } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <header className="py-20 px-4 text-center bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-200">
              <Activity className="text-white h-8 w-8" />
            </div>
          </div>
          <h1 className="text-6xl font-black text-gray-900 tracking-tight mb-6">
            Ethical <span className="text-blue-600">Specialist</span> Matcher
          </h1>
          <p className="text-xl text-gray-600 mb-10 leading-relaxed">
            Eliminating $1T in administrative waste through 
            <span className="font-bold text-gray-900"> automated triage</span>, 
            <span className="font-bold text-gray-900"> FHIR-native handoffs</span>, and 
            <span className="font-bold text-gray-900"> AI auto-adjudication</span>.
          </p>
          
          <div className="flex justify-center gap-4">
            <span className="px-4 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-500 uppercase tracking-widest border border-gray-200">Built for Blaxel Hackathon 2026</span>
          </div>
        </div>
      </header>

      {/* Persona Selection: The Core Navigation */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Persona 1: Patient */}
          <Link href="/patient" className="group">
            <div className="h-full p-8 rounded-3xl border-2 border-gray-100 hover:border-blue-500 hover:shadow-2xl hover:shadow-blue-100 transition-all bg-white">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-600 transition-colors">
                <UserSearch className="text-blue-600 group-hover:text-white h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold mb-3 text-gray-900">Patient Portal</h2>
              <p className="text-gray-500 mb-6">Simulate messy PDF referral extraction and ethical specialist matching with swiping UX.</p>
              <div className="flex items-center text-blue-600 font-bold">
                Start Triage <ArrowRight className="ml-2 h-4 w-4" />
              </div>
            </div>
          </Link>

          {/* Persona 2: Provider */}
          <Link href="/provider" className="group">
            <div className="h-full p-8 rounded-3xl border-2 border-gray-100 hover:border-green-500 hover:shadow-2xl hover:shadow-green-100 transition-all bg-white">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-green-600 transition-colors">
                <Stethoscope className="text-green-600 group-hover:text-white h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold mb-3 text-gray-900">Provider Inbox</h2>
              <p className="text-gray-500 mb-6">View AI-generated clinical briefs, FHIR payloads, and legacy e-Fax fallback artifacts.</p>
              <div className="flex items-center text-green-600 font-bold">
                Open Inbox <ArrowRight className="ml-2 h-4 w-4" />
              </div>
            </div>
          </Link>

          {/* Persona 3: Payer/Insurance */}
          <Link href="/insurance" className="group">
            <div className="h-full p-8 rounded-3xl border-2 border-gray-100 hover:border-purple-500 hover:shadow-2xl hover:shadow-purple-100 transition-all bg-white">
              <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-purple-600 transition-colors">
                <Landmark className="text-purple-600 group-hover:text-white h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold mb-3 text-gray-900">Payer Dashboard</h2>
              <p className="text-gray-500 mb-6">Manage the prioritized Auth queue with auto-adjudication and confidence scoring.</p>
              <div className="flex items-center text-purple-600 font-bold">
                View Queue <ArrowRight className="ml-2 h-4 w-4" />
              </div>
            </div>
          </Link>

        </div>
      </section>

      {/* Tech Stack Observability Section (Judge's Favorite) */}
      <footer className="bg-gray-50 py-20 px-6 border-t border-gray-100">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em] mb-10">System Infrastructure</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
            <div className="flex flex-col items-center">
              <Zap className="h-6 w-6 mb-2" />
              <span className="text-xs font-bold">Blaxel Agents</span>
            </div>
            <div className="flex flex-col items-center">
              <ShieldCheck className="h-6 w-6 mb-2" />
              <span className="text-xs font-bold">Unsiloed AI</span>
            </div>
            <div className="flex flex-col items-center">
              <Activity className="h-6 w-6 mb-2" />
              <span className="text-xs font-bold">Crustdata API</span>
            </div>
            <div className="flex flex-col items-center">
              <DatabaseIcon className="h-6 w-6 mb-2" />
              <span className="text-xs font-bold">NPI FHIR Data</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function DatabaseIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}