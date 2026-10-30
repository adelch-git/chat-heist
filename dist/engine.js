export const scenes = [
  {
    name: "THE APPROACH",
    title: "One vault. Three ways in.",
    brief:
      "The orbital vault is passing through the dark side. Choose your entry before the station wakes up.",
    options: [
      {
        command: "ghost",
        name: "Ghost the vents",
        role: "STEALTH",
        description: "Quiet entry. A smaller take.",
        heat: 8,
        loot: 12000,
        result:
          "You slip through the vents. Nobody sees a thing. A maintenance cache adds 12,000 credits.",
      },
      {
        command: "hack",
        name: "Hijack the grid",
        role: "TECH",
        description: "Bigger take. Leave a digital trace.",
        heat: 28,
        loot: 24000,
        result:
          "The grid bends to your will. 24,000 credits secured, but security detects your signature.",
      },
      {
        command: "blast",
        name: "Make an entrance",
        role: "CHAOS",
        description: "Maximum loot. Maximum attention.",
        heat: 48,
        loot: 36000,
        result:
          "The airlock erupts. 36,000 credits spill out. Every camera on the station turns toward you.",
      },
    ],
  },
  {
    name: "THE TIME VAULT",
    title: "Steal something worth rewinding for.",
    brief:
      "The time core is exposed. Security is closing in. How much are you willing to risk?",
    options: [
      {
        command: "cloak",
        name: "Cloak the crew",
        role: "STEALTH",
        description: "Cool down. Secure the core.",
        heat: -18,
        loot: 18000,
        result:
          "Your crew disappears from the sensors. The time core is yours. Heat drops by 18.",
      },
      {
        command: "clone",
        name: "Clone the core",
        role: "TECH",
        description: "Two cores. Twice the signature.",
        heat: 22,
        loot: 42000,
        result:
          "A second time core flickers into existence. So does a new security alert.",
      },
      {
        command: "overload",
        name: "Crack every safe",
        role: "CHAOS",
        description: "An enormous haul. Alarms guaranteed.",
        heat: 42,
        loot: 68000,
        result:
          "Every safe opens at once. The station enters lockdown. This is either genius or a terrible idea.",
      },
    ],
  },
  {
    name: "THE GETAWAY",
    title: "You have the loot. Now get out.",
    brief:
      "At 80 heat the escape fails. The whole chat gets one chance to rewrite history.",
    options: [
      {
        command: "drift",
        name: "Drift into darkness",
        role: "STEALTH",
        description: "−10 heat. Leave 8,000 behind.",
        heat: -10,
        loot: -8000,
        result:
          "You cut the engines and drift through the debris field. The scanners sweep past.",
      },
      {
        command: "jump",
        name: "Jump through time",
        role: "TECH",
        description: "+12 heat. Bring home a bonus.",
        heat: 12,
        loot: 20000,
        result:
          "The time core tears open a shortcut. Your ship leaps toward the extraction beacon.",
      },
      {
        command: "burn",
        name: "Burn for the exit",
        role: "CHAOS",
        description: "+28 heat. Grab the escort cargo.",
        heat: 28,
        loot: 34000,
        result:
          "You steal the escort cargo and punch the engines. Everything depends on how hot you came in.",
      },
    ],
  },
];
export function initialState() {
  return {
    stage: 0,
    heat: 0,
    loot: 0,
    phase: "ready",
    seconds: 30,
    votes: {},
    rewindVotes: {},
    rewinds: 1,
    history: [],
    message: "Your crew is waiting. Start the heist.",
    outcome: null,
  };
}
export function start(s) {
  if (s.phase === "ready" || s.phase === "result") {
    s.phase = "voting";
    s.seconds = 30;
    s.votes = {};
    s.rewindVotes = {};
  }
}
export function vote(s, user, command) {
  if (
    s.phase !== "voting" ||
    typeof user !== "string" ||
    !user ||
    user.length > 128 ||
    typeof command !== "string"
  )
    return false;
  const c = command.trim().toLowerCase().replace(/^!/, "");
  if (!scenes[s.stage].options.some((o) => o.command === c)) return false;
  s.votes["u:" + user] = c;
  return true;
}
export function counts(s) {
  return scenes[s.stage].options.map(
    (o) => Object.values(s.votes).filter((v) => v === o.command).length,
  );
}
export function resolve(s) {
  if (s.phase !== "voting") return false;
  const totals = counts(s);
  if (!totals.some(Boolean)) {
    s.phase = "paused";
    s.message = "No votes yet. Resume when your crew is ready.";
    return false;
  }
  const index = totals.indexOf(Math.max(...totals)),
    choice = scenes[s.stage].options[index];
  s.history.push({
    stage: s.stage,
    heat: s.heat,
    loot: s.loot,
    choice: choice.command,
    total: Object.keys(s.votes).length,
    voters: Object.keys(s.votes),
  });
  s.heat = Math.max(0, Math.min(100, s.heat + choice.heat));
  s.loot = Math.max(0, s.loot + choice.loot);
  s.message = choice.result;
  s.votes = {};
  s.rewindVotes = {};
  if (s.stage === 2) {
    s.phase = "ended";
    s.outcome = s.heat >= 80 ? "caught" : "escaped";
  } else {
    s.stage++;
    s.phase = "result";
  }
  return true;
}
export function rewind(s) {
  if (!s.rewinds || !s.history.length || !["result", "ended"].includes(s.phase))
    return false;
  const previous = s.history.pop();
  Object.assign(s, {
    stage: previous.stage,
    heat: previous.heat,
    loot: previous.loot,
    rewinds: 0,
    phase: "ready",
    seconds: 30,
    votes: {},
    rewindVotes: {},
    outcome: null,
    message: `Timeline rewritten. You know what !${previous.choice} did. Choose a different future.`,
  });
  return true;
}
export function rewindVote(s, user) {
  if (
    !s.rewinds ||
    !s.history.length ||
    !["result", "ended"].includes(s.phase) ||
    !user ||
    !s.history.at(-1).voters.includes("u:" + user) ||
    s.rewindVotes["u:" + user]
  )
    return false;
  s.rewindVotes["u:" + user] = true;
  return true;
}
export function pause(s) {
  if (s.phase === "voting") {
    s.phase = "paused";
    return true;
  }
  return false;
}
export function resume(s) {
  if (s.phase === "paused") {
    s.phase = "voting";
    if (s.seconds === 0) s.seconds = 15;
    return true;
  }
  return false;
}
export function tick(s) {
  if (s.phase === "voting") {
    s.seconds = Math.max(0, s.seconds - 1);
    if (!s.seconds) resolve(s);
  }
}
