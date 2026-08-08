/* DrivoSafe application shell — REACT NATIVE. SYSTEM_DESIGN §17.
 *
 * On the bus this launches straight into the Drive screen under Android kiosk
 * mode (device-owner, screen-pinned, HOME-category launcher) with no navigation
 * at all — the tablet is a purpose device, not a browser. The surface switcher
 * below exists so all five surfaces are reviewable from one build; set
 * KIOSK = true for a production image and it disappears.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar as RNStatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import DriveScreen from './screens/DriveScreen.jsx';
import RouteEditorScreen from './screens/RouteEditorScreen.jsx';
import AdminScreen from './screens/AdminScreen.jsx';
import FleetScreen from './screens/FleetScreen.jsx';
import GovernmentScreen from './screens/GovernmentScreen.jsx';
import { speech, storage } from './platform/index.js';
import { C, S } from './theme.js';

const KIOSK = false;

const SURFACES = [
  { id: 'drive', label: 'Drive' },
  { id: 'editor', label: 'Route Editor' },
  { id: 'admin', label: 'Admin' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'gov', label: 'Government' },
];

export default function App() {
  const [surface, setSurface] = useState('drive');
  const [voiceOn, setVoiceOn] = useState(true);
  const [ready, setReady] = useState(false);

  /* AsyncStorage is async where localStorage is sync, so the adapter's
   * in-memory mirror is hydrated once before anything reads a saved layout. */
  useEffect(() => {
    storage.hydrate().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={[S.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: C.fg3, letterSpacing: 2 }}>DRIVOSAFE</Text>
      </View>
    );
  }

  const Screen =
    surface === 'drive' ? DriveScreen :
    surface === 'editor' ? RouteEditorScreen :
    surface === 'admin' ? AdminScreen :
    surface === 'fleet' ? FleetScreen : GovernmentScreen;

  return (
    <SafeAreaProvider>
      <RNStatusBar hidden />
      <SafeAreaView style={S.root} edges={['top', 'left', 'right', 'bottom']}>
        {KIOSK ? null : (
          <View style={S.topbar}>
            <View>
              <Text style={S.brand}>
                DRIVO<Text style={S.brandAccent}>SAFE</Text>
              </Text>
              <Text style={S.brandSub}>drivosafe.com</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 4 }}>
              {SURFACES.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setSurface(s.id)}
                  style={[S.navBtn, surface === s.id && S.navBtnOn]}
                >
                  <Text style={[S.navTxt, surface === s.id && S.navTxtOn]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flex: 1 }} />

            <TouchableOpacity
              style={S.chip}
              onPress={() => {
                const next = !voiceOn;
                setVoiceOn(next);
                speech.setEnabled(next);
              }}
            >
              <Text style={S.chipTxt}>{voiceOn ? 'VOICE ON' : 'VOICE OFF'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Screen />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
