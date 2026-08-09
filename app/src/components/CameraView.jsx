/* Camera viewport — driver-facing (identity) and cabin-facing (operator clip).
 *
 * The real front camera is used when the browser will give it: this is the same
 * frame source the DMS runs on, and seeing yourself in it is most of what makes
 * the identity step feel like a check rather than a formality.
 *
 * When there is no camera — no permission, no device, an insecure origin, or a
 * console reviewing a bus a thousand kilometres away — it falls back to a
 * synthesised feed rather than an error box. That is not decoration: the
 * consoles must render the same layout whether or not a stream exists, and a
 * missing camera is a *reported condition* (`cabin.cameraOnline`), never a
 * broken screen.
 */
import React, { useEffect, useRef, useState } from 'react';

export function useCamera(enabled) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | starting | live | denied | unavailable
  const streamRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) return undefined;

    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
    if (!md || !md.getUserMedia) { setStatus('unavailable'); return undefined; }

    setStatus('starting');
    md.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setStatus('live');
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus(e && e.name === 'NotAllowedError' ? 'denied' : 'unavailable');
      });

    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [enabled]);

  return { videoRef, status, live: status === 'live' };
}

/* A synthesised cab view: a dark cabin gradient, a seated silhouette and a
 * slow parallax band standing in for the windscreen. Deterministic per seed so
 * two buses do not look identical. */
export function SyntheticFeed({ seed = 1, moving = true, night = true, kind = 'face' }) {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const ctx = cv.getContext('2d');
    let raf = 0;
    let t = 0;
    const rnd = (n) => Math.abs(Math.sin((seed + n) * 12.9898) * 43758.5453) % 1;

    const draw = () => {
      const w = (cv.width = cv.clientWidth * 2);
      const h = (cv.height = cv.clientHeight * 2);
      t += moving ? 1 : 0.15;

      const g = ctx.createLinearGradient(0, 0, 0, h);
      if (night) { g.addColorStop(0, '#12181f'); g.addColorStop(1, '#05080b'); }
      else { g.addColorStop(0, '#4a5b6a'); g.addColorStop(1, '#141b22'); }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      /* windscreen band with passing light */
      const bandY = h * 0.12;
      const bg = ctx.createLinearGradient(0, bandY, w, bandY + h * 0.3);
      bg.addColorStop(0, night ? '#0b1220' : '#8fa7bd');
      bg.addColorStop(0.5, night ? '#16304a' : '#c3d4e2');
      bg.addColorStop(1, night ? '#0b1220' : '#8fa7bd');
      ctx.fillStyle = bg;
      ctx.fillRect(0, bandY, w, h * 0.3);

      for (let i = 0; i < 7; i++) {
        const x = ((t * (0.6 + rnd(i) * 1.6) + rnd(i + 9) * w) % (w + 120)) - 60;
        ctx.fillStyle = night ? 'rgba(255,214,140,0.5)' : 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.ellipse(x, bandY + h * 0.12 + rnd(i + 3) * h * 0.1, 26, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      if (kind === 'face') {
        /* head and shoulders, centred, with a slow sway */
        const cx = w / 2 + Math.sin(t / 90) * w * 0.01;
        const cy = h * 0.56 + Math.cos(t / 70) * h * 0.008;
        ctx.fillStyle = night ? '#1b242e' : '#2c3a47';
        ctx.beginPath();
        ctx.ellipse(cx, h * 1.02, w * 0.34, h * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx, cy, w * 0.13, h * 0.19, 0, 0, Math.PI * 2);
        ctx.fill();
        /* rim light from the display */
        ctx.strokeStyle = night ? 'rgba(31,227,155,0.4)' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, w * 0.13, h * 0.19, 0, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      } else {
        /* cabin: wheel arc and dashboard edge */
        ctx.strokeStyle = night ? '#222d38' : '#3b4b5a';
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.arc(w / 2, h * 1.06, w * 0.3, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
        ctx.fillStyle = night ? '#0c1116' : '#26313b';
        ctx.fillRect(0, h * 0.72, w, h * 0.28);
      }

      /* sensor grain */
      ctx.globalAlpha = 0.05;
      for (let i = 0; i < 240; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [seed, moving, night, kind]);

  return <canvas ref={ref} />;
}

/**
 * The viewport chrome: a badge, an optional reticle and a timestamp, wrapped
 * around either a live <video> or the synthetic feed.
 */
export default function CameraView({
  live, videoRef, seed = 1, kind = 'face', night = true, moving = true,
  badge, state, reticle = true, stamp, children,
}) {
  return (
    <div className={'viewport' + (state ? ' ' + state : '')}>
      {live ? (
        <video ref={videoRef} muted playsInline style={{ transform: 'scaleX(-1)' }} />
      ) : (
        <SyntheticFeed seed={seed} kind={kind} night={night} moving={moving} />
      )}

      {badge ? (
        <div className="vp-badge">
          <i className="dot live" style={{ color: live ? 'var(--brand)' : 'var(--amber)' }} />
          {badge}
        </div>
      ) : null}

      {reticle ? <div className="reticle" /> : null}
      {state === 'scanning' ? <div className="scanline" /> : null}
      {stamp ? <div className="vp-time">{stamp}</div> : null}
      {children}
    </div>
  );
}
