import { fxRecommended } from "@/src/data/fixtures/opportunities";
import { Opportunity } from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getRecommendedTop10(): Promise<Opportunity[]> {
  await delay(200);
  return fxRecommended.slice(0, 10);
}

// export async function getRecentTop10(): Promise<Opportunity[]> {
//   await delay(200);
//   // ensure sorted by createdAt desc for “recent”
//   return [...fxRecent].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 10);
// }
