"use client";
import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  XCircle,
  CheckCircle2,
  Eye,
} from 'lucide-react';

type Claim = {
  id: string;
  status: string;
  patient_name: string;
  provider_name: string;
  priority_score: number | null;
  diagnosis_codes: string[] | string;
  description: string;
  decision_reason?: string | null;
  created_at?: string;
  [key: string]: any;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

const ENDPOINTS = {
  claims: () => `${API_BASE}/claims`,
  approve: (id: string) => `${API_BASE}/claims/${id}/approve`,
  deny: (id: string) => `${API_BASE}/claims/${id}/disapprove`,
  detail: (id: string) => `${API_BASE}/claims/${id}`,
};

const CLAIM_TOP_FIELDS = (c: Claim) => [
  {
    label: 'Patient',
    value: c.patient_name || 'Unknown',
  },
  {
    label: 'Provider',
    value: c.provider_name || 'Unknown',
  },
  {
    label: 'Diagnosis',
    value: Array.isArray(c.diagnosis_codes)
      ? c.diagnosis_codes.join(', ')
      : typeof c.diagnosis_codes === 'string'
      ? c.diagnosis_codes
      : 'N/A',
  },
  {
    label: 'Priority',
    value:
      c.priority_score !== undefined && c.priority_score !== null
        ? Math.round(Number(c.priority_score) * 100) / 100
        : '--',
  },
];

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed z-50 top-0 left-0 w-full h-full bg-black/30 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 min-w-[340px] max-w-[96vw] max-h-[90vh] shadow-2xl border overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg">{title}</h2>
          <button
            aria-label="Close"
            className="text-gray-400 hover:text-red-500"
            onClick={onClose}
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function InsuranceQueue() {
  // Separate claims state by status ("pending", "approved", "denied")
  const [claimsByStatus, setClaimsByStatus] = useState<{
    pending: Claim[];
    approved: Claim[];
    denied: Claim[];
  }>({ pending: [], approved: [], denied: [] });
  const [loading, setLoading] = useState(true);

  // View state
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'deny' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [processingAction, setProcessingAction] = useState(false);

  // One query per section. Fetch by status, do NOT bulk fetch.
  const fetchClaimsByStatus = useCallback(async (status: "pending" | "approved" | "denied") => {
    const url = `${ENDPOINTS.claims()}?status=${encodeURIComponent(status)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch claims with status=${status}: ${res.status}`);
    const data = await res.json();
    // Set up local array to accumulate fully detailed claims
    const detailedClaims: Claim[] = [];
    if (Array.isArray(data)) {
      for (const claimSummary of data) {
        if (!claimSummary.id) continue;
        try {
          const detailRes = await fetch(ENDPOINTS.detail(claimSummary.id));
          if (!detailRes.ok) throw new Error();
          const claimDetail = await detailRes.json();
          detailedClaims.push({ ...claimSummary, ...claimDetail });
        } catch {
          // If failed, just push the summary
          detailedClaims.push(claimSummary);
        }
      }
    }
    return detailedClaims;
  }, []);

  // Fetch all three statuses on mount and after actions
  const fetchAllStatusClaims = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, approved, denied] = await Promise.all([
        fetchClaimsByStatus("pending"),
        fetchClaimsByStatus("approved"),
        fetchClaimsByStatus("denied"),
      ]);
      setClaimsByStatus({
        pending: pending,
        approved: approved,
        denied: denied,
      });
    } catch (err) {
      console.error('Failed to fetch all claims by status', err);
      setClaimsByStatus({ pending: [], approved: [], denied: [] });
    } finally {
      setLoading(false);
    }
  }, [fetchClaimsByStatus]);

  useEffect(() => {
    fetchAllStatusClaims();
    // If real-time refresh is desired, uncomment below:
    // const interval = setInterval(fetchAllStatusClaims, 5000);
    // return () => clearInterval(interval);
  }, [fetchAllStatusClaims]);

  const openActionModal = (claim: Claim, type: 'approve' | 'deny') => {
    setSelectedClaim(claim);
    setActionType(type);
    setActionReason('');
    setShowActionModal(true);
  };

  const submitAction = async () => {
    if (!selectedClaim || !actionType) return;
    setProcessingAction(true);
    const id = selectedClaim.id;
    if (!id) return;
    try {
      if (actionType === 'approve') {
        await fetch(ENDPOINTS.approve(id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: actionReason }),
        });
      } else {
        await fetch(ENDPOINTS.deny(id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: actionReason }),
        });
      }
      setShowActionModal(false);
      setSelectedClaim(null);
      await fetchAllStatusClaims();
    } catch (err) {
      alert('Error updating claim.');
    } finally {
      setProcessingAction(false);
    }
  };

  const openDetail = (claim: Claim) => {
    setSelectedClaim(claim);
    setShowDetailModal(true);
  };

  const ClaimCard = ({
    claim,
    onViewMore,
    onApprove,
    onDeny,
    showActions,
  }: {
    claim: Claim;
    onViewMore: (c: Claim) => void;
    onApprove: (c: Claim) => void;
    onDeny: (c: Claim) => void;
    showActions: boolean;
  }) => (
    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition flex flex-col gap-2">
      <div className="flex justify-between items-center mb-2">
        <span className="font-mono text-[11px] text-gray-400 uppercase font-bold">
          Ref: {(claim.id || '').toString().substring(0, 8)}
        </span>
        <span className="px-2 py-0.5 bg-gray-50 rounded-full text-[11px] font-bold text-gray-500 shadow-sm border border-gray-100">
          {claim.status}
        </span>
      </div>
      <div className="space-y-2 mb-3">
        {CLAIM_TOP_FIELDS(claim).map((f, i) => (
          <div className="flex gap-2 items-center" key={i}>
            <span className="font-medium text-gray-500 text-xs w-20">{f.label}:</span>
            <span className="text-xs font-bold text-gray-800 truncate" title={typeof f.value === 'string' ? f.value : undefined}>
              {f.value}
            </span>
          </div>
        ))}
      </div>
      {showActions && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onApprove(claim)}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 text-white rounded-lg text-xs font-black uppercase hover:bg-green-700 transition"
          >
            <CheckCircle2 className="h-4 w-4" /> Approve
          </button>
          <button
            onClick={() => onDeny(claim)}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-600 text-white rounded-lg text-xs font-black uppercase hover:bg-red-700 transition"
          >
            <XCircle className="h-4 w-4" /> Deny
          </button>
        </div>
      )}
      <button
        onClick={() => onViewMore(claim)}
        className="flex gap-2 items-center text-blue-600 hover:underline text-[11px] font-bold mt-2 self-end"
      >
        <Eye className="h-4 w-4" /> View More
      </button>
    </div>
  );

  // Claims section now fetches its data from claimsByStatus prop
  function ClaimsSection({
    title,
    icon: Icon,
    color,
    status,
    showActions,
    claims,
  }: {
    title: string;
    icon: any;
    color: string;
    status: string;
    showActions: boolean;
    claims: Claim[];
  }) {
    return (
      <div className="flex-1 min-w-[330px] max-w-[410px] px-1 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <Icon className={`w-5 h-5 ${color}`} />
          <span className="text-xs uppercase font-black tracking-widest text-gray-700">
            {title}
          </span>
          <span className="ml-2 px-2 py-[0.5px] bg-gray-100 rounded-full text-[10px] text-gray-500 font-bold">
            {claims.length}
          </span>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar">
          {claims.length === 0 ? (
            <div className="text-xs text-gray-400 italic p-5 text-center">No claims.</div>
          ) : (
            claims.map((claim) => (
              <ClaimCard
                key={claim.id}
                claim={claim}
                onViewMore={openDetail}
                onApprove={(c) => openActionModal(c, 'approve')}
                onDeny={(c) => openActionModal(c, 'deny')}
                showActions={true}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  if (loading)
    return (
      <div className="p-20 text-center font-black text-blue-600 animate-pulse uppercase tracking-[0.2em]">
        Syncing Claims...
      </div>
    );

  return (
    <div className="p-10 h-screen overflow-hidden flex flex-col bg-white">
      <div className="flex justify-between items-end mb-10 shrink-0">
        <div>
          <h1 className="text-5xl font-black text-gray-900 tracking-tighter mb-2">
            Claims Pipeline
          </h1>
          <div className="flex items-center gap-4">
            <p className="text-sm text-gray-400 font-bold uppercase tracking-[0.2em]">
              Internal Insurance Terminal
            </p>
            <div className="h-1 w-1 rounded-full bg-gray-300"></div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-ping"></div>
              <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">
                Real-time Connection Stable
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* Sections */}
      <div className="flex gap-8 overflow-x-auto pb-6 flex-1 px-2">
        <ClaimsSection
          title="Pending"
          icon={Clock}
          color="text-yellow-500"
          status="pending"
          showActions={true}
          claims={claimsByStatus.pending}
        />
        <ClaimsSection
          title="Approved"
          icon={ShieldCheck}
          color="text-green-600"
          status="approved"
          showActions={false}
          claims={claimsByStatus.approved}
        />
        <ClaimsSection
          title="Denied"
          icon={ShieldAlert}
          color="text-red-600"
          status="denied"
          showActions={false}
          claims={claimsByStatus.denied}
        />
      </div>
      {/* Detail Modal */}
      <Modal
        open={showDetailModal && selectedClaim !== null}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedClaim(null);
        }}
        title="Claim Details"
      >
        {selectedClaim ? (
          <div className="text-sm">
            <pre className="bg-gray-50 border rounded-lg p-3 text-gray-700 overflow-x-auto max-h-[60vh]">
              {JSON.stringify(selectedClaim, null, 2)}
            </pre>
          </div>
        ) : null}
      </Modal>
      {/* Approve/Deny Modal */}
      <Modal
        open={showActionModal && selectedClaim !== null && !!actionType}
        onClose={() => {
          if (processingAction) return;
          setShowActionModal(false);
          setSelectedClaim(null);
        }}
        title={
          actionType === 'approve'
            ? 'Approve Claim - Reason Required'
            : 'Deny Claim - Reason Required'
        }
      >
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">
            Please provide a reason for this action:
          </label>
          <textarea
            value={actionReason}
            onChange={(e) => setActionReason(e.target.value)}
            rows={4}
            className="w-full border rounded-lg p-2 mb-4 text-gray-700"
            placeholder="Reason (required)"
            disabled={processingAction}
          />
          <button
            onClick={submitAction}
            disabled={!actionReason.trim() || processingAction}
            className={`w-full py-2 rounded-lg font-bold flex gap-2 items-center justify-center text-xs uppercase ${
              actionType === 'approve'
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-red-600 text-white hover:bg-red-700'
            } transition disabled:opacity-60`}
          >
            {processingAction ? (
              <span>Processing...</span>
            ) : actionType === 'approve' ? (
              <>
                <CheckCircle2 className="w-4 h-4" /> Confirm Approve
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" /> Confirm Deny
              </>
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}
