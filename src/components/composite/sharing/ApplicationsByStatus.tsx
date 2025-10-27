import Card from '@/src/components/ui/Card';
import Chip from '@/src/components/ui/Chip';
import type { ApplicationStatus } from '@/src/services/sharing/types';
import { selectByStatus, useShareStore } from '@/src/store/useShareStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

const sections: { title: string; status: ApplicationStatus }[] = [
  { title: 'Applied',  status: 'APPLIED'  },
  { title: 'Pending',  status: 'PENDING'  },
  { title: 'Accepted', status: 'ACCEPTED' },
  { title: 'Rejected', status: 'REJECTED' },
];

export default function ApplicationsByStatus() {
  const state = useShareStore();
  const router = useRouter();
  const c = useThemeColors();

  return (
    <Card>
      <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: '700' }}>Applications</Text>
      <View style={{ marginTop: 8, gap: 18 }}>
        {sections.map(sec => {
          const apps = selectByStatus(sec.status)(state);
          if (!apps.length) return null;
          return (
            <View key={sec.status} style={{ gap: 10 }}>
              <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>{sec.title}</Text>
              <View style={{ gap: 10 }}>
                {apps.map(a => (
                  <View
                    key={a.id}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <Text
                      style={{ color: c.text.secondary }}
                      onPress={() => router.push(`/opportunities/${a.studyId}`)}
                    >
                      {a.studyTitle}
                    </Text>
                    <Chip label={sec.title} />
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
