// Assemble a reproducible guest with no compiler dependency. The guest walks
// the token itself; the host supplies UTF-16 data, not morphology decisions.
export function uleb(n) {
  const a = [];
  do {
    const b = n & 127;
    n = Math.floor(n / 128);
    a.push(b + (n ? 128 : 0));
  } while (n);
  return a;
}
const utf = (s) => [s.length, ...new TextEncoder().encode(s)];
const section = (id, data) => [id, ...uleb(data.length), ...data];
export function fixtureModule(body, locals = 10) {
  const fn = [1, ...uleb(locals), 127, ...body, 11];
  return Uint8Array.from([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    ...section(1, [1, 96, 3, 127, 127, 127, 1, 127]),
    ...section(2, [1, ...utf("host"), ...utf("memory"), 2, 1, 1, 1]),
    ...section(3, [1, 0]),
    ...section(7, [1, ...utf("match"), 0, 0]),
    ...section(10, [1, ...uleb(fn.length), ...fn])
  ]);
}
const C = (n) => {
  const a = uleb(n);
  if (a.at(-1) & 64) {
    a[a.length - 1] |= 128;
    a.push(0);
  }
  return [65, ...a];
};
const G = (i) => [32, i],
  set = (i, v) => [...v, 33, i],
  bin = (op, a, b) => [...a, ...b, op];
const eq = (a, b) => bin(70, a, b),
  ne = (a, b) => bin(71, a, b),
  add = (a, b) => bin(106, a, b),
  sub = (a, b) => bin(107, a, b),
  and = (a, b) => bin(113, a, b),
  or = (a, b) => bin(114, a, b),
  not = (a) => [...a, 69];
const char = (a, i) => [...add(C(a), bin(108, i, C(2))), 47, 1, 0];
const L = (i) => char(0, i),
  W = (i) => char(256, i),
  ch = (c) => C(c.charCodeAt(0)),
  any = (v, chars) => [...chars].map((c) => eq(v, ch(c))).reduce(or),
  yes = [...C(1), 15],
  no = [...C(0), 15];
const iff = (predicate, then, otherwise = []) => [
  ...predicate,
  4,
  64,
  ...then,
  ...(otherwise.length ? [5, ...otherwise] : []),
  11
];
export function turkishGuest() {
  const i = G(3),
    p = G(4),
    lastV = G(5),
    low = G(6),
    high = G(7),
    lc = G(8),
    wc = G(9),
    changed = G(10);
  const remaining = sub(G(1), p),
    hardened = any(W(sub(p, C(1))), "çfhkpsşt");
  const vowel = "aeıioöuü";
  const correspond = [
    ["p", "b"],
    ["ç", "c"],
    ["t", "d"],
    ["k", "ğ"]
  ]
    .map(([a, b]) => and(eq(lc, ch(a)), eq(wc, ch(b))))
    .reduce(or);
  return fixtureModule([
    ...iff(bin(73, G(1), G(0)), no),
    2,
    64,
    3,
    64,
    ...bin(79, i, G(0)),
    13,
    1,
    ...set(8, L(i)),
    ...set(9, W(i)),
    ...iff(any(lc, vowel), set(5, lc)),
    ...iff(ne(lc, wc), [...iff(not(and(and(G(2), eq(add(i, C(1)), G(0))), correspond)), no), ...set(10, C(1))]),
    ...set(3, add(i, C(1))),
    12,
    0,
    11,
    11,
    ...set(4, G(0)),
    ...iff(eq(remaining, C(0)), iff(changed, no, yes)),
    ...iff(eq(lastV, C(0)), no),
    ...iff(any(lastV, "aıou"), set(6, ch("a")), set(6, ch("e"))),
    ...iff(
      any(lastV, "aı"),
      set(7, ch("ı")),
      iff(any(lastV, "ei"), set(7, ch("i")), iff(any(lastV, "ou"), set(7, ch("u")), set(7, ch("ü"))))
    ),
    ...iff(
      and(
        bin(79, remaining, C(3)),
        and(eq(W(p), ch("l")), and(eq(W(add(p, C(1))), low), eq(W(add(p, C(2))), ch("r"))))
      ),
      [
        ...iff(changed, no),
        ...set(4, add(p, C(3))),
        ...iff(eq(low, ch("a")), set(7, ch("ı")), set(7, ch("i"))),
        ...iff(eq(remaining, C(0)), yes)
      ]
    ),
    ...iff(
      any(W(sub(p, C(1))), vowel),
      iff(and(eq(remaining, C(2)), and(eq(W(p), ch("y")), eq(W(add(p, C(1))), high))), yes)
    ),
    ...iff(
      and(not(any(W(sub(p, C(1))), vowel)), and(eq(remaining, C(1)), eq(W(p), high))),
      iff(and(and(G(2), eq(p, G(0))), and(any(lc, "pçtk"), not(changed))), no, yes)
    ),
    ...iff(changed, no),
    ...iff(
      and(
        or(eq(remaining, C(2)), eq(remaining, C(3))),
        and(or(and(hardened, eq(W(p), ch("t"))), and(not(hardened), eq(W(p), ch("d")))), eq(W(add(p, C(1))), low))
      ),
      iff(or(eq(remaining, C(2)), eq(W(add(p, C(2))), ch("n"))), yes)
    ),
    ...C(0)
  ]);
}
