# allthethings.ninja

The All The Things.Ninja website. Built with [Astro](https://astro.build) (static files, no WordPress, nothing to patch), hosted on a Linode, deployed automatically from GitHub.

## How changes go live

```
Claude edits the site and commits to GitHub (mfivey/allthethings-ninja)
        ↓
The Linode checks GitHub every 2 minutes, rebuilds, and publishes
        ↓
https://allthethings.ninja
```

## Where things live

| What | File |
|---|---|
| Name, tagline, email, nav links, socials | `src/config/site.ts` |
| Colors / fonts (brand tokens) | `src/styles/tokens.css` |
| Particle feel (speed, count, pull, swirl…) | `src/scripts/particles.ts` → `DEFAULTS` |
| Home page | `src/pages/index.astro` |
| New page | add `src/pages/<name>.astro` → becomes `/<name>` |
| Logo (vector, traced from the art files) | `src/assets/brand/` |
| Favicon, share image, static files | `public/` |
| Server setup + auto-publish (one time) | `deploy/cloud-init.yaml` |
| Build check on every commit | `.github/workflows/deploy.yml` |

## Run it locally (optional)

```
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
```

## Brand rules

Black, white, purple, greys. Matte only — no gloss, glow or shine.
Purple `#8742f4` · Off-white `#e4e4e7` · Background `#111113`.
