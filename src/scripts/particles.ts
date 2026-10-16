// ─────────────────────────────────────────────────────────────
//  ATTN Particle Field
//  Slow matte particles drifting through space.
//   • Move the pointer  → particles part around it.
//   • Hold still        → they get pulled in and orbit the cursor.
//   • Move again        → they scatter and drift off.
//  All the feel lives in DEFAULTS below — tweak numbers, not code.
// ─────────────────────────────────────────────────────────────

export interface ParticleConfig {
  /** particles per 10,000 px² of screen (clamped by min/max) */
  density: number;
  min: number;
  max: number;
  /** base drift speed in px per frame (60fps) */
  drift: number;
  /** particle radius range in px */
  size: [number, number];
  /** chance a particle is purple (0–1) */
  purpleShare: number;
  greys: string[];
  purples: string[];
  /** opacity range */
  alpha: [number, number];
  /** how lumpy the round core is (0 = perfect circle, 0.25 = noticeably uneven) */
  wobble: number;
  /** share of particles with a soft fading edge around the core (0–1) */
  haloShare: number;
  /** how far the soft edge reaches, in multiples of the core radius */
  haloReach: [number, number];
  /** share of particles with a few faint streaks sticking out (0–1) */
  streakShare: number;
  /** streak length, in multiples of the core radius */
  streakLength: [number, number];
  /** max spin speed in radians per frame (streaks turn slowly) */
  spin: number;

  /** pointer moving: push-away radius and strength */
  repelRadius: number;
  repelStrength: number;

  /** ms the pointer must rest before particles start gathering */
  idleDelay: number;
  /** gather radius grows from start → end over growMs */
  attractRadiusStart: number;
  attractRadiusEnd: number;
  growMs: number;
  attractStrength: number;
  /** sideways pull while gathering, makes them orbit (0 = straight in) */
  swirl: number;
  /** particles settle into a ring this far from the cursor */
  orbitRadius: [number, number];
  /** outward kick when the pointer moves again after gathering */
  scatter: number;

  /** faint lines between gathered particles: 'focus' | 'none' */
  links: 'focus' | 'none';
  linkDistance: number;
  linkAlpha: number;

  /** velocity damping per frame (closer to 1 = floatier) */
  friction: number;
}

export const DEFAULTS: ParticleConfig = {
  density: 1.1,
  min: 70,
  max: 240,
  drift: 0.14,
  size: [0.7, 2.9],
  purpleShare: 0.16,
  greys: ['#4a4a51', '#6b6b73', '#8d8d95', '#b4b4ba', '#d4d4d8'],
  purples: ['#7a52c7', '#8742f4', '#5d3f96'],
  alpha: [0.35, 0.9],
  wobble: 0.16,
  haloShare: 0.55,
  haloReach: [1.8, 3.4],
  streakShare: 0.25,
  streakLength: [2.2, 4.6],
  spin: 0.0025,

  repelRadius: 130,
  repelStrength: 0.55,

  idleDelay: 420,
  attractRadiusStart: 160,
  attractRadiusEnd: 460,
  growMs: 2600,
  attractStrength: 0.06,
  swirl: 0.55,
  orbitRadius: [28, 120],
  scatter: 2.2,

  links: 'focus',
  linkDistance: 70,
  linkAlpha: 0.12,

  friction: 0.94,
};

