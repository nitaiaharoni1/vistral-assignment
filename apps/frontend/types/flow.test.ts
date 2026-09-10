import { describe, expect, it } from "vitest";
import { isInGame, isSettingUp, isWelcome, type Stage } from "./flow";

const STAGES: Stage[] = [
  "idle",
  "starting",
  "detecting",
  "corners",
  "calibrating",
  "playing",
];

describe("stage helpers", () => {
  it("groups welcome, setup, and play stages", () => {
    expect(STAGES.filter(isWelcome)).toEqual(["idle", "starting"]);
    expect(STAGES.filter(isSettingUp)).toEqual([
      "detecting",
      "corners",
      "calibrating",
    ]);
    expect(STAGES.filter(isInGame)).toEqual(["playing"]);
  });
});
