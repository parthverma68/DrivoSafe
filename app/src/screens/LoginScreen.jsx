/* Sign-in for a chosen role.
 *
 * The credential check is `authenticate()` in @drivosafe/shared — the same call
 * the tablet makes, and the one that becomes a POST when the Identity Service
 * exists. Nothing about this screen knows how a password is compared.
 *
 * The demo accounts are listed in the open on purpose: this is a seeded
 * frontend with no backend, and pretending otherwise would just make the build
 * harder to review.
 */
import React, { useState } from 'react';
import { ROLE_BY_ID, accountsForRole, authenticate } from '@drivosafe/shared';
import {
  Wordmark, Avatar, ROLE_ICON, ACCENT_VAR, ACCENT_SOFT,
  IconBack, IconCheck, IconAlert, IconSun, IconMoon,
} from '../components/ui.jsx';

const PITCH = {
  driver: [
    'Installed once in your cab — after that the bus signs you in, not a password.',
    'A face check and a breath test before the wheel turns. Both take under a minute.',
    'Then the road model does the rest: lane, speed and hazard, spoken before you see it.',
  ],
  operator: [
    'Only your vehicles. Tenancy is enforced in the data layer, not by hiding a menu.',
    'Live position, the driver at the wheel right now, and their fatigue state.',
    'Cabin video is requested and audited — never a window you can leave open.',
  ],
  admin: [
    'Every operator, every vehicle, every corridor.',
    'Mirror any cab and see the exact drive screen its driver is looking at.',
    'Onboarding, corridor publishing and fatigue review in one seat.',
  ],
  gov: [
    'Surface condition scored from passing traffic — no survey crew, no lane closure.',
    'Maintenance priority P1–P3 with the evidence behind each ranking.',
    'No operator, driver or vehicle identity is exposed on this surface. Ever.',
  ],
};

export default function LoginScreen({ roleId, onBack, onSignIn, theme, onToggleTheme }) {
  const role = ROLE_BY_ID[roleId];
  const demo = accountsForRole(roleId);
  const [username, setUsername] = useState(demo[0] ? demo[0].username : '');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState(null);
  const Icon = ROLE_ICON[role.icon];

  const submit = (e) => {
    e.preventDefault();
    const r = authenticate({ username, secret, role: roleId });
    if (!r.ok) { setError(r); return; }
    setError(null);
    onSignIn(r.account);
  };

  const fill = (a) => {
    setUsername(a.username);
    setSecret(a.secret != null ? a.secret : DEMO_SECRET[a.role]);
    setError(null);
  };

  return (
    <div className="stage" style={{ '--accent': ACCENT_VAR[role.accent], '--tint': ACCENT_SOFT[role.accent] }}>
      <div className="stage-bar">
        <button className="ghost" onClick={onBack}><IconBack size={16} /> Back</button>
        <div className="spacer" />
        <Wordmark />
        <div className="spacer" />
        <button className="icon ghost" onClick={onToggleTheme}>
          {theme === 'day' ? <IconMoon /> : <IconSun />}
        </button>
      </div>

      <div className="stage-body">
        <div className="login fade-in">
          <aside className="login-aside">
            <div
              className="ico"
              style={{
                width: 46, height: 46, borderRadius: 14, display: 'grid', placeItems: 'center',
                background: ACCENT_SOFT[role.accent], color: ACCENT_VAR[role.accent],
              }}
            >
              <Icon size={22} />
            </div>
            <h2>{role.label}</h2>
            <p>{role.blurb}</p>
            <ul>
              {PITCH[roleId].map((line) => (
                <li key={line}><IconCheck size={15} /><span>{line}</span></li>
              ))}
            </ul>
          </aside>

          <form className="login-form" onSubmit={submit}>
            <h3>Sign in</h3>
            <p className="lead">
              {roleId === 'driver'
                ? 'One-time setup for this unit. After this the vehicle identifies you every shift.'
                : 'Your console session ends when you close the browser.'}
            </p>

            {error ? (
              <div className="formerr"><IconAlert size={15} /><span>{error.message}</span></div>
            ) : null}

            <div className="field">
              <label htmlFor="u">Username</label>
              <input
                id="u" value={username} autoComplete="username" autoFocus
                onChange={(e) => { setUsername(e.target.value); setError(null); }}
                placeholder="username"
              />
            </div>

            <div className="field">
              <label htmlFor="p">{roleId === 'driver' ? 'Passcode' : 'Password'}</label>
              <input
                id="p" type="password" value={secret} autoComplete="current-password"
                onChange={(e) => { setSecret(e.target.value); setError(null); }}
                placeholder={roleId === 'driver' ? '4-digit passcode' : '••••••'}
              />
            </div>

            <button className="primary lg block" type="submit" style={{ marginTop: 6 }}>
              Continue as {role.label}
            </button>

            <div className="demo-accounts">
              <div className="eyebrow">Seeded accounts — tap to fill</div>
              <div className="row">
                {demo.map((a) => (
                  <button key={a.id} type="button" className="demo-pill" onClick={() => fill(a)}>
                    <Avatar name={a.name} hue={a.avatarHue} size="sm" />
                    <span style={{ marginLeft: 2 }}>{a.username} · {a.secret}</span>
                  </button>
                ))}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* Fallback only — every seeded account carries its own secret. */
const DEMO_SECRET = { driver: '1234', operator: 'fleet', admin: 'admin', gov: 'gov' };
