export type ApplicationStatus = 'APPLIED' | 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface ShareChannel {
  id: string;
  label: string;
  scope: 'READ' | 'WRITE';
}

export interface ActiveShare {
  id: string;
  studyId: string;
  studyTitle: string;
  channels: ShareChannel[];
  sinceISO: string;
}

export interface Application {
  id: string;
  studyId: string;
  studyTitle: string;
  appliedAtISO: string;
  status: ApplicationStatus;
  note?: string;
}

export interface Badge {
  id: string;
  name: string;
  icon?: string;       // keep for future; not rendered if absent
  earnedAtISO: string;
  valueUSD?: number;   // optional; not shown in UI
}

export interface EarningsSummary {
  badgesCount: number;
  activeSharesCount: number;
  apps: { applied: number; pending: number; accepted: number; rejected: number; };
}

export interface ShareState {
  applications: Application[];
  activeShares: ActiveShare[];
  badges: Badge[];
  earnings: EarningsSummary;
}
