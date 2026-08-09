/* Welcome — the one screen everybody sees, and the only place a role is chosen.
 *
 * Role selection here is a convenience, not a security boundary: the account
 * carries the role, and `authenticate()` refuses a mismatch (accounts.test.js).
 * What picking a role actually does is shape the sign-in that follows — a
 * driver is asked for a vehicle, a fleet owner is not.
 */
import React from 'react';
import { ROLES } from '@drivosafe/shared';
import { Wordmark, ROLE_ICON, ACCENT_VAR, ACCENT_SOFT, IconArrow, IconSun, IconMoon } from '../components/ui.jsx';

export default function WelcomeScreen({ onPick, theme, onToggleTheme }) {
  return (
    <div className="stage">
      <div className="stage-bar">
        <Wordmark />
        <div className="spacer" />
        <span className="chip neutral">v2.4.1</span>
        <button className="icon ghost" onClick={onToggleTheme} title={theme === 'day' ? 'Switch to night' : 'Switch to day'}>
          {theme === 'day' ? <IconMoon /> : <IconSun />}
        </button>
      </div>

      <div className="stage-body">
        <div className="welcome fade-in">
          <div className="welcome-hero">
            <span className="chip ok" style={{ marginBottom: 18 }}>
              <i className="dot live" /> ROAD INTELLIGENCE · MP CORRIDOR NETWORK
            </span>
            <h1>
              The road ahead,<br />known <em>before</em> it is seen.
            </h1>
            <p>
              One platform, four seats at the table. Sign in as yourself — the system decides
              what you are allowed to see, and it is never more than you need.
            </p>
          </div>

          <div className="role-grid">
            {ROLES.map((r) => {
              const Icon = ROLE_ICON[r.icon];
              return (
                <button
                  key={r.id}
                  className="role-card"
                  onClick={() => onPick(r.id)}
                  style={{ '--accent': ACCENT_VAR[r.accent], '--tint': ACCENT_SOFT[r.accent] }}
                >
                  <div className="ico"><Icon size={22} /></div>
                  <div className="tag">{r.tagline}</div>
                  <h3>{r.label}</h3>
                  <p>{r.blurb}</p>
                  <div className="go">Continue <IconArrow size={15} /></div>
                </button>
              );
            })}
          </div>

          <p className="dim center" style={{ marginTop: 26, fontSize: 11.5, lineHeight: 1.7 }}>
            Driver units are installed once per vehicle and stay signed in. Every other seat
            is a browser session that ends when you close it.
          </p>
        </div>
      </div>
    </div>
  );
}
