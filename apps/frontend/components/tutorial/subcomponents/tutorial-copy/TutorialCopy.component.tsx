const tutorialCopyClass = "mt-3.5 text-base leading-[1.6] text-muted";

type TutorialCopyProps = {
  step: number;
};

export function TutorialCopy({ step }: TutorialCopyProps) {
  return (
    <div>
      {step === 0 && (
        <p className={tutorialCopyClass}>
          Draw four dark lines on light paper. Show the whole empty grid and
          hold it still. I’ll find and read it automatically.
        </p>
      )}
      {step === 1 && (
        <p className={tutorialCopyClass}>
          Draw one X and lift your hand. Wait for me to choose a square, then
          draw O there. Keep each new mark visible until it’s confirmed.
        </p>
      )}
    </div>
  );
}
