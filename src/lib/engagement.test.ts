import { describe, expect, it } from 'vitest';
import {
  canLeaveCompleteness,
  canLeaveDocuments,
  canPerform,
  clientVisibleEvent,
  engagementStatus,
  nextStage,
  openQueryCount,
  returnStage,
} from './engagement';

describe('engagement workflow', () => {
  it('walks the seven stages in order', () => {
    expect(nextStage('Onboarding')).toBe('Documents');
    expect(nextStage('Documents')).toBe('Completeness');
    expect(nextStage('Completeness')).toBe('Preparation');
    expect(nextStage('Preparation')).toBe('Quality review');
    expect(nextStage('Quality review')).toBe('Final approval');
    expect(nextStage('Final approval')).toBe('Release');
    expect(nextStage('Release')).toBeNull();
  });

  it('allows only the two return loops', () => {
    expect(returnStage('Completeness')).toBe('Documents');
    expect(returnStage('Quality review')).toBe('Preparation');
    expect(returnStage('Preparation')).toBeNull();
    expect(canPerform('Coordinator', 'Completeness', 'return')).toBe(true);
    expect(canPerform('Reviewer', 'Quality review', 'return')).toBe(true);
    expect(canPerform('Preparer', 'Preparation', 'return')).toBe(false);
  });

  it('lets only a licensed auditor approve and release', () => {
    expect(canPerform('Licensed Auditor', 'Final approval', 'release')).toBe(true);
    expect(canPerform('Audit Partner', 'Final approval', 'release')).toBe(true);
    expect(canPerform('Business Operations', 'Final approval', 'release')).toBe(false);
    expect(canPerform('Reviewer', 'Final approval', 'advance')).toBe(false);
    expect(canPerform('Coordinator', 'Release', 'advance')).toBe(false);
  });

  it('gates document hand-offs on checklist status', () => {
    expect(canLeaveDocuments([{ status: 'Submitted' }, { status: 'Accepted' }])).toBe(true);
    expect(canLeaveDocuments([{ status: 'Missing' }])).toBe(false);
    expect(canLeaveCompleteness([{ status: 'Accepted' }])).toBe(true);
    expect(canLeaveCompleteness([{ status: 'Submitted' }])).toBe(false);
  });

  it('hides reviewer queries from the client history', () => {
    expect(clientVisibleEvent({ action: 'query', toStage: 'Quality review' })).toBe(false);
    expect(clientVisibleEvent({ action: 'return', toStage: 'Preparation' })).toBe(false);
    expect(clientVisibleEvent({ action: 'return', toStage: 'Documents' })).toBe(true);
    expect(clientVisibleEvent({ action: 'release', toStage: 'Release' })).toBe(true);
  });

  it('derives the staff status labels', () => {
    const future = '2099-12-15T00:00:00.000Z';
    const past = '2000-01-01T00:00:00.000Z';
    expect(engagementStatus({
      stage: 'Documents',
      dueDate: past,
      releasedAt: null,
      docs: [],
    }).label).toBe('Overdue');
    expect(engagementStatus({
      stage: 'Completeness',
      dueDate: future,
      releasedAt: null,
      docs: [{ status: 'Missing' }, { status: 'Clarification required' }],
    }).label).toBe('2 missing');
    expect(engagementStatus({
      stage: 'Quality review',
      dueDate: future,
      releasedAt: null,
      docs: [],
      events: [{ action: 'query', toStage: 'Quality review', createdAt: future }],
    }).label).toBe('1 query');
    expect(engagementStatus({
      stage: 'Final approval',
      dueDate: future,
      releasedAt: null,
      docs: [],
    }).label).toBe('Ready');
    expect(openQueryCount([
      { action: 'advance', toStage: 'Quality review', createdAt: '2026-01-01T00:00:00.000Z' },
      { action: 'query', toStage: 'Quality review', createdAt: '2026-01-02T00:00:00.000Z' },
    ], 'Quality review')).toBe(1);
  });
});
