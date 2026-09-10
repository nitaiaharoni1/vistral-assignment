import { Action } from "../shared/action/Action.component";
import { Modal } from "../shared/modal/Modal.component";

type ResetDialogProps = {
  open: boolean;
  onKeepPlaying: () => void;
  onRestart: () => void;
};

// Asks before clearing the current game.
export function ResetDialog({ open, onKeepPlaying, onRestart }: ResetDialogProps) {
  return (
    <Modal open={open} onClose={onKeepPlaying} labelledBy="reset-title" describedBy="reset-copy" closeOnBackdrop>
      <h2 className="text-[25px] font-[650]" id="reset-title">
        Start a new game?
      </h2>
      <p className="mt-3.5 text-base text-muted" id="reset-copy">
        Are you sure you want to finish this game and start a new one? The current board and move history will be cleared.
      </p>
      <div className="mt-[26px] flex flex-wrap justify-end gap-3">
        <Action tone="quiet" autoFocus onClick={onKeepPlaying}>
          Keep playing
        </Action>
        <Action onClick={onRestart}>Start new game</Action>
      </div>
    </Modal>
  );
}
