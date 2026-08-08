/* DrivoSafe application shell.
 *
 * On the bus this launches straight into the Drive screen under Android kiosk
 * mode with no navigation at all (SYSTEM_DESIGN §17) — the tablet is a purpose
 * device, not a browser. The surface switcher below exists so all five surfaces
 * are reviewable from one build.
 */
import React, { useState } from 'react';
import DriveScreen from './screens/DriveScreen.jsx';
import RouteEditorScreen from './screens/RouteEditorScreen.jsx';
import AdminScreen from './screens/AdminScreen.jsx';
import FleetScreen from './screens/FleetScreen.jsx';
import GovernmentScreen from './screens/GovernmentScreen.jsx';
import { speech } from './platform/index.js';

const SURFACES = [
  { id: 'drive', label: 'Drive', sub: 'tablet' },
  { id: 'editor', label: 'Route Editor', sub: 'web' },
  { id: 'admin', label: 'Admin', sub: 'web' },
  { id: 'fleet', label: 'Fleet', sub: 'web' },
  { id: 'gov', label: 'Government', sub: 'web' },
];

export default function App() {
  const [surface, setSurface] = useState('drive');
  const [voiceOn, setVoiceOn] = useState(true);

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    speech.setEnabled(next);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          DRIVO<span>SAFE</span>
          <small>drivosafe.com</small>
        </div>

        <nav className="nav">
          {SURFACES.map((s) => (
            <button
              key={s.id}
              className={surface === s.id ? 'on' : ''}
              onClick={() => setSurface(s.id)}
              title={s.sub}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="spacer" />

        <button
          className="chip"
          onClick={toggleVoice}
          title="Voice is the primary driver channel; the screen is secondary"
        >
          {voiceOn ? 'VOICE ON' : 'VOICE OFF'}
        </button>
      </header>

      <main className={'screen' + (surface === 'drive' ? ' nopad' : '')}>
        {surface === 'drive' && <DriveScreen />}
        {surface === 'editor' && <RouteEditorScreen />}
        {surface === 'admin' && <AdminScreen />}
        {surface === 'fleet' && <FleetScreen />}
        {surface === 'gov' && <GovernmentScreen />}
      </main>
    </div>
  );
}
