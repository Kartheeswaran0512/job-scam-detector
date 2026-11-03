// import { Image } from 'expo-image';
// import { Platform, StyleSheet } from 'react-native';

// import { HelloWave } from '@/components/hello-wave';
// import ParallaxScrollView from '@/components/parallax-scroll-view';
// import { ThemedText } from '@/components/themed-text';
// import { ThemedView } from '@/components/themed-view';
// import { Link } from 'expo-router';

// export default function HomeScreen() {
//   return (
//     <ParallaxScrollView
//       headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
//       headerImage={
//         <Image
//           source={require('@/assets/images/partial-react-logo.png')}
//           style={styles.reactLogo}
//         />
//       }>
//       <ThemedView style={styles.titleContainer}>
//         <ThemedText type="title">Welcome!</ThemedText>
//         <HelloWave />
//       </ThemedView>
//       <ThemedView style={styles.stepContainer}>
//         <ThemedText type="subtitle">Step 1: Try it</ThemedText>
//         <ThemedText>
//           Edit <ThemedText type="defaultSemiBold">app/(tabs)/index.tsx</ThemedText> to see changes.
//           Press{' '}
//           <ThemedText type="defaultSemiBold">
//             {Platform.select({
//               ios: 'cmd + d',
//               android: 'cmd + m',
//               web: 'F12',
//             })}
//           </ThemedText>{' '}
//           to open developer tools.
//         </ThemedText>
//       </ThemedView>
//       <ThemedView style={styles.stepContainer}>
//         <Link href="/modal">
//           <Link.Trigger>
//             <ThemedText type="subtitle">Step 2: Explore</ThemedText>
//           </Link.Trigger>
//           <Link.Preview />
//           <Link.Menu>
//             <Link.MenuAction title="Action" icon="cube" onPress={() => alert('Action pressed')} />
//             <Link.MenuAction
//               title="Share"
//               icon="square.and.arrow.up"
//               onPress={() => alert('Share pressed')}
//             />
//             <Link.Menu title="More" icon="ellipsis">
//               <Link.MenuAction
//                 title="Delete"
//                 icon="trash"
//                 destructive
//                 onPress={() => alert('Delete pressed')}
//               />
//             </Link.Menu>
//           </Link.Menu>
//         </Link>

//         <ThemedText>
//           {`Tap the Explore tab to learn more about what's included in this starter app.`}
//         </ThemedText>
//       </ThemedView>
//       <ThemedView style={styles.stepContainer}>
//         <ThemedText type="subtitle">Step 3: Get a fresh start</ThemedText>
//         <ThemedText>
//           {`When you're ready, run `}
//           <ThemedText type="defaultSemiBold">npm run reset-project</ThemedText> to get a fresh{' '}
//           <ThemedText type="defaultSemiBold">app</ThemedText> directory. This will move the current{' '}
//           <ThemedText type="defaultSemiBold">app</ThemedText> to{' '}
//           <ThemedText type="defaultSemiBold">app-example</ThemedText>.
//         </ThemedText>
//       </ThemedView>
//     </ParallaxScrollView>
//   );
// }

// const styles = StyleSheet.create({
//   titleContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 8,
//   },
//   stepContainer: {
//     gap: 8,
//     marginBottom: 8,
//   },
//   reactLogo: {
//     height: 178,
//     width: 290,
//     bottom: 0,
//     left: 0,
//     position: 'absolute',
//   },
// });
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';

type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

type Analysis = {
  level: RiskLevel;
  riskScore: number;
  verdictNote: string | null;
  scores: Record<string, number>;
  redFlags: string[];
  greenFlags: string[];
  reasoning: string;
  recommendation: string;
  model: string;
  checks: { summary: string[] };
};

const LEVEL_COLORS: Record<RiskLevel, string> = { HIGH: '#dc2626', MEDIUM: '#d97706', LOW: '#16a34a' };

const DIMENSIONS: [string, string][] = [
  ['companyLegitimacy', 'Company legitimacy'],
  ['emailDomain', 'Email domain'],
  ['salaryRealism', 'Salary realism'],
  ['offerQuality', 'Offer quality'],
  ['scamPatterns', 'Scam patterns'],
];

