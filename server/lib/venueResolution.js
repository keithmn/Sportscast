// Turns the venue name an editor typed (inline, or a bulk-import column)
// into a Venue row. Matching is case/space/punctuation-insensitive and
// exact otherwise — "nyayo  national stadium" finds "Nyayo National
// Stadium", but "Nyayo Stadium" does not, on purpose: fuzzy-matching
// stadium names would quietly merge two different grounds. An unknown name
// creates a new Venue, and callers report that back so an editor notices a
// typo'd duplicate instead of it slipping in silently.

const { slugify } = require('../utils/slugify');

function normalizeVenueName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Returns { venueId, created } — venueId null for a blank name (meaning
// "no venue"); undefined input means "not provided, leave unchanged" and
// is handled by callers, not here.
async function resolveVenue(prisma, name, venueCache) {
  const trimmed = (name || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return { venueId: null, created: false };
  const key = normalizeVenueName(trimmed);

  const venues = venueCache || await prisma.venue.findMany({ select: { id: true, name: true } });
  const match = venues.find((v) => normalizeVenueName(v.name) === key);
  if (match) return { venueId: match.id, created: false };

  let slug = slugify(trimmed);
  if (await prisma.venue.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
  const venue = await prisma.venue.create({ data: { name: trimmed, slug } });
  if (venueCache) venueCache.push({ id: venue.id, name: venue.name });
  return { venueId: venue.id, created: true };
}

module.exports = { normalizeVenueName, resolveVenue };
