import { Metric } from '@/src/services/api/types';

export const fxMetrics: Metric[] = [
  { id: 'steps',    label: 'Steps',        value: 6240, unit: 'steps', target: 8000, delta7d: 5,  trend: 'up' },
  { id: 'active',   label: 'Active mins',  value: 36,   unit: 'min',   target: 45,   delta7d: -3, trend: 'down' },
  { id: 'calories', label: 'Calories',     value: 1870, unit: 'kcal',  target: 2200, delta7d: 1,  trend: 'flat' },
  { id: 'sleep',    label: 'Sleep',        value: 7.1,  unit: 'h',     target: 8 },
];


