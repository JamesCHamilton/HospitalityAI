"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BadgePercent,
  CircleUserRound,
  Building2,
  ClipboardList,
  ScrollText,
  ShieldCheck,
  BookOpenCheck,
  FileBadge,
  Hospital,
  ArrowRightLeft,
  UserSquare
} from "lucide-react";

type Insurance = {
  insurance_id: string;
  insurance_name: string;
  insurer: string;
  plan_type: string;
};

type Provider = {
  npi: string;
  provider_name: string;
  address: string;
  insurances: Insurance[];
  // ...add more provider fields as needed
};

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  clinical_history: string;
  insurance_id?: string;
  // ...add more patient fields as needed
};

type Claim = {
  claim_id: string;
  patient_id: string;
  provider_npi: string;
  description: string;
  diagnosis_codes: string[];
  status: string;
  provider: Provider;
  patient: Patient;
  // ...add more claim fields as needed
};

const statusMeta = {
  pending: {
    label: "Pending",
    color: "text-yellow-600 border-yellow-100 bg-yellow-50",
    icon: <AlertTriangle className="w-4 h-4 mr-1 text-yellow-600" />
  },
  approved: {
    label: "Approved",
    color: "text-green-600 border-green-100 bg-green-50",
    icon: <CheckCircle2 className="w-4 h-4 mr-1 text-green-600" />
  },
  denied: {
    label: "Denied",
    color: "text-red-600 border-red-100 bg-red-50",
    icon: <XCircle className="w-4 h-4 mr-1 text-red-600" />
  }
};

