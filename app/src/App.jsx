/* DrivoSafe application shell.
 *
 * The whole flow, in one place:
 *
 *   welcome → login → [driver: check-in gate] → the surfaces that role owns
 *
 * A role does not "hide" surfaces it lacks — `role.surfaces` is the list the
 * shell iterates, so a surface outside it is never constructed. A driver's
 * build has no fleet console in the tree at all; a government official's has no
 * vehicle anywhere in it.
 *
 * On a real bus the tablet boots straight into this file under Android kiosk
 * mode with the install already bound, so a driver sees the check-in gate and
 * then the drive screen — and never a navigation control of any kind.
 */
import React, { useState } from 'react';
import { ROLE_BY_ID, SURFACES, byId, BUSES, DRIVERS, makeShift } from '@drivosafe/shared';
import DriveScreen from './screens/DriveScreen.jsx';
import RouteEditorScreen from './screens/RouteEditorScreen.jsx';
import AdminScreen from './screens/AdminScreen.jsx';
import FleetScreen from './screens/FleetScreen.jsx';
import GovernmentScreen from './screens/GovernmentScreen.jsx';
import WelcomeScreen from './screens/WelcomeScreen.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import CheckinScreen from './screens/CheckinScreen.jsx';
import { speech, presentation } from './platform/index.js';
import { useSession, useTheme, useViewport } from './session.js';
import {
  Avatar, Chip, SURFACE_ICON, IconSun, IconMoon, IconSignOut, IconBack, IconPower,
} from './components/ui.jsx';

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { compact } = useViewport();
  const session = useSession();
  const { account, role, pendingRole, setPendingRole, install, signIn, signOut, bindInstall, clearInstall } = session;

  const [surface, setSurface] = useState(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [shift, setShift] = useState(null);          // set by the check-in gate
  const [mirror, setMirror] = useState(null);        // admin watching a live cab

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    speech.setEnabled(next);
  };

  /* The cab is a landscape surface. On a phone that has to be asked for, and
   * only from inside a user gesture — which is why this hangs off the tap that
   * starts the shift rather than off an effect. It is best-effort everywhere
   * (iOS has no orientation lock at all); the drive screen prompts to rotate
   * when the request does not take. */
  const enterDrive = () => { if (compact) presentation.enterDriveMode(); };

  const leaveShift = () => {
    presentation.exitDriveMode();
    setShift(null);
    setSurface(null);
  };

  const fullSignOut = () => {
    leaveShift();
    setMirror(null);
    signOut();
  };

  /* ---------------------------------------------------------- welcome --- */
  if (!account && !pendingRole) {
    return <WelcomeScreen onPick={setPendingRole} theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (!account) {
    return (
      <LoginScreen
        roleId={pendingRole}
        onBack={() => setPendingRole(null)}
        onSignIn={signIn}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  /* ------------------------------------------------------- driver gate --- */
  if (role.gate === 'checkin' && !shift) {
    return (
      <CheckinScreen
        account={account}
        install={install}
        onBind={bindInstall}
        onRebind={clearInstall}
        onCleared={({ shift: s }) => { enterDrive(); setShift(s); setSurface('drive'); }}
        onSignOut={fullSignOut}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  /* ------------------------------------------------- the driver's cab ---- */
  if (role.id === 'driver') {
    const bus = byId(BUSES, shift.busId);
    const driver = byId(DRIVERS, shift.driverId);
    return (
      <div className="app">
        <div className="main">
          <header className="topbar cab">
            <Avatar name={driver ? driver.name : account.name} hue={account.avatarHue} />
            <div className="title">
              {driver ? driver.name : account.name}
              <small>{bus ? `${bus.reg} · ${bus.service}` : 'shift active'}</small>
            </div>
            <div className="spacer" />
            <Chip tone="ok" live>ON SHIFT</Chip>
            <button className="ghost" onClick={toggleVoice} title="Voice is the primary driver channel; the screen is secondary">
              {voiceOn ? 'VOICE ON' : 'VOICE OFF'}
            </button>
            <button className="icon ghost" onClick={toggleTheme} title="Day / night">
              {theme === 'day' ? <IconMoon /> : <IconSun />}
            </button>
            <button className="ghost" onClick={leaveShift} title="End the shift and return to check-in">
              <IconPower size={15} /> End shift
            </button>
          </header>
          <main className="screen nopad">
            <DriveScreen shift={shift} />
          </main>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------- console surfaces --- */
  const allowed = role.surfaces.map((id) => SURFACES.find((s) => s.id === id)).filter(Boolean);
  const current = surface && role.surfaces.includes(surface) ? surface : role.home;
  const currentMeta = SURFACES.find((s) => s.id === current);

  /* An admin mirroring a cab takes over the whole viewport — the point is to
     see exactly what the driver sees, and a console chrome around it would be
     a different screen. */
  if (mirror) {
    const mirrorShift = makeShift({ driverId: mirror.driverId, busId: mirror.busId, routeId: mirror.corridorId });
    return (
      <div className="app">
        <div className="main">
          <header className="topbar">
            <button
              className="ghost"
              onClick={() => { presentation.exitDriveMode(); setMirror(null); }}
            >
              <IconBack size={15} /> Back to fleet
            </button>
            <div className="title">
              {mirror.bus.reg}
              <small>{mirror.driver ? mirror.driver.name : 'unassigned'} · {mirror.corridorName}</small>
            </div>
            <div className="spacer" />
            <Chip tone="danger" live>MIRRORING A LIVE CAB</Chip>
            <button className="icon ghost" onClick={toggleTheme}>
              {theme === 'day' ? <IconMoon /> : <IconSun />}
            </button>
          </header>
          <main className="screen nopad">
            <div className="mirror-frame">
              <div className="mirror-tag"><i className="dot live" /> READ-ONLY</div>
              <DriveScreen shift={mirrorShift} mirror record={mirror} />
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {allowed.length > 1 ? (
        <nav className="rail">
          <div className="rail-mark">D</div>
          {allowed.map((s) => {
            const Icon = SURFACE_ICON[s.id];
            return (
              <button
                key={s.id}
                className={'rail-item' + (current === s.id ? ' on' : '')}
                onClick={() => {
                  if (s.id === 'drive') enterDrive();
                  else if (current === 'drive') presentation.exitDriveMode();
                  setSurface(s.id);
                }}
              >
                <Icon size={20} />
                <span className="tip">{s.label} · {s.sub}</span>
              </button>
            );
          })}
          <div className="spacer" />
          <button className="rail-item" onClick={toggleTheme}>
            {theme === 'day' ? <IconMoon size={19} /> : <IconSun size={19} />}
            <span className="tip">{theme === 'day' ? 'Night' : 'Day'} theme</span>
          </button>
          <button className="rail-item" onClick={fullSignOut}>
            <IconSignOut size={19} />
            <span className="tip">Sign out</span>
          </button>
        </nav>
      ) : null}

      <div className="main">
        <header className="topbar">
          {allowed.length === 1 ? <div className="rail-mark" style={{ width: 32, height: 32, margin: 0, fontSize: 14 }}>D</div> : null}
          <div className="title">
            {currentMeta.label}
            <small>{currentMeta.sub}</small>
          </div>

          <div className="spacer" />

          {role.id === 'admin' ? <Chip tone="violet">FULL ACCESS</Chip> : null}
          {role.id === 'gov' ? <Chip tone="warn">{account.jurisdiction} · read-only</Chip> : null}

          {current === 'drive' ? (
            <button className="ghost" onClick={toggleVoice}>{voiceOn ? 'VOICE ON' : 'VOICE OFF'}</button>
          ) : null}

          {allowed.length === 1 ? (
            <button className="icon ghost" onClick={toggleTheme} title="Day / night">
              {theme === 'day' ? <IconMoon /> : <IconSun />}
            </button>
          ) : null}

          <button className="userchip" onClick={fullSignOut} title="Sign out">
            <Avatar name={account.name} hue={account.avatarHue} size="sm" />
            <span className="who">
              <b>{account.name}</b>
              <small>{account.title || ROLE_BY_ID[account.role].label}</small>
            </span>
            <IconSignOut size={15} />
          </button>
        </header>

        <main className={'screen' + (current === 'drive' || current === 'fleet' ? ' nopad' : '')}>
          {current === 'fleet' && (
            <FleetScreen
              account={account}
              onMirror={(r) => { enterDrive(); setMirror(r); }}
            />
          )}
          {current === 'admin' && <AdminScreen />}
          {current === 'editor' && <RouteEditorScreen />}
          {current === 'gov' && <GovernmentScreen account={account} />}
          {current === 'drive' && (
            <DriveScreen shift={shift || makeShift({ driverId: 'drv-2', busId: 'bus-1' })} />
          )}
        </main>
      </div>
    </div>
  );
}
