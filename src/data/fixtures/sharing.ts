import type { ShareState } from '@/src/services/sharing/types';

export const sharingSeed: ShareState = {
  earnings: {
    badgesCount: 3,
    activeSharesCount: 1,
    apps: { applied: 1, pending: 1, accepted: 1, rejected: 1 },
  },
  badges: [
    { id: 'b1', name: 'Steps Starter', earnedAtISO: '2025-08-30T10:00:00Z' },
    { id: 'b2', name: 'Sleep Streak',  earnedAtISO: '2025-09-02T10:00:00Z' },
    { id: 'b3', name: 'Heart Hero',    earnedAtISO: '2025-09-08T10:00:00Z' },
  ],
  activeShares: [
    {
      id: 's1',
      studyId: 'st-101',
      studyTitle: 'Sleep & Recovery Study',
      sinceISO: '2025-09-01T09:00:00Z',
      channels: [
        { id: 'sleep', label: 'Sleep', scope: 'READ' },
        { id: 'hr', label: 'Heart Rate', scope: 'READ' },
      ],
    },
  ],
  applications: [
    { id: 'a1', studyId: 'st-101', studyTitle: 'Sleep & Recovery Study', appliedAtISO: '2025-08-31T14:20:00Z', status: 'ACCEPTED' },
    { id: 'a2', studyId: 'st-202', studyTitle: 'Daily Steps Insights',   appliedAtISO: '2025-09-07T16:45:00Z', status: 'PENDING'  },
    { id: 'a3', studyId: 'st-303', studyTitle: 'Cardio Readiness',       appliedAtISO: '2025-09-05T11:10:00Z', status: 'REJECTED', note: 'Quota filled' },
    { id: 'a4', studyId: 'st-404', studyTitle: 'Nutrition & Wellness',   appliedAtISO: '2025-09-09T10:05:00Z', status: 'APPLIED'  },
  ],
};