const scoreColor = (score: number) => (score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626');

export default function App() {
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [email, setEmail] = useState('');
  const [salary, setSalary] = useState('');
  const [location, setLocation] = useState('');
  const [verdict, setVerdict] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);

  const analyzeJob = async () => {
    if (!company || !jobTitle || !email || !salary || !location) {
      setVerdict('Please fill in all fields.');
      return;
    }
    setLoading(true);
    setVerdict('');
    setAnalysis(null);
    try {
      const response = await fetch('https://job-scam-detector-ewdc.onrender.com/api/analyze-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, jobTitle, email, salary, location }),
      });
      const data = await response.json();
      if (data.error) {
        setVerdict('Error: ' + data.error);
      } else if (data.analysis) {
        setAnalysis(data.analysis);
      } else {
        setVerdict(data.verdict); // server not yet updated: show the plain-text verdict
      }
    } catch (error) {
      setVerdict('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>🔍 Job Scam Detector</Text>

      <Text style={styles.label}>Company</Text>
      <TextInput style={styles.input} value={company} onChangeText={setCompany} placeholder="e.g. Google" />

      <Text style={styles.label}>Job Title</Text>
      <TextInput style={styles.input} value={jobTitle} onChangeText={setJobTitle} placeholder="e.g. Software Developer" />

      <Text style={styles.label}>Contact Email</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="e.g. hr@company.com" autoCapitalize="none" />

      <Text style={styles.label}>Offered Salary (numbers only)</Text>
      <TextInput style={styles.input} value={salary} onChangeText={setSalary} placeholder="e.g. 500000" keyboardType="numeric" />

      <Text style={styles.label}>Location</Text>
      <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="e.g. Chennai, Tamil Nadu" />

      <TouchableOpacity style={styles.button} onPress={analyzeJob} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Analyze</Text>}
      </TouchableOpacity>

      {analysis ? (
        <AnalysisResult analysis={analysis} />
      ) : verdict ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultText}>{verdict}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function AnalysisResult({ analysis }: { analysis: Analysis }) {
  const color = LEVEL_COLORS[analysis.level];
  return (
    <View style={[styles.resultBox, styles.analysisBox, { borderColor: color }]}>
      <View style={styles.verdictRow}>
        <View style={[styles.verdictPill, { backgroundColor: color }]}>
          <Text style={styles.verdictText}>{analysis.level} RISK</Text>
        </View>
        <Text style={styles.riskScore}>Risk score: {analysis.riskScore}/100</Text>
      </View>
      {analysis.verdictNote ? <Text style={styles.note}>{analysis.verdictNote}</Text> : null}

      <Text style={styles.sectionTitle}>Scores (higher = safer)</Text>
      {DIMENSIONS.map(([key, label]) => (
        <View key={key} style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>{label}</Text>
          <View style={styles.scoreTrack}>
            <View
              style={[styles.scoreFill, { width: `${analysis.scores[key]}%`, backgroundColor: scoreColor(analysis.scores[key]) }]}
            />
          </View>
          <Text style={styles.scoreValue}>{analysis.scores[key]}</Text>
        </View>
      ))}

      <FlagList title="Red flags" items={analysis.redFlags} />
      <FlagList title="Green flags" items={analysis.greenFlags} />

      <Text style={styles.sectionTitle}>Reasoning</Text>
      <Text style={styles.resultText}>{analysis.reasoning}</Text>

      <Text style={styles.sectionTitle}>Recommendation</Text>
      <Text style={styles.resultText}>{analysis.recommendation}</Text>

      <FlagList title="Automated checks" items={analysis.checks.summary} muted />
      <Text style={[styles.resultText, styles.mutedText, styles.modelNote]}>Analyzed by {analysis.model}</Text>
    </View>
  );
}

function FlagList({ title, items, muted }: { title: string; items: string[]; muted?: boolean }) {
  if (items.length === 0) return null;
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((item, i) => (
        <Text key={i} style={[styles.resultText, muted && styles.mutedText]}>
          • {item}
        </Text>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 50 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  label: { fontWeight: 'bold', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 14 },
  button: { backgroundColor: '#2563eb', padding: 14, borderRadius: 8, marginTop: 20, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  resultBox: { marginTop: 20, padding: 15, backgroundColor: '#f3f4f6', borderRadius: 8 },
  resultText: { fontSize: 13, lineHeight: 20 },
  analysisBox: { borderWidth: 1 },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  verdictPill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
  verdictText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  riskScore: { fontSize: 16, fontWeight: 'bold' },
  note: { fontSize: 12, fontStyle: 'italic', color: '#6b7280', marginTop: 8 },
  sectionTitle: { fontWeight: 'bold', fontSize: 14, marginTop: 16, marginBottom: 6 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  scoreLabel: { width: 125, fontSize: 13 },
  scoreTrack: { flex: 1, height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  scoreFill: { height: '100%' },
  scoreValue: { width: 28, textAlign: 'right', fontSize: 13 },
  mutedText: { color: '#6b7280' },
  modelNote: { marginTop: 10, fontSize: 12 },
});
