import { IDLE_JOB } from '../shared/constants';

import { createId } from '../shared/async';

export function createStartedJob(setId, processAllSets) {
  return {
    ...IDLE_JOB,
    id: createId('job'),
    active: true,
    phase: 'authenticating',
    selectedSetId: setId,
    processAllSets,
    startedAt: Date.now()
  };
}

export function transitionJob(job, phase) {
  return {
    ...job,
    phase
  };
}

export function requestStop(job) {
  return {
    ...job,
    stopRequested: true
  };
}

export function completeJob(job) {
  return {
    ...job,
    active: false,
    phase: 'completed',
    finishedAt: Date.now()
  };
}

export function stopJob(job) {
  return {
    ...job,
    active: false,
    phase: 'stopped',
    stopRequested: true,
    finishedAt: Date.now()
  };
}

export function failJob(job, error) {
  return {
    ...job,
    active: false,
    phase: 'error',
    finishedAt: Date.now(),
    error
  };
}