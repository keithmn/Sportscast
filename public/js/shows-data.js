// The fixed show taxonomy. Shows are a packaging decision (weekly product,
// audience, identity) and stay separate from the Sport tagging used by the
// data/article models — see The Circuit for why one show can bundle
// several disciplines while each still gets tagged individually.
const SHOWS = [
  {
    slug: 'the-sportscast',
    name: 'The Sportscast',
    kind: 'flagship',
    sportLabel: 'All Sports',
    videoSeries: 'The Sportscast',
    coverImageUrl: '/images/shows/the-sportscast.jpg',
    color: '#fbbc1e',
    tagline: 'The flagship conversation.',
    description: '45–60 minute sit-downs with the people shaping Kenyan sport — athletes, administrators, and the figures driving change across the continent. Rare, deep, and the reason the rest of this house is credible.',
  },
  {
    slug: 'the-hydration-break',
    name: 'The Hydration Break',
    kind: 'niche',
    sportLabel: 'Football',
    videoSeries: 'The Hydration Break',
    coverImageUrl: '/images/shows/the-hydration-break.jpg',
    color: '#3a7d3a',
    tagline: 'The weekend, in 15 minutes.',
    description: 'A seated, weekly conversation covering everything that happened in Kenyan football over the weekend — no highlight-reel narration, just two hosts talking through what actually mattered.',
  },
  {
    slug: 'the-ruck',
    name: 'The Ruck',
    kind: 'niche',
    sportLabel: 'Rugby',
    videoSeries: 'The Ruck',
    coverImageUrl: '/images/shows/the-ruck.jpg',
    color: '#1F7A6C',
    tagline: 'A fast 7-minute rundown.',
    description: 'The weekend across Kenyan rugby, distilled into seven minutes — the Kenya Cup, the Shujaa, and everything in between.',
  },
  {
    slug: 'bully-off',
    name: 'Bully Off',
    kind: 'niche',
    sportLabel: 'Hockey',
    videoSeries: 'Bully Off',
    coverImageUrl: '/images/shows/bully-off.jpg',
    color: '#3d6fa3',
    tagline: 'The weekly hockey digest.',
    description: 'Kenyan hockey gets a fraction of the coverage its depth deserves — this is the weekly corrective.',
  },
  {
    slug: 'fast-break',
    name: 'Fast Break',
    kind: 'niche',
    sportLabel: 'Basketball',
    videoSeries: 'Fast Break',
    coverImageUrl: '/images/shows/fast-break.jpg',
    color: '#a35b3d',
    tagline: 'The weekly basketball digest.',
    description: 'From grassroots courts to the local league — a fast-paced weekly look at Kenyan basketball.',
  },
  {
    slug: 'the-circuit',
    name: 'The Circuit',
    kind: 'niche',
    sportLabel: 'Athletics · Boxing · Martial Arts · Darts',
    videoSeries: 'The Circuit',
    coverImageUrl: '/images/shows/the-circuit.jpg',
    color: '#7a4a9e',
    tagline: 'Every individual sport, one show.',
    description: 'One name that works for a track circuit, a fight circuit, and a darts circuit at once — athletics, boxing, martial arts, and everything else that runs its own individual circuit, in one weekly show.',
  },
];

function getShowBySlug(slug) {
  return SHOWS.find((s) => s.slug === slug);
}