// Modern Card component for each claim
function ClaimCard({ claim }: { claim: Claim }) {
  const meta = statusMeta[claim.status as keyof typeof statusMeta] || statusMeta.pending;
  return (
    <div className={`rounded-2xl shadow flex flex-col md:flex-row gap-6 p-6 border-2 ${meta.color} transition-all`}>
      <div className="flex flex-col justify-between min-w-[120px] md:w-[170px]">
        <div className="flex items-center mb-4">
          {meta.icon}
          <span className={`font-bold uppercase text-xs tracking-widest ${meta.color}`}>{meta.label}</span>
        </div>
        <div className="flex items-center text-gray-400 gap-2 text-xs font-mono">
          <ClipboardList className="w-4 h-4" />
          <span>Claim #{claim.claim_id}</span>
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-1">
          <div className="flex items-center gap-2 text-md font-semibold text-gray-900">
            <Hospital className="w-5 h-5 text-blue-500" />
            {claim.provider?.provider_name || claim.provider_npi}
          </div>
          <div className="flex flex-row gap-5 mt-2 md:mt-0">
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <UserSquare className="w-4 h-4" />
              {claim.patient?.first_name} {claim.patient?.last_name}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Building2 className="w-4 h-4" />
              {claim.provider?.address}
            </div>
          </div>
        </div>
        <div className="flex flex-row gap-6 flex-wrap text-sm">
          <div className="flex-1 min-w-[160px]">
            <div className="flex items-center gap-2 text-gray-900">
              <ScrollText className="w-4 h-4 text-blue-500" />
              <span className="font-semibold">Diagnosis</span>
            </div>
            <div className="mt-1 text-gray-700">
              {Array.isArray(claim.diagnosis_codes)
                ? claim.diagnosis_codes.join(", ")
                : claim.diagnosis_codes}
            </div>
          </div>
          <div className="flex-1 min-w-[160px]">
            <div className="flex items-center gap-2 text-gray-900">
              <BadgePercent className="w-4 h-4 text-emerald-500" />
              <span className="font-semibold">Provider Insurances</span>
            </div>
            <div className="mt-1 text-gray-700">
              {claim.provider?.insurances && claim.provider.insurances.length > 0 ? (
                <ul className="list-disc ml-4">
                  {claim.provider.insurances.map((ins) => (
                    <li key={ins.insurance_id} className="text-xs">
                      <span className="font-bold text-gray-800">{ins.insurance_name}</span>{" "}
                      <span className="text-[11px] text-gray-400 font-normal">({ins.plan_type})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-gray-400 text-xs">N/A</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-row gap-3 flex-wrap mt-2">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <FileBadge className="w-4 h-4" />
            <span>Description: </span>
            <span className="font-medium text-gray-500">{claim.description || "No details"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PatientClaimsPage() {
  const { id } = useParams() as { id: string };
  const [claims, setClaims] = useState<Claim[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchClaimsAndPatient() {
      setLoading(true);
      setError(null);
      try {
        const claimsRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL || ""}/claims/by-patient/${id}`
        );
        if (!claimsRes.ok) throw new Error("Failed to fetch claims");
        const claimsData = await claimsRes.json();
        setClaims(Array.isArray(claimsData) ? claimsData : []);

        const patientRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL || ""}/patient/${id}`
        );
        if (!patientRes.ok) throw new Error("Failed to fetch patient info");
        const patientData = await patientRes.json();
        setPatient(patientData);
      } catch (err: any) {
        setError(err?.message || "Unknown error");
      }
      setLoading(false);
    }
    if (id) fetchClaimsAndPatient();
  }, [id]);

  // Modern chips with icons for status
  function SectionHeader({ title, icon, color }: { title: string; icon: React.ReactNode; color: string }) {
    return (
      <div className="flex items-center gap-2 mb-4 mt-6">
        <div className={`${color} bg-white shadow px-3 py-1 rounded-lg flex items-center`}>
          {icon}
          <span className="font-bold tracking-wider text-sm ml-1">{title}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-6 flex items-center gap-3">
        <ClipboardList className="w-8 h-8 text-blue-500" />
        <span>Your Claims</span>
      </h1>

      {/* Patient Info Card */}
      {!loading && patient && (
        <div className="mb-10">
          <div className="rounded-3xl bg-white border border-gray-100 shadow-lg p-8 flex flex-col md:flex-row items-start gap-8 animate-in fade-in">
            <div className="bg-blue-50 text-blue-500 p-4 rounded-full shadow flex items-center justify-center">
              <CircleUserRound className="w-10 h-10" />
            </div>
            <div className="flex-1 text-gray-800">
              <div className="flex flex-row items-center gap-6 flex-wrap">
                <div>
                  <span className="uppercase tracking-widest text-[10px] text-gray-400 font-bold block mb-1">Name</span>
                  <div className="font-bold text-lg flex items-center gap-2">
                    <span>{patient.first_name} {patient.last_name}</span>
                  </div>
                </div>
                <div>
                  <span className="uppercase tracking-widest text-[10px] text-gray-400 font-bold block mb-1">Insurance</span>
                  <div className="flex items-center gap-2 text-base">
                    <ShieldCheck className="w-5 h-5 text-green-500" />
                    <span className="font-mono font-medium text-gray-700">
                      {patient.insurance_id || "N/A"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <span className="uppercase tracking-widest text-[10px] text-gray-400 font-bold block mb-1">Clinical History</span>
                <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 px-4 py-2 rounded-lg">
                  <BookOpenCheck className="w-4 h-4 text-violet-500" />
                  <span>{patient.clinical_history}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex gap-2 items-center text-blue-500 text-base font-bold animate-pulse my-12">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading...</span>
        </div>
      )}
      {error && (
        <div className="flex gap-2 items-center text-red-500 p-3 rounded-lg bg-red-50 mb-6 shadow">
          <AlertTriangle className="w-5 h-5" />
          <span>Error: {error}</span>
        </div>
      )}
      {!loading && claims.length === 0 && (
        <div className="flex gap-2 items-center text-gray-400 p-3 rounded-lg bg-gray-50 shadow mb-10">
          <ScrollText className="w-5 h-5" />
          <span>No claims found for this patient.</span>
        </div>
      )}

      {!loading && claims.length > 0 && (
        <div className="space-y-10 mt-4">
          {/* Row: Pending */}
          <section>
            <SectionHeader
              title="Pending"
              color="text-yellow-600 border-yellow-100"
              icon={<AlertTriangle className="w-5 h-5 text-yellow-500" />}
            />
            {claims.filter(claim => claim.status === "pending").length === 0 ? (
              <div className="flex items-center gap-2 text-gray-400 px-3 py-2 bg-yellow-50/70 rounded mb-2 animate-in fade-in">
                <ArrowRightLeft className="w-4 h-4" />
                No pending claims.
              </div>
            ) : (
              <div className="space-y-5">
                {claims
                  .filter((claim) => claim.status === "pending")
                  .map((claim) => (
                    <ClaimCard key={claim.claim_id} claim={claim} />
                  ))}
              </div>
            )}
          </section>

          {/* Row: Approved */}
          <section>
            <SectionHeader
              title="Approved"
              color="text-green-600 border-green-100"
              icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
            />
            {claims.filter(claim => claim.status === "approved").length === 0 ? (
              <div className="flex items-center gap-2 text-gray-400 px-3 py-2 bg-green-50/70 rounded mb-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" />
                No approved claims.
              </div>
            ) : (
              <div className="space-y-5">
                {claims
                  .filter((claim) => claim.status === "approved")
                  .map((claim) => (
                    <ClaimCard key={claim.claim_id} claim={claim} />
                  ))}
              </div>
            )}
          </section>

          {/* Row: Denied */}
          <section>
            <SectionHeader
              title="Denied"
              color="text-red-600 border-red-100"
              icon={<XCircle className="w-5 h-5 text-red-500" />}
            />
            {claims.filter(claim => claim.status === "denied").length === 0 ? (
              <div className="flex items-center gap-2 text-gray-400 px-3 py-2 bg-red-50/70 rounded mb-2 animate-in fade-in">
                <XCircle className="w-4 h-4" />
                No denied claims.
              </div>
            ) : (
              <div className="space-y-5">
                {claims
                  .filter((claim) => claim.status === "denied")
                  .map((claim) => (
                    <ClaimCard key={claim.claim_id} claim={claim} />
                  ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
