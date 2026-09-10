import { makeAutoObservable } from "mobx";

export const TUTORIAL_TITLES = ["Show an empty grid.", "You’re X. I’m O.", "See it play."];

export class TutorialStore {
  step = 0;
  direction: "next" | "previous" = "next";
  videoError = false;

  // Makes store fields observable and auto-binds methods.
  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // True when the last tutorial title is showing.
  get isLastStep() {
    return this.step === TUTORIAL_TITLES.length - 1;
  }

  // Moves to a step and records next or previous.
  changeStep(nextStep: number) {
    this.direction = nextStep > this.step ? "next" : "previous";
    this.step = nextStep;
  }

  // Goes back one tutorial step, stopping at the first.
  previous() {
    this.changeStep(Math.max(0, this.step - 1));
  }

  // Advances one tutorial step, stopping at the last.
  next() {
    this.changeStep(Math.min(TUTORIAL_TITLES.length - 1, this.step + 1));
  }

  // Flags that the tutorial video failed to load.
  markVideoError() {
    this.videoError = true;
  }

  // Returns the tutorial to the first step.
  reset() {
    this.step = 0;
    this.direction = "next";
    this.videoError = false;
  }
}
