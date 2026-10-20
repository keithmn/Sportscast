// Times typed in the admin ("2026-10-25T15:00", from a datetime-local box)
// carry no timezone. They mean Nairobi time (UTC+3 all year, no daylight
// saving) — read them that way, wherever the server runs (Railway is UTC).
// A value that already has a timezone (an ISO string with Z or an offset)
// is used as given. Same rule as parseKickoff in routes/competitions.js.
function parseNairobi(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value.trim())) {
    return new Date(`${value.trim()}+03:00`);
  }
  return new Date(value);
}

module.exports = { parseNairobi };