interface P {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  depth: number;      // 0.35 (far) … 1 (near): scales speed + reaction
  color: string;
  alpha: number;
  orbit: number;      // preferred distance from cursor when gathered
  dir: 1 | -1;        // orbit direction
  seed: number;
  held: boolean;
  sprite: HTMLCanvasElement; // pre-drawn look of this particle (unique per particle)
  half: number;               // half the sprite size in CSS px
  rot: number;
  spin: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[(Math.random() * arr.length) | 0];

export function createParticleField(
  canvas: HTMLCanvasElement,
  overrides: Partial<ParticleConfig> = {},
) {
  const cfg: ParticleConfig = { ...DEFAULTS, ...overrides };
  const ctx = canvas.getContext('2d', { alpha: true })!;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w = 0, h = 0, dpr = 1;
  let ps: P[] = [];
  let raf = 0;

  // Pointer state
  const ptr = { x: -9999, y: -9999, active: false, lastMove: 0, gathering: false, gatherStart: 0 };

  const rgba = (hex: string, a: number) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  // Each particle gets its own little hand-drawn sprite:
  // a round-but-not-perfect core, sometimes a soft fading edge,
  // sometimes a few faint streaks. Drawn once, reused every frame.
  function makeSprite(r: number, color: string) {
    const hasHalo = r > 0.9 && Math.random() < cfg.haloShare;
    const hasStreaks = r > 1.1 && Math.random() < cfg.streakShare;
    const reach = hasHalo ? rand(cfg.haloReach[0], cfg.haloReach[1]) : 1.2;
    const streakLen = hasStreaks ? rand(cfg.streakLength[0], cfg.streakLength[1]) : 0;
    const half = Math.ceil(r * Math.max(reach, streakLen, 1.3) + 2);
    const scale = Math.min(window.devicePixelRatio || 1, 2) * 2; // crisp when rotated
    const c = document.createElement('canvas');
    c.width = c.height = half * 2 * scale;
    const g = c.getContext('2d')!;
    g.scale(scale, scale);
    g.translate(half, half);

    // soft fading edge
    if (hasHalo) {
      const grad = g.createRadialGradient(0, 0, r * 0.6, 0, 0, r * reach);
      const strength = rand(0.25, 0.5);
      grad.addColorStop(0, rgba(color, strength));
      grad.addColorStop(0.45, rgba(color, strength * 0.35));
      grad.addColorStop(1, rgba(color, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, r * reach, 0, Math.PI * 2);
      g.fill();
    }

    // faint streaks (1–3), tapered and fading outward
    if (hasStreaks) {
      const count = 1 + ((Math.random() * 3) | 0);
      const base = Math.random() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const a = base + (i * Math.PI * 2) / count + rand(-0.5, 0.5);
        const len = r * streakLen * rand(0.6, 1);
        const w = r * rand(0.18, 0.32);
        g.save();
        g.rotate(a);
        const sg = g.createLinearGradient(0, 0, len, 0);
        sg.addColorStop(0, rgba(color, 0.7));
        sg.addColorStop(1, rgba(color, 0));
        g.fillStyle = sg;
        g.beginPath();
        g.moveTo(0, -w);
        g.lineTo(len, 0);
        g.lineTo(0, w);
        g.closePath();
        g.fill();
        g.restore();
      }
    }

    // core: round, but each one a little uneven
    const pts = 10;
    const radii = Array.from({ length: pts }, () => r * (1 + rand(-cfg.wobble, cfg.wobble)));
    const P = radii.map((rr, i) => {
      const ang = (i / pts) * Math.PI * 2;
      return [Math.cos(ang) * rr, Math.sin(ang) * rr];
    });
    const mid = (i: number) => {
      const p0 = P[i % pts], p1 = P[(i + 1) % pts];
      return [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    };
    g.fillStyle = color;
    g.beginPath();
    const m0 = mid(pts - 1);
    g.moveTo(m0[0], m0[1]);
    for (let i = 0; i < pts; i++) {
      const m = mid(i);
      g.quadraticCurveTo(P[i][0], P[i][1], m[0], m[1]);
    }
    g.closePath();
    g.fill();

    return { sprite: c, half };
  }

  function makeParticle(): P {
    const depth = Math.pow(Math.random(), 0.7) * 0.65 + 0.35;
    const purple = Math.random() < cfg.purpleShare;
    const r = rand(cfg.size[0], cfg.size[1]) * (0.55 + depth * 0.45);
    const color = purple ? pick(cfg.purples) : pick(cfg.greys);
    const { sprite, half } = makeSprite(r, color);
    return {
      sprite,
      half,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() * 2 - 1) * cfg.spin,
      x: Math.random() * w,
      y: Math.random() * h,
      vx: 0, vy: 0,
      r,
      depth,
      color,
      alpha: rand(cfg.alpha[0], cfg.alpha[1]) * (0.5 + depth * 0.5),
      orbit: rand(cfg.orbitRadius[0], cfg.orbitRadius[1]),
      dir: Math.random() < 0.82 ? 1 : -1,
      seed: Math.random() * 1000,
      held: false,
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const target = Math.max(cfg.min, Math.min(cfg.max, Math.round((w * h) / 10000 * cfg.density)));
    if (ps.length < target) while (ps.length < target) ps.push(makeParticle());
    else ps.length = target;
    for (const p of ps) { p.x = Math.min(p.x, w); p.y = Math.min(p.y, h); }
    if (reduced) draw(0);
  }

  // Gentle, slowly-changing flow field for the ambient drift.
  function flow(x: number, y: number, t: number, seed: number) {
    const a =
      Math.sin(x * 0.0016 + t * 0.00011 + seed) * 1.4 +
      Math.cos(y * 0.0019 - t * 0.00009) * 1.3;
    return a;
  }

  function step(t: number) {
    const now = performance.now();
    const idle = ptr.active && now - ptr.lastMove > cfg.idleDelay;

    if (idle && !ptr.gathering) { ptr.gathering = true; ptr.gatherStart = now; }

    const grow = ptr.gathering ? Math.min(1, (now - ptr.gatherStart) / cfg.growMs) : 0;
    const easeGrow = 1 - Math.pow(1 - grow, 3);
    const attractR = cfg.attractRadiusStart + (cfg.attractRadiusEnd - cfg.attractRadiusStart) * easeGrow;

    for (const p of ps) {
      // ambient drift
      const ang = flow(p.x, p.y, t, p.seed);
      const sp = cfg.drift * (0.4 + p.depth * 0.9);
      p.vx += (Math.cos(ang) * sp - p.vx) * 0.02;
      p.vy += (Math.sin(ang) * sp - p.vy) * 0.02;

      p.held = false;
      if (ptr.active) {
        const dx = p.x - ptr.x;
        const dy = p.y - ptr.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const nx = dx / d, ny = dy / d;

        if (ptr.gathering) {
          if (d < attractR) {
            p.held = true;
            const falloff = 1 - d / attractR;
            // radial: pull toward the particle's orbit ring
            const radial = (d - p.orbit) * cfg.attractStrength * (0.35 + falloff) * p.depth;
            p.vx -= nx * radial * 0.12;
            p.vy -= ny * radial * 0.12;
            // tangential: swirl around the cursor
            const tang = cfg.swirl * (0.25 + falloff) * p.depth * p.dir;
            p.vx += -ny * tang * 0.12;
            p.vy += nx * tang * 0.12;
          }
        } else if (d < cfg.repelRadius) {
          const f = (1 - d / cfg.repelRadius) ** 2 * cfg.repelStrength * p.depth;
          p.vx += nx * f;
          p.vy += ny * f;
        }
      }

      p.vx *= cfg.friction + (p.held ? 0.02 : 0);
      p.vy *= cfg.friction + (p.held ? 0.02 : 0);
      // keep ambient drift alive under friction
      p.x += p.vx + Math.cos(ang) * sp * 0.6;
      p.y += p.vy + Math.sin(ang) * sp * 0.6;

      p.rot += p.spin * (p.held ? 2.5 : 1);

      // wrap around edges
      const m = 20;
      if (p.x < -m) p.x = w + m; else if (p.x > w + m) p.x = -m;
      if (p.y < -m) p.y = h + m; else if (p.y > h + m) p.y = -m;
    }
  }

  function draw(_t: number) {
    ctx.clearRect(0, 0, w, h);

    // links between gathered particles (subtle constellation)
    if (cfg.links === 'focus' && ptr.gathering) {
      const held = ps.filter((p) => p.held);
      const ld2 = cfg.linkDistance * cfg.linkDistance;
      ctx.lineWidth = 0.6;
      for (let i = 0; i < held.length; i++) {
        const a = held[i];
        for (let j = i + 1; j < held.length; j++) {
          const b = held[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dd = dx * dx + dy * dy;
          if (dd < ld2) {
            ctx.globalAlpha = (1 - dd / ld2) * cfg.linkAlpha;
            ctx.strokeStyle = '#8d8d95';
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
    }

    for (const p of ps) {
      ctx.globalAlpha = p.alpha;
      ctx.setTransform(dpr * Math.cos(p.rot), dpr * Math.sin(p.rot), -dpr * Math.sin(p.rot), dpr * Math.cos(p.rot), p.x * dpr, p.y * dpr);
      ctx.drawImage(p.sprite, -p.half, -p.half, p.half * 2, p.half * 2);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }

  function loop(t: number) {
    step(t);
    draw(t);
    raf = requestAnimationFrame(loop);
  }

  // ── pointer handling ──
  function release(kick: boolean) {
    if (ptr.gathering && kick) {
      for (const p of ps) {
        if (!p.held) continue;
        const dx = p.x - ptr.x, dy = p.y - ptr.y;
        const d = Math.hypot(dx, dy) || 1;
        const k = cfg.scatter * p.depth * rand(0.5, 1.1);
        p.vx += (dx / d) * k;
        p.vy += (dy / d) * k;
      }
    }
    ptr.gathering = false;
  }

  function onMove(e: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const moved = Math.hypot(x - ptr.x, y - ptr.y);
    if (ptr.gathering && moved > 6) release(true);
    ptr.x = x; ptr.y = y;
    ptr.active = true;
    if (moved > 1.5) ptr.lastMove = performance.now();
  }
  function onLeave() { release(true); ptr.active = false; }
  function onDown(e: PointerEvent) {
    // touch: a press acts like the pointer arriving and resting
    if (e.pointerType !== 'mouse') onMove(e);
  }
  function onUp(e: PointerEvent) {
    if (e.pointerType !== 'mouse') onLeave();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  if (!reduced) {
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    raf = requestAnimationFrame(loop);
  }

  return {
    config: cfg,
    pointer: ptr,
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    },
  };
}
