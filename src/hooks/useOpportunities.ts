// src/hooks/useOpportunities.ts
import { extractCategories, extractTags, normalizeOpportunity, type RawOpportunity, type UIOpportunity } from "@/src/services/opportunities/schema";
import { useMemo } from "react";

/**
 * Seed-only hook for now. We keep the existing shape but normalize it for UI.
 * This will be swapped to API later without changing any UI components.
 */
export function useOpportunities() {
  // --- Mock data (same as your team seed, extended safely if needed) ---
  const raw: RawOpportunity[] = useMemo(
    () => [
      {
        id: "1",
        title: "Welcome Bonus",
        description: "Earn rewards as a newcomer.",
        category: "Newcomer",
        tags: ["bonus", "new"],
        reward: { badge: "Starter", credits: 100 },
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        title: "Sleep Data Sharing",
        description: "Share your sleep data for research.",
        category: "Sleep Ally",
        tags: ["sleep", "data"],
        reward: { badge: "Sleep Ally", credits: 150 },
        createdAt: new Date().toISOString(),
      },
      {
        id: "3",
        title: "Heart Rate Study",
        description: "Participate in a heart rate research study.",
        category: "Newcomer",
        tags: ["heart", "study"],
        reward: { badge: "Heart Hero", credits: 200 },
        createdAt: new Date().toISOString(),
      },
      {
        id: "4",
        title: "Activity Tracking",
        description: "Contribute your daily activity data.",
        category: "Sleep Ally",
        tags: ["activity", "tracking"],
        reward: { badge: "Active Star", credits: 120 },
        createdAt: new Date().toISOString(),
      },
      {
        id: "5",
        title: "Nutrition Logging",
        description: "Log your meals to help nutrition research.",
        category: "Nutrition",
        tags: ["nutrition", "meals"],
        reward: { badge: "Nutrition Pro", credits: 90 },
        createdAt: new Date().toISOString(),
      },
      {
        id: "6",
        title: "Mindfulness Challenge",
        description: "Join a mindfulness challenge and share your progress.",
        category: "Wellness",
        tags: ["mindfulness", "challenge"],
        reward: { badge: "Mindful Star", credits: 110 },
        createdAt: new Date().toISOString(),
      },
    ],
    []
  );

  // Normalize + default sorting (newest first)
  const allOpportunities: UIOpportunity[] = useMemo(() => {
    const items = raw.map(normalizeOpportunity);
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items;
  }, [raw]);

  const categories = useMemo(() => extractCategories(allOpportunities), [allOpportunities]);
  const popularTags = useMemo(() => extractTags(allOpportunities, 8), [allOpportunities]);

  return { allOpportunities, categories, popularTags };
}
