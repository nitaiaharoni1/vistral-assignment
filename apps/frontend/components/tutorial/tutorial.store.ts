import { makeAutoObservable } from "mobx";

export const TUTORIAL_TITLES = [
  "Show an empty grid.",
  "You’re X. I’m O.",
  "See it play.",
];

export class TutorialStore {
  step = 0;
  direction: "next" | "previous" = "next";
  videoError = false;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isLastStep() {
    return this.step === TUTORIAL_TITLES.length - 1;
  }

  changeStep(nextStep: number) {
    this.direction = nextStep > this.step ? "next" : "previous";
    this.step = nextStep;
  }

  previous() {
    this.changeStep(Math.max(0, this.step - 1));
  }

  next() {
    this.changeStep(Math.min(TUTORIAL_TITLES.length - 1, this.step + 1));
  }

  markVideoError() {
    this.videoError = true;
  }

  reset() {
    this.step = 0;
    this.direction = "next";
    this.videoError = false;
  }
}
