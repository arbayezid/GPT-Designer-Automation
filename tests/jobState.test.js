import { describe, expect, it, vi } from 'vitest';
import { completeJob, createStartedJob, failJob, requestStop, transitionJob } from '../src/workflow/jobState';

describe('job state', () => {
  it('creates a started job', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const job = createStartedJob('set-1', false);

    expect(job.active).toBe(true);
    expect(job.phase).toBe('authenticating');
    expect(job.selectedSetId).toBe('set-1');
    expect(job.startedAt).toBe(1000);
  });

  it('transitions, stops, completes, and fails without mutating source job', () => {
    const job = createStartedJob(null, true);
    const transitioned = transitionJob(job, 'reading_set');
    const stopped = requestStop(transitioned);
    const completed = completeJob(transitioned);
    const failed = failJob(transitioned, 'boom');

    expect(job.phase).toBe('authenticating');
    expect(transitioned.phase).toBe('reading_set');
    expect(stopped.stopRequested).toBe(true);
    expect(completed.active).toBe(false);
    expect(failed.error).toBe('boom');
    expect(failed.phase).toBe('error');
  });
});