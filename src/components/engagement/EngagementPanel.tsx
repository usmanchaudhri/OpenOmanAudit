'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  ENGAGEMENT_STAGES,
  DOCUMENT_STATUSES,
  canEditChecklist,
  canLeaveCompleteness,
  canLeaveDocuments,
  canPerform,
  canSchedule,
  isLicensedAuditor,
  nextStage,
  returnStage,
  stageByKey,
} from '@/lib/engagement';

export interface EngagementDocument {
  id: string;
  name: string;
  status: string;
  note: string | null;
  fileName: string | null;
  updatedBy: string | null;
}

export interface EngagementEvent {
  id: string;
  fromStage: string;
  toStage: string;
  action: string;
  note: string | null;
  performedBy: string;
  createdAt: string;
}

export interface EngagementAudit {
  id: string;
  title: string;
  auditYear: string | null;
  engagementStage: string;
  stageOwner: string | null;
  dueDate: string | null;
  releasedAt: string | null;
  releasedBy: string | null;
  releasedReportName: string | null;
  role: string;
  documents: EngagementDocument[];
  events: EngagementEvent[];
}

function formatWhen(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'd MMM yyyy');
}

const STATUS_CLASS: Record<string, string> = {
  Missing: 'bg-red-50 text-red-700 border-red-200',
  Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  Accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Clarification required': 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function EngagementPanel({ audit }: { audit: EngagementAudit }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dueDate, setDueDate] = useState(audit.dueDate ? audit.dueDate.slice(0, 10) : '');
  const [auditYear, setAuditYear] = useState(audit.auditYear || '');
  const [newDocument, setNewDocument] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState(audit.documents);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDocuments(audit.documents);
  }, [audit.documents]);

  const stage = stageByKey(audit.engagementStage || 'Onboarding');
  const released = Boolean(audit.releasedAt) || stage.key === 'Release';
  const upcoming = nextStage(stage.key);
  const sendBack = returnStage(stage.key);
  const role = audit.role;

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/audits/${audit.id}/engagement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'The engagement could not be updated.');
        return null;
      }
      setNote('');
      toast.success('Engagement updated');
      router.refresh();
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function sendChecklistFile(documentId: string, file: File) {
    const body = new FormData();
    body.set('file', file);
    body.set('auditId', audit.id);
    body.set('documentId', documentId);
    body.set('type', 'document');
    const res = await fetch('/api/upload', { method: 'POST', body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'The file could not be uploaded.');
      return null;
    }
    return data as { fileName?: string; status?: string; updatedBy?: string };
  }

  function rememberUpload(documentId: string, uploaded: { fileName?: string; status?: string; updatedBy?: string }) {
    setDocuments((current) => current.map((item) => item.id === documentId
      ? {
          ...item,
          fileName: uploaded.fileName || item.fileName,
          status: uploaded.status || 'Submitted',
          updatedBy: uploaded.updatedBy || item.updatedBy,
        }
      : item));
  }

  async function addRequestedDocument(event: React.FormEvent) {
    event.preventDefault();
    const chosen = newFile;
    const name = newDocument.trim() || (chosen ? chosen.name.replace(/\.[^.]+$/, '') : '');
    if (!name) {
      setError('Enter a document name or choose a file to upload.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/audits/${audit.id}/engagement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-document', name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.document) {
        setError(data.error || 'The document could not be added.');
        return;
      }
      const created = data.document as EngagementDocument;
      setDocuments((current) => [...current, created]);
      if (chosen) {
        const uploaded = await sendChecklistFile(created.id, chosen);
        if (uploaded) rememberUpload(created.id, uploaded);
      }
      setNewDocument('');
      setNewFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success(chosen ? 'Document added and file uploaded' : 'Document added');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function uploadReport(file: File) {
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('auditId', audit.id);
      body.set('type', 'release');
      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'The report could not be uploaded.');
        return;
      }
      toast.success('Signed PDF attached');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const handoffBlocked = stage.key === 'Documents' && !canLeaveDocuments(documents)
    || stage.key === 'Completeness' && !canLeaveCompleteness(documents);
  const canAttachFiles = canEditChecklist(role, stage.key, released);

  return (
    <section className="mb-8 bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8 space-y-8">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Engagement workflow · stage {stage.number} of 7</p>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">{stage.key}</h2>
        <p className="text-sm text-slate-500">{stage.detail}. Every hand-off, query, and approval is stamped with a name and date. Working papers stay on the Planning, Fieldwork, and Reporting tabs.</p>
      </div>

      <ol className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
        {ENGAGEMENT_STAGES.map((item) => {
          const current = item.key === stage.key;
          const done = item.number < stage.number;
          return (
            <li
              key={item.key}
              className={`rounded-2xl border px-3 py-3 text-left ${
                current ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-100' :
                done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' :
                'border-slate-200 bg-slate-50 text-slate-500'
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider">{item.number}</div>
              <div className="text-sm font-bold leading-tight mt-1">{item.key}</div>
              <div className={`text-[10px] mt-1 ${current ? 'text-blue-100' : 'text-current opacity-80'}`}>{item.detail}</div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-6 text-sm text-slate-600">
        <span><strong className="text-slate-900">Owner:</strong> {audit.stageOwner || stage.actor}</span>
        <span><strong className="text-slate-900">Due:</strong> {formatWhen(audit.dueDate)}</span>
        <span><strong className="text-slate-900">Year:</strong> {audit.auditYear || '—'}</span>
        {released && <span className="text-emerald-700 font-semibold">Released {formatWhen(audit.releasedAt)} by {audit.releasedBy}</span>}
      </div>

      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

      {!released && canSchedule(role) && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            post({ action: 'schedule', dueDate: dueDate || null, auditYear });
          }}
        >
          <label className="text-sm text-slate-600">
            Audit year
            <input value={auditYear} onChange={(event) => setAuditYear(event.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2" placeholder="FY2025" />
          </label>
          <label className="text-sm text-slate-600">
            Due date
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          <button disabled={busy} className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Save schedule</button>
        </form>
      )}

      {!released && (
        <div className="space-y-3">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="Note for this hand-off, query, or return"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {upcoming && stage.key !== 'Final approval' && canPerform(role, stage.key, 'advance') && (
              <>
                <input
                  value={owner}
                  onChange={(event) => setOwner(event.target.value)}
                  placeholder={`Next owner (${stageByKey(upcoming).actor})`}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  disabled={busy || handoffBlocked}
                  onClick={() => post({ action: 'advance', note, stageOwner: owner })}
                  className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Hand off to {stageByKey(upcoming).detail}
                </button>
              </>
            )}
            {sendBack && canPerform(role, stage.key, 'return') && (
              <button
                disabled={busy}
                onClick={() => post({ action: 'return', note })}
                className="rounded-xl border border-amber-300 bg-amber-50 text-amber-800 px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {stage.key === 'Completeness' ? 'Return to client — missing or unclear' : 'Return for corrections'}
              </button>
            )}
            {canPerform(role, stage.key, 'query') && (
              <button
                disabled={busy}
                onClick={() => post({ action: 'query', note })}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Record reviewer query
              </button>
            )}
            {stage.key === 'Final approval' && isLicensedAuditor(role) && (
              <>
                <label className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold cursor-pointer">
                  {audit.releasedReportName ? 'Replace signed PDF' : 'Upload signed PDF'}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) uploadReport(file);
                    }}
                  />
                </label>
                <button
                  disabled={busy || !audit.releasedReportName}
                  onClick={() => post({ action: 'release', note })}
                  className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Approve and release
                </button>
              </>
            )}
          </div>
          {handoffBlocked && <p className="text-sm text-amber-700">The checklist still has items that are missing or not accepted.</p>}
          {stage.key === 'Final approval' && !isLicensedAuditor(role) && (
            <p className="text-sm text-slate-500">Waiting on the licensed auditor. The release button is only on that account.</p>
          )}
          {audit.releasedReportName && stage.key === 'Final approval' && (
            <p className="text-sm text-slate-600">Signed PDF ready: {audit.releasedReportName}</p>
          )}
        </div>
      )}

      {released && audit.releasedReportName && (
        <a href={`/api/audits/${audit.id}/release`} className="inline-flex text-sm font-semibold text-blue-700 underline">
          Download {audit.releasedReportName}
        </a>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Document checklist</h3>
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl">
          {documents.map((document) => (
            <li key={document.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="font-semibold text-slate-900">{document.name}</div>
                <div className="text-xs text-slate-500">
                  {document.fileName ? (
                    <a className="text-blue-700 underline" href={`/api/audits/${audit.id}/documents/${document.id}`}>{document.fileName}</a>
                  ) : 'No file'}
                  {document.updatedBy ? ` · ${document.updatedBy}` : ''}
                  {document.note ? ` · ${document.note}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canAttachFiles && (
                  <label className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold cursor-pointer">
                    {document.fileName ? 'Replace file' : 'Upload'}
                    <input
                      type="file"
                      className="hidden"
                      disabled={busy}
                      onChange={async (event) => {
                        const chosen = event.target.files?.[0];
                        event.target.value = '';
                        if (!chosen) return;
                        setBusy(true);
                        setError('');
                        try {
                          const uploaded = await sendChecklistFile(document.id, chosen);
                          if (!uploaded) return;
                          rememberUpload(document.id, uploaded);
                          toast.success('File uploaded');
                          router.refresh();
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  </label>
                )}
                {canAttachFiles ? (
                  <select
                    value={document.status}
                    disabled={busy}
                    onChange={(event) => post({ action: 'update-document', documentId: document.id, status: event.target.value })}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    {DOCUMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                ) : (
                  <span className={`text-xs font-bold uppercase tracking-wide border rounded-full px-3 py-1 ${STATUS_CLASS[document.status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {document.status}
                  </span>
                )}
              </div>
            </li>
          ))}
          {documents.length === 0 && <li className="px-4 py-6 text-sm text-slate-500">No documents on this checklist yet.</li>}
        </ul>
        {canAttachFiles && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={addRequestedDocument}
          >
            <input value={newDocument} onChange={(event) => setNewDocument(event.target.value)} placeholder="Add a requested document" className="rounded-xl border border-slate-200 px-3 py-2 text-sm flex-1 min-w-[16rem]" />
            <label className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold cursor-pointer">
              {newFile ? newFile.name : 'Choose file'}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                disabled={busy}
                onChange={(event) => setNewFile(event.target.files?.[0] || null)}
              />
            </label>
            <button type="submit" disabled={busy} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Add</button>
            {documents.length === 0 && (
              <button type="button" disabled={busy} onClick={() => post({ action: 'seed-documents' })} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
                Add standard checklist
              </button>
            )}
          </form>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">History</h3>
        <ul className="space-y-2">
          {audit.events.map((event) => (
            <li key={event.id} className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{event.performedBy}</span>
              {' · '}{formatWhen(event.createdAt)}
              {' · '}{event.action}
              {event.fromStage !== event.toStage ? ` · ${event.fromStage} → ${event.toStage}` : ''}
              {event.note ? ` — ${event.note}` : ''}
            </li>
          ))}
          {audit.events.length === 0 && <li className="text-sm text-slate-500">No hand-offs yet.</li>}
        </ul>
      </div>
    </section>
  );
}
