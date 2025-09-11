import { Asset, AssetPermission, GoalStatus, Insight } from '@/src/services/tracking/types';

const nowIso = () => new Date().toISOString();

export const fxAssets: Asset[] = [
  { id:'steps',  name:'Steps',        unit:'steps', valueToday: 6240, goalToday: 8000, progressPct: 78, trend:'up',   delta7dPct: 5,  freshness: nowIso(), source:'healthkit',     state:'ok' },
  { id:'active', name:'Active mins',  unit:'min',   valueToday: 36,   goalToday: 45,   progressPct: 80, trend:'down', delta7dPct:-3,  freshness: nowIso(), source:'healthconnect', state:'ok' },
  { id:'sleep',  name:'Sleep',        unit:'h',     valueToday: 7.1,  goalToday: 8,    progressPct: 89, trend:'flat', delta7dPct: 0,  freshness: nowIso(), source:'healthkit',     state:'ok' },
  { id:'hr_rest',name:'Resting HR',   unit:'bpm',   valueToday: 60,                     trend:'flat',                 freshness: nowIso(), source:'healthkit', state:'ok' },
  { id:'energy', name:'Active energy',unit:'kcal',  valueToday: 1870, goalToday: 2200, progressPct: 85, trend:'up',   delta7dPct: 1,  freshness: nowIso(), source:'healthconnect', state:'ok' },
  // Optional weight example (left disabled by default UI): 
  // { id:'weight', name:'Weight', unit:'kg', valueToday: 72.3, freshness: nowIso(), source:'healthkit', state:'stale' },
];

export const fxPermissions: AssetPermission[] = [
  { id:'steps', status:'granted' },
  { id:'active', status:'granted' },
  { id:'sleep', status:'granted' },
  { id:'hr_rest', status:'granted' },
  { id:'energy', status:'granted' },
  // { id:'weight', status:'not_requested' },
];

export const fxGoals: GoalStatus[] = [
  { id:'steps',  target:8000,  met:false },
  { id:'active', target:45,    met:false },
  { id:'sleep',  target:8,     met:false },
  { id:'energy', target:2200,  met:false },
];

export const fxStreakDays = 5;

export const fxInsights: Insight[] = [
  { id:'i1', title:'You met your steps goal 4/7 days', meta:'last 7 days' },
  { id:'i2', title:'Avg sleep 6.8h (−0.4h vs last week)', meta:'last 7 days' },
];
