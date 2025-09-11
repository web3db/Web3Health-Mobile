import { Metric, Posting, Share } from '@/src/services/api/types';

export const fxMetrics: Metric[] = [
  { id: 'steps',    label: 'Steps',        value: 6240, unit: 'steps', target: 8000, delta7d: 5,  trend: 'up' },
  { id: 'active',   label: 'Active mins',  value: 36,   unit: 'min',   target: 45,   delta7d: -3, trend: 'down' },
  { id: 'calories', label: 'Calories',     value: 1870, unit: 'kcal',  target: 2200, delta7d: 1,  trend: 'flat' },
  { id: 'sleep',    label: 'Sleep',        value: 7.1,  unit: 'h',     target: 8 },
];

export const fxPostings: Posting[] = [
  { id: 'p1', title: 'Cardio Starter Pack', tag: 'Cardio',   price: 'Free' },
  { id: 'p2', title: 'Sleep Dataset v2',    tag: 'Sleep',    price: '$9'   },
  { id: 'p3', title: 'Nutrition Bundle',    tag: 'Diet',     price: '$5'   },
];

export const fxShares: Share[] = [
  { id: 's1', author: { name: 'Alex'  }, title: '7K Steps Daily Challenge', stat: '1.2k views' },
  { id: 's2', author: { name: 'John' }, title: 'HIIT Tips for Busy Days',   stat: '980 views' },
];
