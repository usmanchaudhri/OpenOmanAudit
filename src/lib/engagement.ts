export const ENGAGEMENT_STAGES = [
  { key: 'Onboarding', number: 1, shortLabel: '1 Onboard', actor: 'Coordinator', detail: 'Coordinator' },
  { key: 'Documents', number: 2, shortLabel: '2 Docs', actor: 'Client', detail: 'Client uploads' },
  { key: 'Completeness', number: 3, shortLabel: '3 Check', actor: 'Coordinator', detail: 'Coordinator checks' },
  { key: 'Preparation', number: 4, shortLabel: '4 Prepare', actor: 'Preparer', detail: 'Preparer' },
  { key: 'Quality review', number: 5, shortLabel: '5 Review', actor: 'Reviewer', detail: 'Reviewer queries' },
  { key: 'Final approval', number: 6, shortLabel: '6 Final', actor: 'Licensed Auditor', detail: 'Licensed auditor' },
  { key: 'Release', number: 7, shortLabel: '7 Release', actor: 'Licensed Auditor', detail: 'Signed PDF to client' },
] as const;

export type EngagementStage = (typeof ENGAGEMENT_STAGES)[number]['key'];

export const STANDARD_DOCUMENTS = [
  'Trial balance',
  'General ledger',
  'Bank statements',
  'Fixed asset register',
];

export const DOCUMENT_STATUSES = ['Missing', 'Submitted', 'Accepted', 'Clarification required'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const WORKFLOW_ROLES = ['Client', 'Coordinator', 'Preparer', 'Reviewer', 'Licensed Auditor'] as const;

export const ALLOWED_ROLES = [
  'Auditor',
  'Specialist',
  'Audit Manager',
  'Audit Director',
  'Audit Partner',
  'Business Operations',
  'IT Administrator',
  ...WORKFLOW_ROLES,
];

const COORDINATORS = ['Coordinator', 'Audit Manager', 'Business Operations'];
const PREPARERS = ['Preparer', 'Auditor', 'Specialist', 'Audit Manager'];
const REVIEWERS = ['Reviewer', 'Audit Director', 'Audit Manager', 'Audit Partner'];
const LICENSED = ['Licensed Auditor', 'Audit Partner'];

export type TransitionAction = 'advance' | 'return' | 'release' | 'query';

export interface DocLike {
  status: string;
}

export interface EventLike {
  action: string;
  toStage: string;
  createdAt: string | Date;
}

export function isClientRole(role: string): boolean {
  return role === 'Client';
}

export function isLicensedAuditor(role: string): boolean {
  return LICENSED.includes(role);
}

export function stageByKey(stage: string) {
  return ENGAGEMENT_STAGES.find((item) => item.key === stage) ?? ENGAGEMENT_STAGES[0];
}

export function nextStage(stage: string): EngagementStage | null {
  const index = ENGAGEMENT_STAGES.findIndex((item) => item.key === stage);
  if (index < 0 || index >= ENGAGEMENT_STAGES.length - 1) return null;
  return ENGAGEMENT_STAGES[index + 1].key;
}

export function returnStage(stage: string): EngagementStage | null {
  if (stage === 'Completeness') return 'Documents';
  if (stage === 'Quality review') return 'Preparation';
  return null;
}

export function canPerform(role: string, stage: string, action: TransitionAction): boolean {
  if (stage === 'Release') return false;

  if (action === 'release' || (action === 'advance' && stage === 'Final approval')) {
    return LICENSED.includes(role);
  }

  if (action === 'query') {
    return stage === 'Quality review' && REVIEWERS.includes(role);
  }

  if (action === 'return') {
    if (stage === 'Completeness') return COORDINATORS.includes(role);
    if (stage === 'Quality review') return REVIEWERS.includes(role);
    return false;
  }

  switch (stage) {
    case 'Onboarding':
      return COORDINATORS.includes(role);
    case 'Documents':
      return role === 'Client' || COORDINATORS.includes(role);
    case 'Completeness':
      return COORDINATORS.includes(role);
    case 'Preparation':
      return PREPARERS.includes(role);
    case 'Quality review':
      return REVIEWERS.includes(role);
    default:
      return false;
  }
}

export function canSchedule(role: string): boolean {
  return COORDINATORS.includes(role);
}

export function canEditChecklist(role: string, stage: string, released: boolean): boolean {
  if (released || stage === 'Release') return false;
  return COORDINATORS.includes(role) && (stage === 'Onboarding' || stage === 'Documents' || stage === 'Completeness');
}

export function canClientUpload(role: string, stage: string, status: string, released: boolean): boolean {
  if (released || role !== 'Client' || status === 'Accepted') return false;
  return stage === 'Documents';
}

export function canSetDocumentStatus(role: string, status: string): boolean {
  if (!(DOCUMENT_STATUSES as readonly string[]).includes(status)) return false;
  if (role === 'Client') return status === 'Submitted';
  return COORDINATORS.includes(role);
}

export function openRequestCount(docs: DocLike[]): number {
  return docs.filter((doc) => doc.status === 'Missing' || doc.status === 'Clarification required').length;
}

export function canLeaveDocuments(docs: DocLike[]): boolean {
  return docs.length > 0 && docs.every((doc) => doc.status === 'Submitted' || doc.status === 'Accepted');
}

export function canLeaveCompleteness(docs: DocLike[]): boolean {
  return docs.length > 0 && docs.every((doc) => doc.status === 'Accepted');
}

export function openQueryCount(events: EventLike[], stage: string): number {
  if (stage !== 'Quality review') return 0;
  const entered = [...events].reverse().find((event) => event.action === 'advance' && event.toStage === 'Quality review');
  const since = entered ? new Date(entered.createdAt).getTime() : 0;
  return events.filter((event) => event.action === 'query' && new Date(event.createdAt).getTime() >= since).length;
}

export type StatusTone = 'red' | 'amber' | 'green';

export function isPastDue(dueDate: string | Date | null, now = new Date()): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const endOfDueDay = new Date(due);
  endOfDueDay.setHours(23, 59, 59, 999);
  return endOfDueDay.getTime() < now.getTime();
}

