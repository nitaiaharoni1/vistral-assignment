import { useState } from "react";
import { observer } from "mobx-react-lite";
import { CELL_IDS } from "../../types";
import type { Board } from "../../types";
import { useGameStore } from "../../stores/game/helpers/game.helpers";
import { Action } from "../shared/action/Action.component";
import { Modal } from "../shared/modal/Modal.component";

// Lets the person relabel each square on the snapshot.
function CorrectionCells({ board, onChange }: { board: Board; onChange: (board: Board) => void }) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-3">
      {board.map((mark, index) => (
        <label key={CELL_IDS[index]} className="grid gap-1 text-xs text-muted">
          {CELL_IDS[index]}
          <select
            aria-label={`Mark in ${CELL_IDS[index]}`}
            className="min-h-11 cursor-pointer rounded-lg border border-line bg-paper px-2 text-base text-ink hover:border-[#b4bdd0]"
            value={mark ?? "empty"}
            onChange={(event) => onChange(board.map((value, i) => (i === index ? (event.target.value === "empty" ? null : (event.target.value as "X" | "O")) : value)))}
          >
            <option value="empty">Empty</option>
            <option value="X">X</option>
            <option value="O">O</option>
          </select>
        </label>
      ))}
    </div>
  );
}

// Shows cancel and save for a board correction.
function CorrectionActions({ busy, onCancel, onSave }: { busy: boolean; onCancel: () => void; onSave: () => void }) {
  return (
    <div className="mt-5 flex flex-wrap justify-end gap-3">
      <Action tone="quiet" disabled={busy} onClick={onCancel}>
        Cancel
      </Action>
      <Action disabled={busy} onClick={onSave}>
        {busy ? "Saving…" : "Save correction"}
      </Action>
    </div>
  );
}

// Edits the snapshot marks and saves the correction.
const CorrectionForm = observer(function CorrectionForm() {
  const { gameAgent } = useGameStore();
  const [board, setBoard] = useState<Board>(() => gameAgent.reply!.analysis!.cells.map((cell) => (cell.mark === "X" || cell.mark === "O" ? cell.mark : null)));
  return (
    <>
      <h2 id="correction-title" className="text-2xl font-[650]">
        Correct the reading
      </h2>
      <p id="correction-copy" className="mt-3 text-sm text-muted">
        Match the squares to this snapshot. Saving updates the game and remembers this example for your next games.
      </p>
      {gameAgent.reviewImage && <img src={gameAgent.reviewImage} alt="The board snapshot being corrected" className="mx-auto mt-4 size-36 rounded-lg" />}
      <CorrectionCells board={board} onChange={setBoard} />
      {gameAgent.message && (
        <p className="mt-3 text-sm text-attention" role="status">
          {gameAgent.message}
        </p>
      )}
      <CorrectionActions busy={gameAgent.busy} onCancel={gameAgent.closeCorrection} onSave={() => void gameAgent.correct(board)} />
    </>
  );
});
// Opens the correction dialog when the agent asks for it.
export const BoardCorrection = observer(function BoardCorrection() {
  const { gameAgent } = useGameStore();
  return (
    <Modal open={gameAgent.correctionOpen} onClose={gameAgent.closeCorrection} labelledBy="correction-title" describedBy="correction-copy">
      {gameAgent.correctionOpen && <CorrectionForm />}
    </Modal>
  );
});
