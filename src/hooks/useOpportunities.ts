import { useMemo } from 'react';

export function useOpportunities() {
  // Mock data for demonstration
  const allOpportunities = useMemo(() => [
    {
      id: '1',
      title: 'Welcome Bonus',
      description: 'Earn rewards as a newcomer.',
      category: 'Newcomer',
      tags: ['bonus', 'new'],
      reward: { badge: 'Starter', credits: 100 },
      createdAt: new Date().toISOString(),
    },
    {
      id: '2',
      title: 'Sleep Data Sharing',
      description: 'Share your sleep data for research.',
      category: 'Sleep Ally',
      tags: ['sleep', 'data'],
      reward: { badge: 'Sleep Ally', credits: 150 },
      createdAt: new Date().toISOString(),
    },
    {
      id: '3',
      title: 'Heart Rate Study',
      description: 'Participate in a heart rate research study.',
      category: 'Newcomer',
      tags: ['heart', 'study'],
      reward: { badge: 'Heart Hero', credits: 200 },
      createdAt: new Date().toISOString(),
    },
    {
      id: '4',
      title: 'Activity Tracking',
      description: 'Contribute your daily activity data.',
      category: 'Sleep Ally',
      tags: ['activity', 'tracking'],
      reward: { badge: 'Active Star', credits: 120 },
      createdAt: new Date().toISOString(),
    },
    {
      id: '5',
      title: 'Nutrition Logging',
      description: 'Log your meals to help nutrition research.',
      category: 'Nutrition',
      tags: ['nutrition', 'meals'],
      reward: { badge: 'Nutrition Pro', credits: 90 },
      createdAt: new Date().toISOString(),
    },
    {
      id: '6',
      title: 'Mindfulness Challenge',
      description: 'Join a mindfulness challenge and share your progress.',
      category: 'Wellness',
      tags: ['mindfulness', 'challenge'],
      reward: { badge: 'Mindful Star', credits: 110 },
      createdAt: new Date().toISOString(),
    },
  ], []);

  return { allOpportunities };
}
