'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ENGAGEMENT_STAGES, engagementStatus, isPastDue, stageByKey, type EventLike } from '@/lib/engagement';

export interface EngagementRow {
  id: string;
  title: string;
  engagementStage: string;
  stageOwner: string | null;
  dueDate: string | null;
  releasedAt: string | null;
  documentRequests: { status: string }[];
  stageEvents: EventLike[];
}

const TONE: Record<string, string> = {
  red: 'text-red-600',
  amber: 'text-amber-600',
  green: 'text-emerald-600',
};

export default function EngagementBoard({ rows }: { rows: EngagementRow[] }) {
  const [stage, setStage] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const filtered = useMemo(() => rows.filter((row) => {
    if (stage && row.engagementStage !== stage) return false;
    if (assignee && !(row.stageOwner || '').toLowerCase().includes(assignee.toLowerCase())) return false;
    if (due && row.dueDate && new Date(row.dueDate).getTime() > new Date(due).getTime() + 24 * 60 * 60 * 1000) return false;
    if (due && !row.dueDate) return false;
    if (overdueOnly && (!isPastDue(row.dueDate) || row.releasedAt || row.engagementStage === 'Release')) return false;
    return true;
  }), [rows, stage, assignee, due, overdueOnly]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">All clients</h2>
        <p className="text-sm text-slate-500">Seven-stage engagement list. Select a row to open history, the checklist, and reassignment.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={stage} onChange={(event) => setStage(event.target.value)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm">
          <option value="">Stage</option>
          {ENGAGEMENT_STAGES.map((item) => <option key={item.key} value={item.key}>{item.shortLabel}</option>)}
        </select>
        <input value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="Assignee" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm" />
        <input type="date" value={due} onChange={(event) => setDue(event.target.value)} aria-label="Due date" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm" />
        <label className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm flex items-center gap-2">
          <input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} />
          Overdue only
        </label>
      </div>
      <div className="overflow-x-auto bg-white rounded-[2rem] border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
              <th className="px-6 py-4 font-bold">Client</th>
              <th className="px-4 py-4 font-bold">Stage</th>
              <th className="px-4 py-4 font-bold">Owner</th>
              <th className="px-4 py-4 font-bold">Due</th>
              <th className="px-4 py-4 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const status = engagementStatus({
                stage: row.engagementStage,
                dueDate: row.dueDate,
                releasedAt: row.releasedAt,
                docs: row.documentRequests,
                events: row.stageEvents,
              });
              return (
                <tr key={row.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-6 py-4 font-semibold">
                    <Link href={`/audits/${row.id}`} className="text-slate-900 hover:text-blue-700">{row.title}</Link>
                  </td>
                  <td className="px-4 py-4">{stageByKey(row.engagementStage).shortLabel}</td>
                  <td className="px-4 py-4">{row.stageOwner || stageByKey(row.engagementStage).actor}</td>
                  <td className="px-4 py-4">{row.dueDate ? format(new Date(row.dueDate), 'd MMM') : '—'}</td>
                  <td className={`px-4 py-4 font-semibold ${TONE[status.tone]}`}>{status.label}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-slate-400">No engagements match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
