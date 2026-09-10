import { Action } from "../../../shared/action/Action.component";

type TutorialControlsProps = {
  step: number;
  isLastStep: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onFinish: () => void;
};

// Shows Previous, Next, and finish buttons.
export function TutorialControls({ step, isLastStep, onPrevious, onNext, onFinish }: TutorialControlsProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3.5 pt-5 short-landscape:pt-3">
      <Action tone="quiet" disabled={step === 0} onClick={onPrevious}>
        Previous
      </Action>
      <Action onClick={isLastStep ? onFinish : onNext}>{isLastStep ? "Let’s play" : "Next"}</Action>
    </div>
  );
}
