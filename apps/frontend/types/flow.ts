export type Source = "none" | "camera" | "sample" | "video";
export type Stage =
  "idle" | "starting" | "detecting" | "corners" | "calibrating" | "playing";
export type StageMode = "welcome" | "settingUp" | "inGame";

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

export function isWelcome(stage: Stage): boolean {
  return stageMode(stage) === "welcome";
}

export function isSettingUp(stage: Stage): boolean {
  return stageMode(stage) === "settingUp";
}

export function isInGame(stage: Stage): boolean {
  return stageMode(stage) === "inGame";
}
