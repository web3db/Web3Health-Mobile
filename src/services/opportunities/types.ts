export type Reward = {
  badge: string;        // e.g. "Sleep Contributor"
  credits?: number;     // e.g. 50
};

export type Opportunity = {
  id: string;
  title: string;
  description: string;  // short, 1–2 lines
  image?: string;       // local asset path or remote URL
  tags: string[];       // e.g. ["Sleep", "7 days", "Private"]
  reward: Reward;
  createdAt: string;    // ISO date for "recent" sorting
  // later: partner, deadline, eligibility, etc.
};
