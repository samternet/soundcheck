/**
 * A user id that has come from a trusted source — a session created at Jellyfin
 * login, or Jellyfin's own `/Sessions` feed — never a value read directly out of
 * a request body/query/params. Every function that reads or writes per-user data
 * (`play_events`, `user_meta`, ...) takes this type instead of a bare `string`, so
 * a route can't accidentally scope a query by a client-supplied id: passing
 * `String(req.query.userId)` where this type is expected is a type error, not
 * just a review miss.
 *
 * `trustUserId` is the only way to produce one. Call it solely at a genuine trust
 * boundary (see its call sites in index.ts, jellyfin.ts and tracker.ts) — never on
 * a value that originated from this app's own HTTP request.
 */
export type AuthedUserId = string & { readonly __authedUserId: unique symbol }

export function trustUserId(id: string): AuthedUserId {
  return id as AuthedUserId
}
