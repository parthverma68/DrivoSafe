/* DrivoSafe application shell — REACT NATIVE. SYSTEM_DESIGN §17.
 *
 * The same flow as the web build:
 *
 *   welcome → login → [driver: check-in gate] → the surfaces that role owns
 *
 * `role.surfaces` is the allow-list the shell iterates, so a surface outside a
 * role's scope is never constructed — a driver's running app contains no fleet
 * console at all.
 *
 * On a production in-cab image the unit is enrolled as a driver device at
 * fitment: KIOSK = true, the install record is already written, and the tablet
 * boots device-owner and screen-pinned into the check-in gate and then the
 * drive screen, with no navigation anywhere. The rest exists so all surfaces
 * are reviewable from one build.
 *
 * The cab is wrapped in <NightOnly>: a white screen on a windscreen mount at
 * 03:00 is a glare hazard, so the drive surface does not follow the day/night
 * toggle the console surfaces offer.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar as RNStatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SURFACES, byId, BUSES, DRIVERS, makeShift } from '@drivosafe/shared';
import DriveScreen from './screens/DriveScreen.jsx';
import RouteEditorScreen from './screens/RouteEditorScreen.jsx';
import AdminScreen from './screens/AdminScreen.jsx';
import FleetScreen from './screens/FleetScreen.jsx';
import FleetLiveScreen from './screens/FleetLiveScreen.jsx';
import GovernmentScreen from './screens/GovernmentScreen.jsx';
import WelcomeScreen from './screens/WelcomeScreen.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import CheckinScreen from './screens/CheckinScreen.jsx';
import { speech, storage } from './platform/index.js';
import { ThemeProvider, NightOnly, useTheme } from './theme.js';
import { useSession } from './session.js';
import {
  Avatar, Btn, Chip, ROLE_ICON, IconMap, IconBack, IconPower, IconSignOut, IconSun, IconMoon,
} from './components/kit.jsx';

const KIOSK = false;

const SURFACE_ICON = {
  fleet: IconMap, admin: ROLE_ICON.shield, editor: IconMap, gov: ROLE_ICON.gov, drive: ROLE_ICON.wheel,
};

export default function App() {
  const [ready, setReady] = useState(false);

  /* AsyncStorage is async where localStorage is sync, so the adapter's
   * in-memory mirror is hydrated once before anything reads a saved session,
   * install record or layout. */
  useEffect(() => { storage.hydrate().then(() => setReady(true)); }, []);

  return (
    <ThemeProvider initial="night">
      <SafeAreaProvider>
        <RNStatusBar hidden />
        {ready ? <Shell /> : <Boot />}
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function Boot() {
  const { C, S } = useTheme();
  return (
    <View style={[S.root, { alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: C.fg3, letterSpacing: 2 }}>DRIVOSAFE</Text>
    </View>
  );
}

function Shell() {
  const { C, S, mode, toggle } = useTheme();
  const session = useSession();
  const { account, role, pendingRole, setPendingRole, install, signIn, signOut, bindInstall, clearInstall } = session;

  const [surface, setSurface] = useState(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [shift, setShift] = useState(null);
  const [mirror, setMirror] = useState(null);

  const leaveShift = () => { setShift(null); setSurface(null); };
  const fullSignOut = () => { leaveShift(); setMirror(null); signOut(); };

  const frame = (children) => (
    <SafeAreaView style={S.root} edges={['top', 'left', 'right', 'bottom']}>{children}</SafeAreaView>
  );

  /* ---------------------------------------------------------- welcome --- */
  if (!account && !pendingRole) return frame(<WelcomeScreen onPick={setPendingRole} />);

  if (!account) {
    return frame(
      <LoginScreen roleId={pendingRole} onBack={() => setPendingRole(null)} onSignIn={signIn} />
    );
  }

  /* ------------------------------------------------------- driver gate --- */
  if (role.gate === 'checkin' && !shift) {
    return frame(
      <CheckinScreen
        account={account}
        install={install}
        onBind={bindInstall}
        onRebind={clearInstall}
        onCleared={({ shift: s }) => { setShift(s); setSurface('drive'); }}
        onSignOut={fullSignOut}
      />
    );
  }

  /* ------------------------------------------------- the driver's cab ---- */
  if (role.id === 'driver') {
    const bus = byId(BUSES, shift.busId);
    const driver = byId(DRIVERS, shift.driverId);
    return frame(
      <NightOnly>
        <View style={{ flex: 1 }}>
          {KIOSK ? null : (
            <View style={S.topbar}>
              <Avatar name={driver ? driver.name : account.name} hue={account.avatarHue} size={34} />
              <View>
                <Text style={S.title}>{driver ? driver.name : account.name}</Text>
                <Text style={S.titleSub}>{bus ? `${bus.reg} · ${bus.service}` : 'shift active'}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Chip tone="ok" live>ON SHIFT</Chip>
              <Btn
                kind="ghost"
                onPress={() => { const n = !voiceOn; setVoiceOn(n); speech.setEnabled(n); }}
              >
                {voiceOn ? 'VOICE ON' : 'VOICE OFF'}
              </Btn>
              <Btn kind="ghost" icon={IconPower} onPress={leaveShift}>End shift</Btn>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <DriveScreen shift={shift} />
          </View>
        </View>
      </NightOnly>
    );
  }

  /* -------------------------------------------------- console surfaces --- */
  const allowed = role.surfaces.map((id) => SURFACES.find((s) => s.id === id)).filter(Boolean);
  const current = surface && role.surfaces.includes(surface) ? surface : role.home;
  const currentMeta = SURFACES.find((s) => s.id === current);

  if (mirror) {
    const mirrorShift = makeShift({ driverId: mirror.driverId, busId: mirror.busId, routeId: mirror.corridorId });
    return frame(
      <NightOnly>
        <View style={{ flex: 1 }}>
          <View style={S.topbar}>
            <Btn kind="ghost" icon={IconBack} onPress={() => setMirror(null)}>Back to fleet</Btn>
            <View>
              <Text style={S.title}>{mirror.bus.reg}</Text>
              <Text style={S.titleSub}>
                {mirror.driver ? mirror.driver.name : 'unassigned'} · {mirror.corridorName}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            <Chip tone="danger" live>MIRRORING A LIVE CAB · READ-ONLY</Chip>
          </View>
          <View style={{ flex: 1 }}>
            <DriveScreen shift={mirrorShift} mirror record={mirror} />
          </View>
        </View>
      </NightOnly>
    );
  }

  return frame(
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {allowed.length > 1 ? (
        <View style={S.rail}>
          <View style={[S.mark, { marginBottom: 12 }]}><Text style={S.markTxt}>D</Text></View>
          {allowed.map((s) => {
            const Icon = SURFACE_ICON[s.id];
            const on = current === s.id;
            return (
              <TouchableOpacity
                key={s.id}
                style={[S.railItem, on && S.railItemOn]}
                onPress={() => setSurface(s.id)}
              >
                <Icon size={20} color={on ? C.brand : C.fg3} />
              </TouchableOpacity>
            );
          })}
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={S.railItem} onPress={toggle}>
            {mode === 'day' ? <IconMoon size={19} color={C.fg3} /> : <IconSun size={19} color={C.fg3} />}
          </TouchableOpacity>
          <TouchableOpacity style={S.railItem} onPress={fullSignOut}>
            <IconSignOut size={19} color={C.fg3} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        <View style={S.topbar}>
          {allowed.length === 1 ? (
            <View style={S.mark}><Text style={S.markTxt}>D</Text></View>
          ) : null}
          <View>
            <Text style={S.title}>{currentMeta.label}</Text>
            <Text style={S.titleSub}>{currentMeta.sub}</Text>
          </View>

          <View style={{ flex: 1 }} />

          {role.id === 'admin' ? <Chip tone="violet">FULL ACCESS</Chip> : null}
          {role.id === 'gov' ? <Chip tone="warn">{account.jurisdiction} · read-only</Chip> : null}

          {allowed.length === 1 ? (
            <TouchableOpacity style={[S.btn, S.btnGhost, { paddingHorizontal: 12 }]} onPress={toggle}>
              {mode === 'day' ? <IconMoon size={17} color={C.fg2} /> : <IconSun size={17} color={C.fg2} />}
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={[S.chip, { gap: 8, paddingVertical: 5 }]} onPress={fullSignOut}>
            <Avatar name={account.name} hue={account.avatarHue} size={24} />
            <View>
              <Text style={[S.chipTxt, { color: C.fg, fontFamily: undefined, fontWeight: '600', fontSize: 12 }]}>
                {account.name}
              </Text>
              <Text style={[S.chipTxt, { fontSize: 9 }]}>{account.title}</Text>
            </View>
            <IconSignOut size={15} color={C.fg3} />
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1 }}>
          {current === 'fleet' && <FleetConsole account={account} onMirror={setMirror} />}
          {current === 'admin' && <AdminScreen />}
          {current === 'editor' && <RouteEditorScreen />}
          {current === 'gov' && <GovernmentScreen />}
          {current === 'drive' && (
            <NightOnly>
              <DriveScreen shift={shift || makeShift({ driverId: 'drv-2', busId: 'bus-1' })} />
            </NightOnly>
          )}
        </View>
      </View>
    </View>
  );
}

/* Live operations and the slower insights view are two tabs over one tenancy —
 * the same split the web console makes. */
function FleetConsole({ account, onMirror }) {
  const { S } = useTheme();
  const [tab, setTab] = useState('live');
  return (
    <View style={{ flex: 1 }}>
      <View style={[S.row, { paddingHorizontal: 14, paddingTop: 12, gap: 6 }]}>
        {[{ id: 'live', label: 'Live operations' }, { id: 'insights', label: 'Insights' }].map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[S.navBtn, tab === t.id && S.navBtnOn]}
            onPress={() => setTab(t.id)}
          >
            <Text style={[S.navTxt, tab === t.id && S.navTxtOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'live'
          ? <FleetLiveScreen account={account} onMirror={onMirror} />
          : <FleetScreen scopedOperatorId={account.role === 'admin' ? null : account.operatorId} />}
      </View>
    </View>
  );
}
