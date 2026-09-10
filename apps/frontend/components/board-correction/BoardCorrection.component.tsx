import { useState } from "react";
import { observer } from "mobx-react-lite";
import { CELL_IDS, type Board } from "../../types";
import { useGameStore } from "../../stores/game/helpers/game.helpers";
import { Action } from "../shared/action/Action.component";
import { Modal } from "../shared/modal/Modal.component";

const CorrectionForm = observer(function CorrectionForm() {
  const { agent } = useGameStore();
  const [board, setBoard] = useState<Board>(() =>
    agent.reply!.analysis!.cells.map((cell) =>
      cell.mark === "X" || cell.mark === "O" ? cell.mark : null,
    ),
  );
  return (
    <>
      <h2 id="correction-title" className="text-2xl font-[650]">
        Correct the reading
      </h2>
      <p id="correction-copy" className="mt-3 text-sm text-muted">
        Match the squares to this snapshot. Saving updates the game and
        remembers this example for your next games.
      </p>
      {agent.reviewImage && (
        <img
          src={agent.reviewImage}
          alt="The board snapshot being corrected"
          className="mx-auto mt-4 size-36 rounded-lg"
        />
      )}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {board.map((mark, index) => (
          <label
            key={CELL_IDS[index]}
            className="grid gap-1 text-xs text-muted"
          >
            {CELL_IDS[index]}
            <select
              aria-label={`Mark in ${CELL_IDS[index]}`}
              className="min-h-11 rounded-lg border border-line bg-paper px-2 text-base text-ink"
              value={mark ?? "empty"}
              onChange={(event) =>
                setBoard(
                  board.map((value, i) =>
                    i === index
                      ? event.target.value === "empty"
                        ? null
                        : (event.target.value as "X" | "O")
                      : value,
                  ),
                )
              }
            >
              <option value="empty">Empty</option>
              <option value="X">X</option>
              <option value="O">O</option>
            </select>
          </label>
        ))}
      </div>
      {agent.message && (
        <p className="mt-3 text-sm text-attention" role="status">
          {agent.message}
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <Action
          tone="quiet"
          disabled={agent.busy}
          onClick={agent.closeCorrection}
        >
          Cancel
        </Action>
        <Action disabled={agent.busy} onClick={() => void agent.correct(board)}>
          {agent.busy ? "Saving…" : "Save correction"}
        </Action>
      </div>
    </>
  );
});
export const BoardCorrection = observer(function BoardCorrection() {
  const { agent } = useGameStore();
  return (
    <Modal
      open={agent.correctionOpen}
      onClose={agent.closeCorrection}
      labelledBy="correction-title"
      describedBy="correction-copy"
    >
      {agent.correctionOpen && <CorrectionForm />}
    </Modal>
  );
});
