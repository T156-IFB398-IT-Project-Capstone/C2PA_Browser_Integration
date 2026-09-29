// Deterministic Date.now() for TTL tests. Uses t.mock.method (Node 20 and 24),
// so the real clock is restored automatically when the test ends.
//
//   const clock = useClock(t);   // Date.now() === 1_000_000
//   clock.advance(5_000);        // Date.now() === 1_005_000

export function useClock(t, start = 1_000_000) {
  let now = start;
  t.mock.method(Date, 'now', () => now);
  return {
    advance(ms) { now += ms; },
    get now() { return now; },
  };
}
