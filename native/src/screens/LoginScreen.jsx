/* Sign-in — REACT NATIVE.
 *
 * Same `authenticate()` from @drivosafe/shared the web build calls, same
 * discriminated result, same refusal on a role mismatch. The only difference
 * between the two files is which host renders the text input.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { ROLE_BY_ID, accountsForRole, authenticate } from '@drivosafe/shared';
import { useTheme } from '../theme.js';
import {
  Wordmark, Btn, Chip, Avatar, ROLE_ICON, IconBack, IconCheck, IconAlert, IconSun, IconMoon,
  accentOf, accentSoftOf,
} from '../components/kit.jsx';

const PITCH = {
  driver: [
    'Installed once in your cab — after that the bus signs you in, not a password.',
    'A face check and a breath test before the wheel turns.',
    'Then the road model does the rest: lane, speed and hazard, spoken before you see it.',
  ],
  operator: [
    'Only your vehicles. Tenancy is enforced in the data layer.',
    'Live position, the driver at the wheel, and their fatigue state.',
    'Cabin video is requested and audited — never a window left open.',
  ],
  admin: [
    'Every operator, every vehicle, every corridor.',
    'Mirror any cab and see the exact drive screen its driver is looking at.',
    'Onboarding, corridor publishing and fatigue review in one seat.',
  ],
  gov: [
    'Surface condition scored from passing traffic — no survey crew.',
    'Maintenance priority P1–P3 with the evidence behind each ranking.',
    'No operator, driver or vehicle identity is exposed on this surface.',
  ],
};

export default function LoginScreen({ roleId, onBack, onSignIn }) {
  const { C, S, mode, toggle } = useTheme();
  const role = ROLE_BY_ID[roleId];
  const demo = accountsForRole(roleId);
  const [username, setUsername] = useState(demo[0] ? demo[0].username : '');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState(null);
  const Icon = ROLE_ICON[role.icon];
  const accent = accentOf(C, role.accent);

  const submit = () => {
    const r = authenticate({ username, secret, role: roleId });
    if (!r.ok) { setError(r); return; }
    setError(null);
    onSignIn(r.account);
  };

  return (
    <View style={S.root}>
      <View style={S.stageBar}>
        <Btn kind="ghost" icon={IconBack} onPress={onBack}>Back</Btn>
        <View style={{ flex: 1 }} />
        <Wordmark />
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={[S.btn, S.btnGhost, { paddingHorizontal: 12 }]} onPress={toggle}>
          {mode === 'day' ? <IconMoon size={17} color={C.fg2} /> : <IconSun size={17} color={C.fg2} />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          <View style={[S.card, { flexGrow: 1, flexBasis: 320, backgroundColor: C.bg2 }]}>
            <View style={[S.roleIco, { backgroundColor: accentSoftOf(C, role.accent) }]}>
              <Icon size={22} color={accent} />
            </View>
            <Text style={[S.h1, { fontSize: 24 }]}>{role.label}</Text>
            <Text style={[S.body, { marginTop: 8 }]}>{role.blurb}</Text>
            <View style={{ marginTop: 18, gap: 10 }}>
              {PITCH[roleId].map((line) => (
                <View key={line} style={{ flexDirection: 'row', gap: 10 }}>
                  <IconCheck size={15} color={accent} />
                  <Text style={[S.body, { fontSize: 12.5, flex: 1 }]}>{line}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[S.card, { flexGrow: 1, flexBasis: 320 }]}>
            <Text style={S.h2}>Sign in</Text>
            <Text style={[S.hint, { marginTop: 6 }]}>
              {roleId === 'driver'
                ? 'One-time setup for this unit. After this the vehicle identifies you every shift.'
                : 'This session ends when the app is closed.'}
            </Text>

            {error ? (
              <View style={{
                flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12,
                backgroundColor: C.dangerSoft, borderColor: C.danger, borderWidth: 1,
                borderRadius: 12, padding: 10,
              }}>
                <IconAlert size={15} color={C.danger} />
                <Text style={{ color: C.danger, fontSize: 12, flex: 1 }}>{error.message}</Text>
              </View>
            ) : null}

            <Text style={S.label}>Username</Text>
            <TextInput
              style={[S.input, { marginBottom: 12 }]}
              value={username}
              autoCapitalize="none"
              placeholder="username"
              placeholderTextColor={C.fg3}
              onChangeText={(t) => { setUsername(t); setError(null); }}
            />

            <Text style={S.label}>{roleId === 'driver' ? 'Passcode' : 'Password'}</Text>
            <TextInput
              style={[S.input, { marginBottom: 16 }]}
              value={secret}
              secureTextEntry
              autoCapitalize="none"
              placeholder={roleId === 'driver' ? '4-digit passcode' : '••••••'}
              placeholderTextColor={C.fg3}
              onChangeText={(t) => { setSecret(t); setError(null); }}
            />

            <Btn kind="primary" size="lg" onPress={submit}>Continue as {role.label}</Btn>

            <View style={{ marginTop: 20, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14 }}>
              <Text style={S.eyebrow}>Seeded accounts — tap to fill</Text>
              <View style={[S.row, { marginTop: 10 }]}>
                {demo.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    activeOpacity={0.75}
                    onPress={() => { setUsername(a.username); setSecret(a.secret); setError(null); }}
                    style={[S.chip, { paddingVertical: 6, gap: 8 }]}
                  >
                    <Avatar name={a.name} hue={a.avatarHue} size={22} />
                    <Text style={S.chipTxt}>{a.username} · {a.secret}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
