import { useState } from "react";

type TutorialWatchProps = {
  step: number;
  open: boolean;
  paperVideoSrc?: string;
  videoError: boolean;
  onError: () => void;
};

export function TutorialWatch({
  step,
  open,
  paperVideoSrc,
  videoError,
  onError,
}: TutorialWatchProps) {
  const [showControls, setShowControls] = useState(false);
  if (step !== 2 || !open) return null;
  return (
    <div className="mt-5">
      {!videoError ? (
        <video
          className="block aspect-[4/3] h-auto w-full rounded-xl bg-[#e9e5dd] object-contain"
          controls={showControls}
          tabIndex={0}
          onClick={() => setShowControls(true)}
          onFocus={() => setShowControls(true)}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          src={paperVideoSrc}
          aria-label="Full paper game with recorded Paperplay detection overlay"
          onError={onError}
        />
      ) : (
        <p role="status">The video couldn’t load. You can start playing now.</p>
      )}
      <p className="mt-3 text-xs leading-normal text-muted">
        AI-generated footage. Recorded Paperplay readings show the grid, marks
        and turns.
      </p>
    </div>
  );
}
