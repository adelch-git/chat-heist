import {
  scenes,
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
} from "./engine.js";
import { TwitchChat } from "./twitch.js";
let state = initialState(),
  mode = "practice",
  connected = false,
  lastMessage = "",
  stream = false;
const $ = (id) => document.getElementById(id),
  money = (n) => n.toLocaleString("en-US");
function log(name, message) {
  const p = document.createElement("p"),
    b = document.createElement("b");
  b.textContent = name + " ";
  p.append(b, document.createTextNode(message));
  $("log").prepend(p);
  while ($("log").children.length > 30) $("log").lastChild.remove();
}
function render() {
  const scene = scenes[state.stage],
    total = Object.keys(state.votes).length,
    tally = counts(state);
  $("phase-label").textContent = {
    ready: "CREW ON STANDBY",
    voting: "CHAT IS CALLING THE SHOTS",
    paused: "MISSION PAUSED",
    result: "DECISION LOCKED",
    ended:
      state.outcome === "escaped" ? "EXTRACTION COMPLETE" : "CREW CAPTURED",
  }[state.phase];
  $("stage-label").textContent = `ACT 0${state.stage + 1} / 03`;
  $("scene-name").textContent = scene.name;
  $("loot").replaceChildren(document.createTextNode(money(state.loot)));
  const cr = document.createElement("span");
  cr.textContent = " CR";
  $("loot").append(cr);
  $("heat-value").textContent = state.heat + "%";
  $("heat-bar").style.width = state.heat + "%";
  $("timer").textContent = String(state.seconds).padStart(2, "0");
  $("round-label").textContent =
    state.phase === "ended" ? "THE FINAL SCORE" : scene.name;
  $("round-title").textContent =
    state.phase === "ended"
      ? state.outcome === "escaped"
        ? "The crew made history."
        : "Too hot to get away."
      : scene.title;
  $("brief").textContent = ["ready", "voting"].includes(state.phase)
    ? scene.brief
    : state.message;
  const signature = state.stage + ":" + mode;
  if ($("choices").dataset.signature !== signature) {
    $("choices").dataset.signature = signature;
    $("choices").replaceChildren();
    for (const [i, o] of scene.options.entries()) {
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = `<span class="role">0${i + 1} / ${o.role}</span><strong>${o.name}</strong><span class="description">${o.description}</span><span class="command-row"><span>!${o.command}</span><span class="count">0</span></span><i class="vote-fill"></i>`;
      b.onclick = () => {
        if (mode === "practice")
          receive(
            "practice-" + $("practice-user").value,
            $("practice-user").selectedOptions[0].textContent,
            "!" + o.command,
          );
      };
      $("choices").append(b);
    }
  }
  [...$("choices").children].forEach((b, i) => {
    b.disabled = state.phase !== "voting" || mode !== "practice";
    b.querySelector(".count").textContent = tally[i];
    b.querySelector(".vote-fill").style.width =
      (total ? (tally[i] / total) * 100 : 0) + "%";
  });
  $("vote-total").textContent = `${total} crew vote${total === 1 ? "" : "s"}`;
  $("start").disabled =
    !["ready", "result"].includes(state.phase) ||
    (mode === "twitch" && !connected);
  $("start").textContent =
    state.phase === "result"
      ? "Next act ↗"
      : state.stage === 0
        ? "Launch the heist ↗"
        : "Replay this act ↗";
  $("pause").disabled =
    !["voting", "paused"].includes(state.phase) ||
    (mode === "twitch" && !connected);
  $("pause").textContent = state.phase === "paused" ? "Resume" : "Pause";
  $("resolve").disabled = state.phase !== "voting" || !total;
  $("rewind").disabled =
    !state.rewinds ||
    !state.history.length ||
    !["result", "ended"].includes(state.phase);
  $("rewind").innerHTML = `↶ Rewind time <span>${state.rewinds} LEFT</span>`;
  $("timeline-nodes").replaceChildren();
  for (let i = 0; i < 3; i++) {
    const n = document.createElement("span");
    n.className =
      "node " +
      (state.history.some((h) => h.stage === i)
        ? "done"
        : i === state.stage
          ? "active"
          : "");
    n.textContent = String(i + 1);
    n.title = scenes[i].name;
    $("timeline-nodes").append(n);
  }
  $("outcome").hidden = state.phase !== "ended";
  $("outcome").textContent =
    state.outcome === "escaped" ? "HEIST COMPLETE" : "BUSTED";
  $("outcome").classList.toggle("caught", state.outcome === "caught");
  const threshold = Math.floor((state.history.at(-1)?.total || 0) / 2) + 1;
  $("rewind-progress").textContent = state.rewinds
    ? `${Object.keys(state.rewindVotes).length} / ${threshold} !rewind votes needed after the last decision.`
    : "Time core depleted. This timeline is yours.";
  $("practice-controls").hidden = mode !== "practice";
  $("control-hint").textContent =
    mode === "practice"
      ? "Start a round, then click a move to rehearse. Ties go to the leftmost option."
      : "Viewers vote with the commands on screen. Ties go to the leftmost option.";
  $("stream-start").disabled = $("start").disabled;
  $("stream-pause").disabled = $("pause").disabled;
  $("stream-lock").disabled = $("resolve").disabled;
  $("practice-rewind").disabled = $("rewind").disabled;
  if (lastMessage !== state.message) {
    log("MISSION", state.message);
    lastMessage = state.message;
  }
}
function doRewind() {
  if (rewind(state)) {
    document.body.classList.remove("rewinding");
    requestAnimationFrame(() => document.body.classList.add("rewinding"));
    setTimeout(() => document.body.classList.remove("rewinding"), 900);
    render();
  }
}
function receive(id, name, text) {
  if (text.trim().toLowerCase() === "!rewind") {
    if (rewindVote(state, id)) {
      log(name, "voted to rewrite the timeline.");
      const threshold = Math.floor((state.history.at(-1)?.total || 0) / 2) + 1;
      if (Object.keys(state.rewindVotes).length >= threshold) doRewind();
    }
  } else if (vote(state, id, text)) {
    log(name, text.trim().toLowerCase());
  }
  render();
}
const twitch = new TwitchChat({
  onMessage: receive,
  onStatus(status, message) {
    connected = status === "connected";
    if (status === "connected") {
      mode = "twitch";
      $("connection").textContent = "● TWITCH / " + message;
      $("comms-mode").textContent = "TWITCH EVENTSUB";
      $("connect-dialog").close();
      $("connect-error").textContent = "";
      log("TWITCH", "Connected to " + message);
    } else if (status === "error") {
      pause(state);
      $("connect-error").textContent = message;
      $("connection").textContent = "○ TWITCH DISCONNECTED";
      log("TWITCH", message);
    } else if (status === "connecting") {
      $("connection").textContent = "○ CONNECTING";
    } else {
      pause(state);
      $("connection").textContent =
        mode === "practice" ? "● PRACTICE MODE" : "○ TWITCH DISCONNECTED";
    }
    render();
  },
});
// Constructor has no callbacks: state is fully initialized before connection attempts.
const redirect = location.origin + location.pathname;
$("redirect-url").textContent = redirect;
$("connect-open").onclick = () => $("connect-dialog").showModal();
$("connect-token").onclick = () => {
  const token = $("token").value;
  $("token").value = "";
  state = initialState();
  mode = "twitch";
  twitch.connect($("client-id").value, token);
};
$("authorize").onclick = () => {
  const client = $("client-id").value.trim();
  if (!/^[a-zA-Z0-9]{10,80}$/.test(client)) {
    $("connect-error").textContent =
      "Enter your registered Twitch application client ID.";
    return;
  }
  const nonce = crypto.randomUUID();
  sessionStorage.setItem(
    "chatheist-oauth",
    JSON.stringify({ nonce, client, created: Date.now() }),
  );
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: client,
    redirect_uri: redirect,
    response_type: "token",
    scope: "user:read:chat",
    state: nonce,
  });
  location.assign(url);
};
$("disconnect").onclick = () => {
  twitch.disconnect();
  mode = "practice";
  state = initialState();
  $("connection").textContent = "● PRACTICE MODE";
  $("comms-mode").textContent = "LOCAL REHEARSAL";
  $("connect-dialog").close();
  render();
};
$("start").onclick = () => {
  start(state);
  render();
};
$("pause").onclick = () => {
  state.phase === "paused" ? resume(state) : pause(state);
  render();
};
$("resolve").onclick = () => {
  resolve(state);
  render();
};
$("rewind").onclick = doRewind;
$("reset").onclick = () => {
  if (state.history.length || state.phase === "voting") {
    if (!confirm("Reset this heist? Current votes and loot will be cleared."))
      return;
  }
  state = initialState();
  render();
};
$("screen").onclick = () => {
  stream = !stream;
  document.body.classList.toggle("stream", stream);
  $("screen").textContent = stream ? "Exit stream view" : "Stream view ⛶";
};
$("stream-start").onclick = () => $("start").click();
$("stream-pause").onclick = () => $("pause").click();
$("stream-lock").onclick = () => $("resolve").click();
$("practice-rewind").onclick = () => {
  if (mode === "practice")
    receive(
      "practice-" + $("practice-user").value,
      $("practice-user").selectedOptions[0].textContent,
      "!rewind",
    );
};
document.addEventListener("keydown", (e) => {
  if (
    e.repeat ||
    e.ctrlKey ||
    e.altKey ||
    e.metaKey ||
    document.querySelector("dialog[open]") ||
    ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"].includes(
      document.activeElement?.tagName,
    )
  )
    return;
  const target = { Enter: "start", p: "pause", l: "resolve", r: "rewind" }[
    e.key
  ];
  if (target) {
    e.preventDefault();
    $(target).click();
  }
});
setInterval(() => {
  tick(state);
  render();
}, 1000);
render();
if (location.hash) {
  const params = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname + location.search);
  let pending;
  try {
    pending = JSON.parse(sessionStorage.getItem("chatheist-oauth"));
  } catch {}
  sessionStorage.removeItem("chatheist-oauth");
  if (params.has("access_token")) {
    if (
      pending &&
      params.get("state") === pending.nonce &&
      Date.now() - pending.created < 600000
    ) {
      $("client-id").value = pending.client;
      mode = "twitch";
      twitch.connect(pending.client, params.get("access_token"));
    } else {
      $("connect-error").textContent =
        "Authorization state did not match or expired. Please reconnect.";
      $("connect-dialog").showModal();
    }
  }
}
// Original procedural artwork: orbit, vault, time core and crew ship.
const canvas = $("universe"),
  ctx = canvas.getContext("2d"),
  reduced = matchMedia("(prefers-reduced-motion: reduce)");
