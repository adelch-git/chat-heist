export function validReconnect(url) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "wss:" &&
      u.hostname === "eventsub.wss.twitch.tv" &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}
export class EventDeduper {
  constructor() {
    this.ids = new Set();
  }
  accept(id) {
    if (!id || this.ids.has(id)) return false;
    this.ids.add(id);
    if (this.ids.size > 5000) this.ids.delete(this.ids.values().next().value);
    return true;
  }
}
export class TwitchChat {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.sockets = new Set();
    this.dedupe = new EventDeduper();
    this.closed = true;
    this.generation = 0;
  }
  async connect(clientId, token) {
    this.disconnect();
    this.closed = false;
    const generation = this.generation;
    this.clientId = clientId.trim();
    this.token = token.trim().replace(/^oauth:/, "");
    this.onStatus("connecting", "Validating Twitch access…");
    try {
      const response = await fetch("https://id.twitch.tv/oauth2/validate", {
        headers: { Authorization: `OAuth ${this.token}` },
      });
      if (!response.ok)
        throw new Error(
          "Twitch token is invalid or expired. Reconnect with Twitch.",
        );
      const identity = await response.json();
      if (generation !== this.generation) return;
      if (
        identity.client_id !== this.clientId ||
        !identity.scopes?.includes("user:read:chat")
      )
        throw new Error(
          "Use this application’s user token with user:read:chat permission.",
        );
      this.userId = identity.user_id;
      this.login = identity.login;
      this.open("wss://eventsub.wss.twitch.tv/ws");
      this.validation = setInterval(() => this.validate(generation), 3600000);
    } catch (e) {
      if (generation === this.generation) {
        this.disconnect();
        this.onStatus("error", e.message);
      }
    }
  }
  async validate(generation) {
    try {
      const r = await fetch("https://id.twitch.tv/oauth2/validate", {
        headers: { Authorization: `OAuth ${this.token}` },
      });
      if (!r.ok) throw new Error();
    } catch {
      if (generation === this.generation) {
        this.disconnect();
        this.onStatus(
          "error",
          "Twitch authorization expired. Reconnect to continue.",
        );
      }
    }
  }
  open(url, previous = null) {
    if (this.closed) return;
    const socket = new WebSocket(url);
    this.sockets.add(socket);
    let watchdog,
      welcomed = false;
    const generation = this.generation;
    let timeout = 15000;
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => socket.close(), timeout);
    };
    arm();
    socket.onmessage = async ({ data }) => {
      if (this.closed || generation !== this.generation) return;
      arm();
      let packet;
      try {
        packet = JSON.parse(data);
      } catch {
        return;
      }
      const type = packet.metadata?.message_type;
      try {
        if (type === "session_welcome") {
          welcomed = true;
          timeout =
            ((packet.payload.session.keepalive_timeout_seconds || 10) + 3) *
            1000;
          arm();
          if (previous) {
            previous.close();
            this.onStatus("connected", this.login);
            return;
          }
          const r = await fetch(
            "https://api.twitch.tv/helix/eventsub/subscriptions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${this.token}`,
                "Client-Id": this.clientId,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                type: "channel.chat.message",
                version: "1",
                condition: {
                  broadcaster_user_id: this.userId,
                  user_id: this.userId,
                },
                transport: {
                  method: "websocket",
                  session_id: packet.payload.session.id,
                },
              }),
            },
          );
          if (this.closed || generation !== this.generation) return;
          if (!r.ok)
            throw new Error(
              `Twitch subscription failed (${r.status}). Check your application and chat permission.`,
            );
          this.onStatus("connected", this.login);
        } else if (
          type === "notification" &&
          packet.metadata.subscription_type === "channel.chat.message" &&
          this.dedupe.accept(packet.metadata.message_id)
        ) {
          const e = packet.payload.event;
          if (e.broadcaster_user_id === this.userId)
            this.onMessage(
              e.chatter_user_id,
              e.chatter_user_name,
              e.message.text,
            );
        } else if (type === "session_reconnect") {
          const next = packet.payload.session.reconnect_url;
          if (!validReconnect(next))
            throw new Error("Twitch returned an unexpected reconnect address.");
          this.onStatus("connecting", "Reconnecting to Twitch…");
          this.open(next, socket);
        } else if (type === "revocation")
          throw new Error(
            "Twitch chat access was revoked. Reconnect to continue.",
          );
      } catch (e) {
        if (generation === this.generation) {
          this.disconnect();
          this.onStatus("error", e.message);
        }
      }
    };
    socket.onerror = () => {};
    socket.onclose = () => {
      clearTimeout(watchdog);
      this.sockets.delete(socket);
      if (!this.closed && this.sockets.size === 0) {
        this.disconnect();
        this.onStatus(
          "error",
          welcomed
            ? "Twitch connection lost. Round paused; reconnect to continue."
            : "Could not reach Twitch. Check your connection.",
        );
      }
    };
  }
  disconnect() {
    this.closed = true;
    this.generation++;
    clearInterval(this.validation);
    for (const s of this.sockets) s.close();
    this.sockets.clear();
    this.token = "";
    this.onStatus("disconnected", "Practice mode");
  }
}
