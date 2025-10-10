// import { useOpportunities } from '@/src/hooks/useOpportunities';
// import { useThemeColors } from '@/src/theme/useThemeColors';
// import { useRoute } from '@react-navigation/native';
// import { Text, View } from 'react-native';
// import { SafeAreaView } from 'react-native-safe-area-context';

// export default function StudyDetailsScreen() {
//   const c = useThemeColors();
//   const route = useRoute();
//   const { id } = route.params as { id: string };
//   const { allOpportunities } = useOpportunities();
//   const opportunity = allOpportunities.find(o => o.id === id);

//   if (!opportunity) {
//     return (
//       <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' }}>
//         <Text style={{ color: c.text.primary, fontSize: 18 }}>Opportunity not found.</Text>
//       </SafeAreaView>
//     );
//   }

//   return (
//     <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
//       <View style={{ flex: 1, padding: 24 }}>
//         {/* Title and Reward */}
//         <Text style={{ fontSize: 28, fontWeight: 'bold', color: c.text.primary, marginBottom: 8 }}>{opportunity.title}</Text>
//         <Text style={{ fontSize: 16, color: c.text.secondary, marginBottom: 16 }}>
//           Reward: 🏅 {opportunity.reward.badge} · +{opportunity.reward.credits} credits
//         </Text>

//         {/* Example Description */}
//         <Text style={{ fontSize: 16, color: c.text.primary, marginBottom: 20 }}>
//           This study aims to advance our understanding of how daily habits and sleep patterns impact overall health and wellness. By participating, you will contribute valuable data that will help researchers identify trends, develop new health recommendations, and improve future treatments. Your data will be securely collected from your wearable device and anonymized before being shared with our research partners. Throughout the study, you may receive updates on findings and have opportunities to earn additional rewards for continued participation. Your involvement is voluntary, and you can opt out at any time. We appreciate your willingness to help drive innovation in health research and make a positive impact on the community.
//         </Text>

//         {/* Terms & Conditions */}
//         <Text style={{ fontSize: 15, fontWeight: 'bold', color: c.text.primary, marginBottom: 4 }}>Terms & Conditions</Text>
//         <Text style={{ fontSize: 14, color: c.text.secondary, marginBottom: 16 }}>
//           By participating, you agree to share your anonymized health data for research purposes. You can withdraw at any time. Please read the full terms before starting.
//         </Text>

//         {/* Who can participate? */}
//         <Text style={{ fontSize: 15, fontWeight: 'bold', color: c.text.primary, marginBottom: 4 }}>Who can participate?</Text>
//         <Text style={{ fontSize: 14, color: c.text.secondary, marginBottom: 24 }}>
//           Age group: 18-65 years old{"\n"}
//           Looking for: Individuals with a wearable device, interested in contributing sleep and activity data. All genders and backgrounds welcome.
//         </Text>

//         {/* Spacer */}
//         <View style={{ flex: 1 }} />

//         {/* Start Sharing Button */}
//         <View style={{ alignItems: 'center', marginBottom: 12 }}>
//           <View style={{ width: '100%' }}>
//             <Text
//               style={{
//                 backgroundColor: c.primary,
//                 color: '#fff',
//                 textAlign: 'center',
//                 fontWeight: '700',
//                 fontSize: 18,
//                 borderRadius: 8,
//                 paddingVertical: 14,
//               }}
//               // Replace with TouchableOpacity/Button for real action
//             >
//               Start Sharing
//             </Text>
//           </View>
//         </View>
//       </View>
//     </SafeAreaView>
//   );
// }
import React from 'react'
import { Text, View } from 'react-native'

const StudyDetails = () => {
  return (
    <View>
      <Text>StudyDetails</Text>
    </View>
  )
}

export default StudyDetails