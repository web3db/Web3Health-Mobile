import { Opportunity } from "@/src/services/opportunities/types";

const now = new Date();
const iso = (d: Date) => d.toISOString();

export const fxRecommended: Opportunity[] = [
  {
    id: "sleep-2025",
    title: "Sleep & Nutrition Study",
    description: "Contribute 7 days of sleep data to support research.",
    image: "", // add local image later if you want
    tags: ["Sleep", "7 days", "Private"],
    reward: { badge: "Sleep Contributor", credits: 50 },
    createdAt: iso(new Date(now.getTime() - 1000 * 60 * 60 * 12)),
  },
  {
    id: "hr-accuracy",
    title: "Heart Rate Validation",
    description: "Share HR to help validate wearable accuracy.",
    image: "",
    tags: ["Heart", "14 days", "Anonymous"],
    reward: { badge: "Heart Helper", credits: 30 },
    createdAt: iso(new Date(now.getTime() - 1000 * 60 * 60 * 24)),
  },
  {
    id: "diabetes-retro",
    title: "Diabetes Retrospective",
    description: "Provide historical readings for a retrospective study.",
    image: "",
    tags: ["Diabetes", "Historical", "Private"],
    reward: { badge: "Community Contributor", credits: 80 },
    createdAt: iso(new Date(now.getTime() - 1000 * 60 * 60 * 36)),
  },
  // … add more to get >10; duplicates for scaffold:
  ...Array.from({ length: 10 }).map((_, i) => ({
    id: `rec-${i}`,
    title: `Recommended Program #${i + 1}`,
    description: "Help advance research by contributing anonymized data.",
    image: "",
    tags: ["General", "7–14 days"],
    reward: { badge: "Contributor" },
    createdAt: iso(new Date(now.getTime() - (i + 2) * 3_600_000)),
  })),
];

export const fxRecent: Opportunity[] = [
  {
    id: "nutrition-quick",
    title: "Nutrition Snapshot",
    description: "Share 3 days of nutrition logs for dietary insights.",
    image: "",
    tags: ["Nutrition", "3 days", "Survey"],
    reward: { badge: "Nutrition Ally", credits: 20 },
    createdAt: iso(new Date(now.getTime() - 1000 * 60 * 30)),
  },
  {
    id: "sleep-weekly",
    title: "Weekly Sleep Program",
    description: "Provide weekly sleep summary to support wellness.",
    image: "",
    tags: ["Sleep", "Weekly", "Private"],
    reward: { badge: "Sleep Ally", credits: 25 },
    createdAt: iso(new Date(now.getTime() - 1000 * 60 * 90)),
  },
  // … add more to get >10; duplicates for scaffold:
  ...Array.from({ length: 12 }).map((_, i) => ({
    id: `recent-${i}`,
    title: `New Opportunity #${i + 1}`,
    description: "Contribute your metrics to earn credits and badges.",
    image: "",
    tags: ["General", "Recent"],
    reward: { badge: "Newcomer" },
    createdAt: iso(new Date(now.getTime() - (i + 1) * 5_400_000)),
  })),
];
