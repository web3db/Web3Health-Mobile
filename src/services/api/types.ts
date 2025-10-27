export type MetricId = 'steps' | 'active' | 'calories' | 'sleep' | 'hr' | 'weight';

export type Metric = {
  id: MetricId;
  label: string;
  value: number | string;
  unit: string;
  target?: number;
  delta7d?: number;
  trend?: 'up' | 'down' | 'flat';
};

export type Posting = {
  id: string;
  title: string;
  imageUrl?: string;
  tag?: string;
  price?: string;      // 'Free' or '$9'
  distanceKm?: number;
};

export type Share = {
  id: string;
  author: { name: string; avatarUrl?: string };
  title: string;
  stat?: string;       // '1.2k views', etc.
};