export function engagementStatus(input: {
  stage: string;
  dueDate: string | Date | null;
  releasedAt: string | Date | null;
  docs: DocLike[];
  events?: EventLike[];
  now?: Date;
}): { label: string; tone: StatusTone } {
  if (input.releasedAt || input.stage === 'Release') {
    return { label: 'Released', tone: 'green' };
  }
  if (isPastDue(input.dueDate, input.now)) {
    return { label: 'Overdue', tone: 'red' };
  }
  const open = openRequestCount(input.docs);
  if ((input.stage === 'Documents' || input.stage === 'Completeness') && open > 0) {
    return { label: open === 1 ? '1 missing' : `${open} missing`, tone: 'red' };
  }
  if (input.stage === 'Quality review') {
    const queries = openQueryCount(input.events ?? [], input.stage);
    if (queries > 0) return { label: queries === 1 ? '1 query' : `${queries} queries`, tone: 'amber' };
    return { label: 'In review', tone: 'amber' };
  }
  if (input.stage === 'Final approval') return { label: 'Ready', tone: 'green' };
  return { label: 'On track', tone: 'green' };
}

export function clientVisibleEvent(event: { action: string; toStage: string }): boolean {
  if (event.action === 'release') return true;
  if (event.action === 'return' && event.toStage === 'Documents') return true;
  if (event.action === 'advance' && (event.toStage === 'Documents' || event.toStage === 'Completeness' || event.toStage === 'Release')) {
    return true;
  }
  return false;
}

export function defaultOwnerFor(stage: string): string {
  return stageByKey(stage).actor;
}
