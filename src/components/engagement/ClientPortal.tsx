'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { stageByKey } from '@/lib/engagement';
import type { EngagementAudit } from './EngagementPanel';

const ENGAGEMENT_COUNT = 7;

const STATUS_CLASS: Record<string, string> = {
  Missing: 'bg-red-50 text-red-700 border-red-200',
  Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  Accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Clarification required': 'bg-amber-50 text-amber-800 border-amber-200',
};

export default function ClientPortal({ audit }: { audit: EngagementAudit }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const stage = stageByKey(audit.engagementStage || 'Onboarding');
  const progress = Math.round((stage.number / ENGAGEMENT_COUNT) * 100);
  const released = Boolean(audit.releasedAt) || stage.key === 'Release';
  const requests = audit.documents.filter((document) => document.status === 'Missing' || document.status === 'Clarification required');

  async function upload(documentId: string, file: File) {
    setBusyId(documentId);
    setError('');
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('auditId', audit.id);
      body.set('documentId', documentId);
      body.set('type', 'document');
      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Upload failed.');
        return;
      }
      toast.success('File submitted');
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8 space-y-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Client portal</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-2">{audit.title}</h1>
          <p className="text-slate-500 mt-1">
            {audit.auditYear || 'Audit'} · stage {stage.number} of 7 · {stage.key}
          </p>
        </div>
        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 rounded-full" style={{ width: `${progress}%` }} />
        </div>
        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-3">Document checklist</h2>
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl">
            {audit.documents.map((document) => {
              const canUpload = stage.key === 'Documents' && document.status !== 'Accepted';
              return (
                <li key={document.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-4">
                  <div>
                    <div className="font-semibold text-slate-900">{document.name}</div>
                    {document.note && <p className="text-sm text-slate-500 mt-1">{document.note}</p>}
                    {document.fileName && <p className="text-xs text-slate-400 mt-1">{document.fileName}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold uppercase tracking-wide border rounded-full px-3 py-1 ${STATUS_CLASS[document.status] || ''}`}>
                      {document.status}
                    </span>
                    {canUpload && (
                      <label className="rounded-xl bg-blue-600 text-white px-3 py-2 text-sm font-semibold cursor-pointer">
                        {busyId === document.id ? 'Uploading…' : 'Upload'}
                        <input
                          type="file"
                          className="hidden"
                          disabled={busyId === document.id}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) upload(document.id, file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {requests.length > 0 && stage.key === 'Documents' && (
          <p className="text-sm text-amber-800">{requests.length} item{requests.length === 1 ? '' : 's'} still need a file.</p>
        )}

        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-3">Released reports</h2>
          {released && audit.releasedReportName ? (
            <a href={`/api/audits/${audit.id}/release`} className="text-sm font-semibold text-blue-700 underline">
              {audit.releasedReportName}
            </a>
          ) : (
            <p className="text-sm text-slate-500">No report has been released yet.</p>
          )}
        </div>
      </section>

      {audit.events.length > 0 && (
        <section className="bg-white rounded-[2rem] border border-slate-200 p-8">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-3">Progress</h2>
          <ul className="space-y-2 text-sm text-slate-600">
            {audit.events.map((event) => (
              <li key={event.id}>
                <span className="font-semibold text-slate-900">{format(new Date(event.createdAt), 'd MMM yyyy')}</span>
                {' · '}{event.toStage}
                {event.note ? ` — ${event.note}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
