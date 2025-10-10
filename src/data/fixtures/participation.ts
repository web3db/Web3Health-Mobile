// src/data/fixtures/participation.ts

export type ParticipationStatus = "active" | "paused" | "completed" | "revoked";
export type ApplicationStatus = "applied" | "pending" | "accepted" | "rejected";
export type BadgeTier = "bronze" | "silver" | "gold";

export type Participation = {
  id: string;                 // participation id
  opportunityId: string;      // link back to marketplace item
  title: string;
  sponsor?: string;
  status: ParticipationStatus;
  scopes: string[];           // e.g., ["steps","sleep"]
  since: string;              // ISO
  lastSyncAt?: string;        // ISO
  progress?: { sharedDays: number; targetDays: number };
  reward?: { badge: string; credits?: number };
};

export type Application = {
  id: string;
  opportunityId: string;
  title: string;
  sponsor?: string;
  status: ApplicationStatus;
  appliedAt: string;          // ISO
  decisionAt?: string;        // ISO (if decided)
};

export type Badge = {
  id: string;
  name: string;
  tier?: BadgeTier;
  icon?: string;              // optional local asset later
  earnedAt?: string;          // if present → earned
  requirement: string;        // human text
  progress?: { current: number; required: number }; // for upcoming
};

// ---- Seed data (safe to tweak) ----
const now = new Date();
const iso = (d: Date) => d.toISOString();
const hoursAgo = (h: number) => iso(new Date(now.getTime() - h * 3600 * 1000));
const daysAgo = (d: number) => iso(new Date(now.getTime() - d * 24 * 3600 * 1000));

export const seedParticipations: Participation[] = [
  {
    id: "p-1",
    opportunityId: "sleep-2025",
    title: "Sleep & Nutrition Study",
    sponsor: "WellLab",
    status: "active",
    scopes: ["sleep", "steps"],
    since: daysAgo(5),
    lastSyncAt: hoursAgo(3),
    progress: { sharedDays: 5, targetDays: 7 },
    reward: { badge: "Sleep Contributor", credits: 50 },
  },
  {
    id: "p-2",
    opportunityId: "hr-accuracy",
    title: "Heart Rate Validation",
    sponsor: "CardioTech",
    status: "paused",
    scopes: ["heart_rate"],
    since: daysAgo(10),
    lastSyncAt: daysAgo(2),
    progress: { sharedDays: 6, targetDays: 14 },
    reward: { badge: "Heart Helper", credits: 30 },
  },
  {
    id: "p-3",
    opportunityId: "diabetes-retro",
    title: "Diabetes Retrospective",
    sponsor: "GlucoSense",
    status: "completed",
    scopes: ["activity"],
    since: daysAgo(20),
    lastSyncAt: daysAgo(12),
    progress: { sharedDays: 14, targetDays: 14 },
    reward: { badge: "Community Contributor", credits: 80 },
  },
];

export const seedApplications: Application[] = [
  {
    id: "a-1",
    opportunityId: "nutrition-quick",
    title: "Nutrition Snapshot",
    sponsor: "NutriLab",
    status: "applied",
    appliedAt: daysAgo(1),
  },
  {
    id: "a-2",
    opportunityId: "sleep-weekly",
    title: "Weekly Sleep Program",
    sponsor: "RestCo",
    status: "pending",
    appliedAt: daysAgo(2),
  },
  {
    id: "a-3",
    opportunityId: "recent-3",
    title: "New Opportunity #3",
    sponsor: "OpenHealth",
    status: "accepted",
    appliedAt: daysAgo(5),
    decisionAt: daysAgo(3),
  },
  {
    id: "a-4",
    opportunityId: "rec-2",
    title: "Recommended Program #3",
    sponsor: "DataTrust",
    status: "rejected",
    appliedAt: daysAgo(6),
    decisionAt: daysAgo(4),
  },
];

export const seedBadges: Badge[] = [
  {
    id: "b-1",
    name: "Community Contributor",
    tier: "silver",
    earnedAt: daysAgo(12),
    requirement: "Complete 1 program",
  },
  {
    id: "b-2",
    name: "Sleep Ally",
    tier: "bronze",
    earnedAt: daysAgo(4),
    requirement: "Share 7 days of sleep data",
  },
  {
    id: "b-3",
    name: "Impact Maker",
    tier: "gold",
    requirement: "Complete 5 programs",
    progress: { current: 1, required: 5 },
  },
  {
    id: "b-4",
    name: "Heart Hero",
    tier: "bronze",
    requirement: "Share heart rate data for 14 days",
    progress: { current: 6, required: 14 },
  },
];