function draw(ms) {
  const dpr = Math.min(devicePixelRatio || 1, 2),
    w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const t = reduced.matches ? 0 : ms / 1000;
  const bg = ctx.createRadialGradient(
    w * 0.58,
    h * 0.44,
    10,
    w * 0.58,
    h * 0.44,
    w * 0.6,
  );
  bg.addColorStop(0, "#22352d");
  bg.addColorStop(0.5, "#0b1c1d");
  bg.addColorStop(1, "#060d12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 100; i++) {
    const x = (((i * 7919) % 997) / 997) * w,
      y = (((i * 137) % 601) / 601) * h;
    ctx.fillStyle = `rgba(205,226,211,${0.15 + (i % 5) * 0.12})`;
    ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, 1);
  }
  ctx.save();
  ctx.translate(w * 0.56, h * 0.46);
  ctx.rotate(-0.25);
  ctx.strokeStyle = "#42584b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 165, 56, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#9aba6a44";
  ctx.beginPath();
  ctx.ellipse(0, 0, 205, 78, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.rotate(t * 0.08);
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 4);
    ctx.fillStyle = i % 2 ? "#405044" : "#283a32";
    ctx.fillRect(74, -15, 48, 30);
    ctx.strokeStyle = "#83976b";
    ctx.strokeRect(74, -15, 48, 30);
    ctx.fillStyle = "#c9eb7b";
    ctx.fillRect(110, -9, 3, 18);
    ctx.restore();
  }
  ctx.restore();
  ctx.fillStyle = "#182b26";
  ctx.strokeStyle = "#6e8867";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    const x = Math.cos(a) * 78,
      y = Math.sin(a) * 78;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#b7d77c";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 53, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.rotate(-t * 0.4);
  ctx.setLineDash([16, 8]);
  ctx.beginPath();
  ctx.arc(0, 0, 43, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 40);
  glow.addColorStop(0, "#e1ff9bcc");
  glow.addColorStop(1, "#bce97000");
  ctx.fillStyle = glow;
  ctx.fillRect(-40, -40, 80, 80);
  ctx.fillStyle = "#e1ffa1";
  ctx.beginPath();
  ctx.moveTo(0, -23);
  ctx.lineTo(15, 0);
  ctx.lineTo(0, 23);
  ctx.lineTo(-15, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const shipX = w * 0.24 + Math.sin(t * 0.6) * 8,
    shipY = h * 0.55 + Math.cos(t * 0.7) * 6;
  ctx.save();
  ctx.translate(shipX, shipY);
  ctx.rotate(-0.18);
  const trail = ctx.createLinearGradient(-80, 0, 0, 0);
  trail.addColorStop(0, "#bdec6a00");
  trail.addColorStop(1, "#bdec6aaa");
  ctx.fillStyle = trail;
  ctx.beginPath();
  ctx.moveTo(-90, 0);
  ctx.lineTo(-15, -6);
  ctx.lineTo(-15, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#d8e1c4";
  ctx.beginPath();
  ctx.moveTo(29, 0);
  ctx.lineTo(-23, -15);
  ctx.lineTo(-12, 0);
  ctx.lineTo(-23, 15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#a7cc68";
  ctx.fillRect(-5, -3, 14, 6);
  ctx.restore();
  if (state.heat > 55) {
    ctx.fillStyle = `rgba(255,98,60,${0.03 + Math.sin(t * 2) * 0.015})`;
    ctx.fillRect(0, 0, w, h);
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
