// import { useMarketStore } from '@/src/store/useMarketStore';
// import { useMetricsStore } from '@/src/store/useMetricsStore';
// import { useShareStore } from '@/src/store/useShareStore';
// import { useEffect } from 'react';

// export function useHomeFeed() {
//   const { metrics, status: mStatus, fetchToday } = useMetricsStore();
//   const { recommended, status: rStatus, fetchRecommended } = useMarketStore();
//   const { highlights, status: hStatus, fetchHighlights } = useShareStore();

//   useEffect(() => {
//     fetchToday();
//     fetchRecommended({ filter: 'trending' });
//     fetchHighlights();
//   }, [fetchToday, fetchRecommended, fetchHighlights]);

//   return {
//     metrics, mStatus,
//     recommended, rStatus,
//     highlights, hStatus,
//     refetch: {
//       metrics: fetchToday,
//       recommended: () => fetchRecommended({ filter: 'trending' }),
//       highlights: fetchHighlights,
//     },
//   };
// }
