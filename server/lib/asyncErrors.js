// Express 4 doesn't pass a rejected promise from an async route handler to
// the error handler — the rejection escapes, and Node stops the whole
// process. Found 2026-10-19: a double-tap on "+ Add Fixture" (a duplicate
// fixture), deleting a fixture that was already gone, or a duplicate club
// name took the public site down until Railway restarted it.
//
// Required once, first thing in server/index.js: every route handler's
// returned promise is now caught and handed to next(err), exactly like a
// thrown error. (The same idea as the express-async-errors package, in the
// few lines it takes.) Express 5 does this itself; remove this on upgrade.

const Layer = require('express/lib/router/layer');

Layer.prototype.handle_request = function handle(req, res, next) {
  const fn = this.handle;
  if (fn.length > 3) return next(); // error-handling middleware: not for this path
  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === 'function') result.catch((err) => next(err));
  } catch (err) {
    next(err);
  }
};

// Turns the errors a route can't avoid into answers an editor can act on,
// instead of "Internal server error".
function errorStatus(err) {
  if (err && err.type === 'entity.parse.failed') return [400, 'The request was not valid JSON.'];
  if (err && err.code === 'P2002') return [409, 'That already exists — reload the page to see it.'];
  if (err && err.code === 'P2025') return [404, 'That no longer exists — it may already have been deleted. Reload the page.'];
  if (err && err.code === 'P2003') return [409, "It can't be changed or removed because other records depend on it."];
  return [500, 'Something went wrong on the server. Nothing was saved — try again.'];
}

module.exports = { errorStatus };
