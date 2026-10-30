import test from "node:test";
import assert from "node:assert/strict";
import { TwitchChat } from "../dist/twitch.js";

test("EventSub subscribes to own channel, deduplicates notifications and stops on revocation", async (t) => {
  const statuses = [],
    messages = [],
    requests = [],
    sockets = [];
  class Socket {
    constructor(url) {
      this.url = url;
      sockets.push(this);
    }
    close() {
      this.onclose?.();
    }
  }
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        client_id: "public-client",
        user_id: "42",
        login: "crew",
        scopes: ["user:read:chat"],
      }),
    };
  });
  t.mock.property(globalThis, "WebSocket", Socket);
  const chat = new TwitchChat({
    onStatus: (...v) => statuses.push(v),
    onMessage: (...v) => messages.push(v),
  });
  t.after(() => chat.disconnect());
  await chat.connect("public-client", "test-token");
  assert.equal(sockets.length, 1);
  const emit = (type, payload, metadata = {}) =>
    sockets[0].onmessage({
      data: JSON.stringify({
        metadata: { message_type: type, ...metadata },
        payload,
      }),
    });
  await emit("session_welcome", {
    session: { id: "session-1", keepalive_timeout_seconds: 10 },
  });
  const subscription = JSON.parse(requests[1].options.body);
  assert.deepEqual(subscription.condition, {
    broadcaster_user_id: "42",
    user_id: "42",
  });
  assert.equal(subscription.transport.session_id, "session-1");
  assert.deepEqual(statuses.at(-1), ["connected", "crew"]);
  const event = {
    broadcaster_user_id: "42",
    chatter_user_id: "99",
    chatter_user_name: "pilot",
    message: { text: "!hack" },
  };
  await emit(
    "notification",
    { event },
    { message_id: "one", subscription_type: "channel.chat.message" },
  );
  await emit(
    "notification",
    { event },
    { message_id: "one", subscription_type: "channel.chat.message" },
  );
  assert.equal(messages.length, 1);
  await emit(
    "notification",
    { event: { ...event, broadcaster_user_id: "other" } },
    { message_id: "two", subscription_type: "channel.chat.message" },
  );
  assert.equal(messages.length, 1);
  await emit("revocation", {});
  assert.equal(chat.token, "");
  assert.equal(chat.closed, true);
  assert.equal(statuses.at(-1)[0], "error");
});

test("mismatched app or missing scope fails before websocket creation", async (t) => {
  for (const identity of [
    { client_id: "wrong", scopes: ["user:read:chat"] },
    { client_id: "public-client", scopes: [] },
  ]) {
    const statuses = [];
    t.mock.method(globalThis, "fetch", async () => ({
      ok: true,
      json: async () => identity,
    }));
    const chat = new TwitchChat({
      onStatus: (...v) => statuses.push(v),
      onMessage: () => {
        throw new Error("unexpected message");
      },
    });
    await chat.connect("public-client", "test-token");
    assert.equal(chat.closed, true);
    assert.equal(chat.token, "");
    assert.equal(statuses.at(-1)[0], "error");
    t.mock.restoreAll();
  }
});

test("failed subscription never reports connected", async (t) => {
  const statuses = [];
  let socket;
  class Socket {
    constructor() {
      socket = this;
    }
    close() {
      this.onclose?.();
    }
  }
  t.mock.property(globalThis, "WebSocket", Socket);
  t.mock.method(globalThis, "fetch", async (url) =>
    url.includes("/validate")
      ? {
          ok: true,
          json: async () => ({
            client_id: "client",
            user_id: "42",
            scopes: ["user:read:chat"],
          }),
        }
      : { ok: false, status: 403 },
  );
  const chat = new TwitchChat({
    onStatus: (...v) => statuses.push(v),
    onMessage: () => {},
  });
  t.after(() => chat.disconnect());
  await chat.connect("client", "test-token");
  await socket.onmessage({
    data: JSON.stringify({
      metadata: { message_type: "session_welcome" },
      payload: { session: { id: "session" } },
    }),
  });
  assert.equal(
    statuses.some(([s]) => s === "connected"),
    false,
  );
  assert.equal(statuses.at(-1)[0], "error");
  assert.equal(chat.token, "");
});
