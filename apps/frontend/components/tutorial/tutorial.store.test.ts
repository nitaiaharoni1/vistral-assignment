import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { TUTORIAL_TITLES } from "./tutorial.store";
import { TutorialStore } from "./tutorial.store";

describe("TutorialStore", () => {
  it("walks forward and back without leaving the title list", () => {
    const tutorial = new TutorialStore();
    tutorial.previous();
    expect(tutorial.step).toBe(0);
    tutorial.next();
    expect(tutorial.step).toBe(1);
    expect(tutorial.direction).toBe("next");
    tutorial.previous();
    expect(tutorial.direction).toBe("previous");
    tutorial.changeStep(TUTORIAL_TITLES.length - 1);
    expect(tutorial.isLastStep).toBe(true);
    tutorial.next();
    expect(tutorial.step).toBe(TUTORIAL_TITLES.length - 1);
  });

  it("records a video error and can reset", () => {
    const tutorial = new TutorialStore();
    tutorial.next();
    tutorial.markVideoError();
    tutorial.reset();
    expect(tutorial.step).toBe(0);
    expect(tutorial.videoError).toBe(false);
    expect(tutorial.direction).toBe("next");
  });
});
