/* Welcome — REACT NATIVE. The twin of app/src/screens/WelcomeScreen.jsx.
 *
 * On a production in-cab image this screen is never reached: the unit is
 * enrolled as a driver device at fitment and boots into the check-in gate. It
 * exists because the same binary is what a depot supervisor opens on a spare
 * tablet, and because every role has to be reviewable from one build.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { ROLES } from '@drivosafe/shared';
import { useTheme } from '../theme.js';
import {
  Wordmark, Chip, ROLE_ICON, IconArrow, IconSun, IconMoon, accentOf, accentSoftOf,
} from '../components/kit.jsx';

export default function WelcomeScreen({ onPick }) {
  const { C, S, mode, toggle } = useTheme();

  return (
    <View style={S.root}>
      <View style={S.stageBar}>
        <Wordmark />
        <View style={{ flex: 1 }} />
        <Chip>v2.4.1</Chip>
        <TouchableOpacity style={[S.btn, S.btnGhost, { paddingHorizontal: 12 }]} onPress={toggle}>
          {mode === 'day' ? <IconMoon size={17} color={C.fg2} /> : <IconSun size={17} color={C.fg2} />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', marginBottom: 26 }}>
          <Chip tone="ok" live>ROAD INTELLIGENCE · MP CORRIDOR NETWORK</Chip>
          <Text style={[S.h1, { fontSize: 34, textAlign: 'center', marginTop: 16 }]}>
            The road ahead,
          </Text>
          <Text style={[S.h1, { fontSize: 34, textAlign: 'center' }]}>
            known <Text style={{ color: C.brand }}>before</Text> it is seen.
          </Text>
          <Text style={[S.body, { textAlign: 'center', marginTop: 12, maxWidth: 560 }]}>
            One platform, four seats at the table. Sign in as yourself — the system decides what
            you are allowed to see, and it is never more than you need.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {ROLES.map((r) => {
            const Icon = ROLE_ICON[r.icon];
            const accent = accentOf(C, r.accent);
            return (
              <TouchableOpacity
                key={r.id}
                activeOpacity={0.8}
                onPress={() => onPick(r.id)}
                style={S.roleCard}
              >
                <View style={[S.roleIco, { backgroundColor: accentSoftOf(C, r.accent) }]}>
                  <Icon size={22} color={accent} />
                </View>
                <Text style={[S.eyebrow, { color: accent }]}>{r.tagline}</Text>
                <Text style={[S.h2, { marginTop: 4 }]}>{r.label}</Text>
                <Text style={[S.body, { fontSize: 12.5, marginTop: 8, minHeight: 76 }]}>{r.blurb}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }}>
                  <Text style={{ color: accent, fontWeight: '600', fontSize: 12 }}>Continue</Text>
                  <IconArrow size={15} color={accent} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[S.hint, { textAlign: 'center', marginTop: 24 }]}>
          Driver units are installed once per vehicle and stay signed in. Every other seat is a
          session that ends when it is closed.
        </Text>
      </ScrollView>
    </View>
  );
}
