import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { canAccessAudit } from '@/lib/audit-access';
import {
  STANDARD_DOCUMENTS,
  canClientUpload,
  canEditChecklist,
  canLeaveCompleteness,
  canLeaveDocuments,
  canPerform,
  canSchedule,
  canSetDocumentStatus,
  clientVisibleEvent,
  defaultOwnerFor,
  isClientRole,
  nextStage,
  returnStage,
} from '@/lib/engagement';

function cleanNote(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const note = value.replace(/<[^>]*>/g, '').trim();
  if (!note) return null;
  return note.slice(0, 2000);
}

async function stamp(
  auditId: string,
  fromStage: string,
  toStage: string,
  action: string,
  note: string | null,
  performedBy: string,
) {
  await prisma.stageEvent.create({
    data: { auditId, fromStage, toStage, action, note, performedBy },
  });
  await prisma.auditLog.create({
    data: {
      action: 'UPDATE',
      entityType: 'AUDIT',
      entityId: auditId,
      details: `${action}: ${fromStage} → ${toStage}${note ? ` — ${note}` : ''}`,
      performedBy,
    },
  });
}

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = await props.params;
  if (!(await canAccessAudit(session.user, params.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const audit = await prisma.audit.findUnique({
    where: { id: params.id },
    include: {
      documentRequests: { orderBy: { createdAt: 'asc' } },
      stageEvents: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

  const client = isClientRole(session.user.role);
  return NextResponse.json({
    id: audit.id,
    title: audit.title,
    auditYear: audit.auditYear,
    engagementStage: audit.engagementStage,
    stageOwner: audit.stageOwner,
    dueDate: audit.dueDate,
    releasedAt: audit.releasedAt,
    releasedBy: client ? null : audit.releasedBy,
    releasedReportName: audit.releasedReportName,
    hasReleasedReport: Boolean(audit.releasedReportUrl),
    documentRequests: audit.documentRequests.map((doc) => ({
      id: doc.id,
      name: doc.name,
      status: doc.status,
      note: doc.note,
      fileName: doc.fileName,
      hasFile: Boolean(doc.fileUrl),
      updatedBy: doc.updatedBy,
      updatedAt: doc.updatedAt,
    })),
    stageEvents: audit.stageEvents
      .filter((event) => !client || clientVisibleEvent(event))
      .map((event) => ({
        id: event.id,
        fromStage: event.fromStage,
        toStage: event.toStage,
        action: event.action,
        note: client && event.action !== 'return' ? null : event.note,
        performedBy: event.performedBy,
        createdAt: event.createdAt,
      })),
  });
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = await props.params;
  if (!(await canAccessAudit(session.user, params.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const action = body?.action;
  const role = session.user.role;
  const username = session.user.username;

  const audit = await prisma.audit.findUnique({
    where: { id: params.id },
    include: { documentRequests: true },
  });
  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  if (audit.releasedAt || audit.engagementStage === 'Release') {
    return NextResponse.json({ error: 'This engagement is released and locked.' }, { status: 423 });
  }

  if (action === 'schedule') {
    if (!canSchedule(role)) return NextResponse.json({ error: 'Only a coordinator can set the due date.' }, { status: 403 });
    const dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.dueDate && Number.isNaN(dueDate?.getTime())) {
      return NextResponse.json({ error: 'Invalid due date.' }, { status: 400 });
    }
    const auditYear = typeof body.auditYear === 'string' ? body.auditYear.trim().slice(0, 40) : audit.auditYear;
    await prisma.audit.update({
      where: { id: audit.id },
      data: { dueDate, auditYear: auditYear || null },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === 'add-document' || action === 'seed-documents') {
    if (!canEditChecklist(role, audit.engagementStage, false)) {
      return NextResponse.json({ error: 'The checklist cannot be changed at this stage.' }, { status: 403 });
    }
    if (action === 'seed-documents') {
      if (audit.documentRequests.length > 0) {
        return NextResponse.json({ error: 'This engagement already has a checklist.' }, { status: 400 });
      }
      await prisma.documentRequest.createMany({
        data: STANDARD_DOCUMENTS.map((name) => ({ auditId: audit.id, name, status: 'Missing' })),
      });
    } else {
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 160) : '';
      if (!name) return NextResponse.json({ error: 'Document name is required.' }, { status: 400 });
      const created = await prisma.documentRequest.create({
        data: { auditId: audit.id, name, status: 'Missing', updatedBy: username },
      });
      return NextResponse.json({
        ok: true,
        document: {
          id: created.id,
          name: created.name,
          status: created.status,
          note: created.note,
          fileName: created.fileName,
          updatedBy: created.updatedBy,
        },
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'update-document') {
    const status = typeof body.status === 'string' ? body.status : '';
    if (!canSetDocumentStatus(role, status)) {
      return NextResponse.json({ error: 'You cannot set that document status.' }, { status: 403 });
    }
    if (isClientRole(role) && !canClientUpload(role, audit.engagementStage, 'Missing', false)) {
      return NextResponse.json({ error: 'Documents can only be updated while the client upload stage is open.' }, { status: 403 });
    }
    const document = audit.documentRequests.find((item) => item.id === body.documentId);
    if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    if (document.status === 'Accepted' && isClientRole(role)) {
      return NextResponse.json({ error: 'Accepted documents are locked.' }, { status: 403 });
    }
    await prisma.documentRequest.update({
      where: { id: document.id },
      data: {
        status,
        note: body.note === undefined ? document.note : cleanNote(body.note),
        updatedBy: username,
      },
    });
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE',
        entityType: 'AUDIT',
        entityId: audit.id,
        details: `${document.name} marked ${status}`,
        performedBy: username,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === 'query') {
    if (!canPerform(role, audit.engagementStage, 'query')) {
      return NextResponse.json({ error: 'Only the reviewer can record a query during quality review.' }, { status: 403 });
    }
    const note = cleanNote(body.note);
    if (!note) return NextResponse.json({ error: 'A query needs a note.' }, { status: 400 });
    await stamp(audit.id, audit.engagementStage, audit.engagementStage, 'query', note, username);
    return NextResponse.json({ ok: true });
  }

  if (action === 'return') {
    const target = returnStage(audit.engagementStage);
    if (!target || !canPerform(role, audit.engagementStage, 'return')) {
      return NextResponse.json({ error: 'This stage cannot be returned.' }, { status: 403 });
    }
    const note = cleanNote(body.note);
    if (!note) return NextResponse.json({ error: 'A return needs a note for the person receiving the work.' }, { status: 400 });
    await prisma.audit.update({
      where: { id: audit.id },
      data: { engagementStage: target, stageOwner: defaultOwnerFor(target) },
    });
    await stamp(audit.id, audit.engagementStage, target, 'return', note, username);
    return NextResponse.json({ ok: true, engagementStage: target });
  }

  if (action === 'release' || (action === 'advance' && audit.engagementStage === 'Final approval')) {
    if (!canPerform(role, audit.engagementStage, 'release')) {
      return NextResponse.json({ error: 'Only the licensed auditor can approve and release.' }, { status: 403 });
    }
    if (audit.engagementStage !== 'Final approval') {
      return NextResponse.json({ error: 'Release is only available at final approval.' }, { status: 400 });
    }
    if (!audit.releasedReportUrl) {
      return NextResponse.json({ error: 'Upload the signed PDF before release.' }, { status: 400 });
    }
    const note = cleanNote(body.note);
    await prisma.audit.update({
      where: { id: audit.id },
      data: {
        engagementStage: 'Release',
        stageOwner: username,
        releasedAt: new Date(),
        releasedBy: username,
        status: 'Completed',
        reportIssuedDate: audit.reportIssuedDate ?? new Date(),
      },
    });
    await stamp(audit.id, 'Final approval', 'Release', 'release', note, username);
    return NextResponse.json({ ok: true, engagementStage: 'Release' });
  }

  if (action === 'advance') {
    const target = nextStage(audit.engagementStage);
    if (!target || !canPerform(role, audit.engagementStage, 'advance')) {
      return NextResponse.json({ error: 'You cannot hand off this stage.' }, { status: 403 });
    }
    if (audit.engagementStage === 'Documents' && !canLeaveDocuments(audit.documentRequests)) {
      return NextResponse.json({ error: 'Every document must be submitted before completeness review.' }, { status: 400 });
    }
    if (audit.engagementStage === 'Completeness' && !canLeaveCompleteness(audit.documentRequests)) {
      return NextResponse.json({ error: 'Every document must be accepted before preparation.' }, { status: 400 });
    }
    const owner = typeof body.stageOwner === 'string' && body.stageOwner.trim()
      ? body.stageOwner.trim().slice(0, 120)
      : defaultOwnerFor(target);
    await prisma.audit.update({
      where: { id: audit.id },
      data: { engagementStage: target, stageOwner: owner },
    });
    await stamp(audit.id, audit.engagementStage, target, 'advance', cleanNote(body.note), username);
    return NextResponse.json({ ok: true, engagementStage: target });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
