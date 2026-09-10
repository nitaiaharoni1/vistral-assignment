import { X } from "@phosphor-icons/react";
import { Action } from "../../../shared/action/Action.component";
import { TUTORIAL_TITLES } from "../../tutorial.store";

type TutorialHeaderProps = {
  id: string;
  step: number;
  onClose: () => void;
};

// Shows the step count and the close button.
export function TutorialHeader({ id, step, onClose }: TutorialHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between">
      <p id={`${id}-progress`} className="text-sm text-muted">
        Step {step + 1} of {TUTORIAL_TITLES.length}
      </p>
      <Action tone="icon" label="Close tutorial" onClick={onClose}>
        <X size={20} aria-hidden="true" />
      </Action>
    </div>
  );
}
