export type AssetId =
  | 'steps'
  | 'active'
  | 'sleep'
  | 'hr_rest'
  | 'energy'
  | 'weight';

export type Trend = 'up' | 'down' | 'flat';
export type Source = 'healthkit' | 'healthconnect';
export type AssetState = 'ok' | 'permission_needed' | 'stale' | 'partial';

export type Asset = {
  id: AssetId;
  name: string;
  unit: 'steps' | 'min' | 'h' | 'bpm' | 'kcal' | 'kg' | 'lb';
  valueToday: number;             // already normalized to unit
  goalToday?: number;
  progressPct?: number;           // 0..100
  trend?: Trend;                  // vs 7d avg
  delta7dPct?: number;            // +/- %
  freshness: string;              // ISO string
  source: Source;
  state: AssetState;
};

export type PermissionStatus =
  | 'not_requested'
  | 'denied'
  | 'granted';

export type AssetPermission = {
  id: AssetId;
  status: PermissionStatus;
  lastPromptedAt?: string;
};

export type GoalStatus = {
  id: AssetId;
  target?: number;
  met?: boolean;
};

export type Insight = {
  id: string;
  title: string;      // short sentence
  meta?: string;      // e.g., 'last 7 days'
};
