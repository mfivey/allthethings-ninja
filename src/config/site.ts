// ─────────────────────────────────────────────────────────────
//  SITE SETTINGS — the one place for names, links and copy.
//  Change something here and it updates everywhere.
// ─────────────────────────────────────────────────────────────

export const site = {
  name: 'All The Things.Ninja',
  url: 'https://allthethings.ninja',
  description:
    'All The Things.Ninja — video, aerial, content and social, handled by one ninja.',
  tagline: ['Video', 'Aerial', 'Content', 'Social'],
  email: 'mikey@allthethings.ninja',

  // Top navigation. Empty = no nav bar (landing page stays clean).
  // Add pages later like: { label: 'Work', href: '/work' }
  nav: [] as { label: string; href: string }[],

  // Social links (shown in the footer when filled in).
  socials: [] as { label: string; href: string }[],
};
