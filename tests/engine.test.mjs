import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  start,
  vote,
  counts,
  resolve,
  rewind,
  rewindVote,
  pause,
  resume,
  tick,
} from "../dist/engine.js";
import { EventDeduper, validReconnect } from "../dist/twitch.js";
function round(s, command) {
  start(s);
  assert.equal(vote(s, "a", command), true);
  assert.equal(resolve(s), true);
}
test("one latest vote per identity; only exact known commands", () => {
  const s = initialState();
  assert.equal(vote(s, "a", "ghost"), false);
  start(s);
  vote(s, "a", "!ghost");
  vote(s, "a", "!hack");
  assert.deepEqual(counts(s), [0, 1, 0]);
  for (const c of ["!hack now", "!overload", "<script>", "!", ""])
    assert.equal(vote(s, "b", c), false);
  vote(s, "__proto__", "!blast");
  assert.deepEqual(counts(s), [0, 1, 1]);
});
test("pause blocks votes and time; resume continues; zero-vote timeout pauses", () => {
  const s = initialState();
  start(s);
  tick(s);
  pause(s);
  tick(s);
  assert.equal(s.seconds, 29);
  assert.equal(vote(s, "a", "ghost"), false);
  resume(s);
  for (let i = 0; i < 29; i++) tick(s);
  assert.equal(s.phase, "paused");
  assert.equal(s.history.length, 0);
  resume(s);
  assert.equal(s.seconds, 15);
});
test("ties resolve leftmost and duplicate resolve is inert", () => {
  const s = initialState();
  start(s);
  vote(s, "a", "hack");
  vote(s, "b", "ghost");
  resolve(s);
  assert.equal(s.history[0].choice, "ghost");
  assert.equal(resolve(s), false);
  assert.equal(s.loot, 12000);
});
test("safe route escapes and reckless route gets caught", () => {
  const safe = initialState();
  ["ghost", "cloak", "drift"].forEach((c) => round(safe, c));
  assert.equal(safe.outcome, "escaped");
  assert.equal(safe.loot, 22000);
  const risky = initialState();
  ["blast", "overload", "burn"].forEach((c) => round(risky, c));
  assert.equal(risky.outcome, "caught");
  assert.equal(risky.heat, 100);
});
test("rewind restores exact pre-round state, clears votes and cannot duplicate rewards", () => {
  const s = initialState();
  round(s, "blast");
  round(s, "overload");
  assert.equal(s.loot, 104000);
  assert.equal(rewind(s), true);
  assert.equal(s.stage, 1);
  assert.equal(s.loot, 36000);
  assert.equal(s.heat, 48);
  assert.equal(s.rewinds, 0);
  round(s, "cloak");
  assert.equal(s.loot, 54000);
  assert.equal(s.heat, 30);
  assert.equal(rewind(s), false);
  round(s, "drift");
  assert.equal(s.outcome, "escaped");
  assert.equal(s.loot, 46000);
});
test("failed escape can be rewound and new decision changes ending", () => {
  const s = initialState();
  ["hack", "clone", "burn"].forEach((c) => round(s, c));
  assert.equal(s.heat, 78);
  assert.equal(s.outcome, "escaped");
  const r = initialState();
  ["blast", "clone", "burn"].forEach((c) => round(r, c));
  assert.equal(r.outcome, "caught");
  rewind(r);
  assert.equal(r.outcome, null);
  round(r, "drift");
  assert.equal(r.outcome, "escaped");
  assert.equal(r.heat, 60);
});
test("rewind election accepts only previous round participants once", () => {
  const s = initialState();
  assert.equal(rewindVote(s, "a"), false);
  start(s);
  vote(s, "a", "blast");
  vote(s, "b", "blast");
  vote(s, "c", "ghost");
  resolve(s);
  assert.equal(rewindVote(s, "stranger"), false);
  assert.equal(rewindVote(s, "a"), true);
  assert.equal(rewindVote(s, "a"), false);
  assert.equal(rewindVote(s, "b"), true);
  assert.equal(Object.keys(s.rewindVotes).length, 2);
});
test("EventSub delivery deduplicates, bounds memory, rejects missing IDs", () => {
  const d = new EventDeduper();
  assert.equal(d.accept(null), false);
  assert.equal(d.accept("event1"), true);
  assert.equal(d.accept("event1"), false);
  for (let i = 0; i < 5100; i++) d.accept(String(i));
  assert.equal(d.ids.size, 5000);
});
test("reconnect URL cannot send session traffic to another host", () => {
  assert.equal(
    validReconnect("wss://eventsub.wss.twitch.tv/ws?reconnect=abc"),
    true,
  );
  for (const u of [
    "https://eventsub.wss.twitch.tv/ws",
    "wss://evil.test/ws",
    "wss://eventsub.wss.twitch.tv.evil.test",
    "not-url",
    "wss://secret@eventsub.wss.twitch.tv/ws",
  ])
    assert.equal(validReconnect(u), false);
});
