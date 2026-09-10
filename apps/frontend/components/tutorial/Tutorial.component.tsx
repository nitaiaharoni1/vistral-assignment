import { useEffect } from "react";
import { useId } from "react";
import { useMemo } from "react";
import { useRef } from "react";
import type { RefObject } from "react";
import { observer } from "mobx-react-lite";
import { TutorialStore } from "./tutorial.store";
import { TUTORIAL_TITLES } from "./tutorial.store";
import { Modal } from "../shared/modal/Modal.component";
import { cn } from "../shared/cn/cn";
import { TutorialControls } from "./subcomponents/tutorial-controls/TutorialControls.component";
import { TutorialCopy } from "./subcomponents/tutorial-copy/TutorialCopy.component";
import { TutorialHeader } from "./subcomponents/tutorial-header/TutorialHeader.component";
import { TutorialVisual } from "./subcomponents/tutorial-visual/TutorialVisual.component";
import { TutorialWatch } from "./subcomponents/tutorial-watch/TutorialWatch.component";

const tutorialBodyClass = cn("motion-settle min-h-0 flex-1 animate-tutorial-step overflow-y-auto overscroll-contain py-1 [scrollbar-gutter:stable] [--step-offset:12px]", "data-[direction=previous]:[--step-offset:-12px]");

type TutorialProps = {
  open: boolean;
  onClose: () => void;
  onFinish: () => void;
  paperVideoSrc?: string;
};

// Resets the tutorial and closes the dialog.
function closeTutorial(store: TutorialStore, onClose: () => void) {
  store.reset();
  onClose();
}

// Renders the current tutorial step body.
function TutorialBody({
  id,
  step,
  direction,
  open,
  paperVideoSrc,
  videoError,
  onVideoError,
  headingRef,
  bodyRef,
}: {
  id: string;
  step: number;
  direction: "next" | "previous";
  open: boolean;
  paperVideoSrc?: string;
  videoError: boolean;
  onVideoError: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  bodyRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className={tutorialBodyClass} ref={bodyRef} key={step} data-direction={direction}>
      <h2 className="text-[29px] leading-[1.2] font-[680] tracking-[-0.025em] focus:outline-none max-[600px]:text-[26px]" ref={headingRef} id={`${id}-title`} tabIndex={-1} aria-describedby={`${id}-progress`}>
        {TUTORIAL_TITLES[step]}
      </h2>
      <TutorialVisual step={step} />
      <TutorialWatch step={step} open={open} paperVideoSrc={paperVideoSrc} videoError={videoError} onError={onVideoError} />
      <TutorialCopy step={step} />
    </div>
  );
}

// Shows the how-to-play tutorial one step at a time.
export const Tutorial = observer(function Tutorial({ open, onClose, onFinish, paperVideoSrc }: TutorialProps) {
  const id = useId();
  const store = useMemo(() => new TutorialStore(), []);
  const { step, direction, videoError } = store;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || step < 0) return;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [open, step]);

  return (
    <Modal open={open} onClose={() => closeTutorial(store, onClose)} labelledBy={`${id}-title`} layout="sheet">
      <TutorialHeader id={id} step={step} onClose={() => closeTutorial(store, onClose)} />
      <TutorialBody id={id} step={step} direction={direction} open={open} paperVideoSrc={paperVideoSrc} videoError={videoError} onVideoError={store.markVideoError} headingRef={headingRef} bodyRef={bodyRef} />
      <TutorialControls step={step} isLastStep={store.isLastStep} onPrevious={store.previous} onNext={store.next} onFinish={() => closeTutorial(store, onFinish)} />
    </Modal>
  );
});
