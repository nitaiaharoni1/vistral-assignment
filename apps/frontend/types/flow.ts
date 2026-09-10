export type Source = "none" | "camera" | "sample" | "video";
export type Stage = "idle" | "starting" | "detecting" | "corners" | "calibrating" | "playing";
export type StageMode = "welcome" | "settingUp" | "inGame";

// Groups a stage into welcome, setup, or play.
function stageMode(stage: Stage): StageMode {
  switch (stage) {
    case "idle":
    case "starting":
      return "welcome";
    case "detecting":
    case "corners":
    case "calibrating":
      return "settingUp";
    case "playing":
      return "inGame";
    default: {
      const exhaustive: never = stage;
      return exhaustive;
    }
  }
}

// Returns true on the welcome screen stages.
export function isWelcome(stage: Stage): boolean {
  return stageMode(stage) === "welcome";
}

// Returns true while the board is being set up.
export function isSettingUp(stage: Stage): boolean {
  return stageMode(stage) === "settingUp";
}

// Returns true once the game is being played.
export function isInGame(stage: Stage): boolean {
  return stageMode(stage) === "inGame";
}
