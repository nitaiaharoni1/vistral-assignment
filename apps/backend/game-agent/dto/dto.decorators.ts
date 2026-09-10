import { ValidateBy } from "class-validator";
import type { ValidationOptions } from "class-validator";
import { isUuid } from "../../../../shared/game-agent-protocol/game-agent-protocol";
import { isBoard } from "../guards/body-guards";
import { isJpegImage } from "../guards/body-guards";

// Rejects a field that is not a lowercase UUID.
export function IsGameAgentUuid(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: "isGameAgentUuid",
      validator: {
        validate: isUuid,
        defaultMessage: () => "Invalid session.",
      },
    },
    options,
  );
}

// Rejects a field that is not a JPEG board snapshot.
export function IsJpegImage(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: "isJpegImage",
      validator: {
        validate: isJpegImage,
        defaultMessage: () => "Send a JPEG snapshot of the board.",
      },
    },
    options,
  );
}

// Rejects a field that is not a nine-square paper board.
export function IsPaperBoard(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: "isPaperBoard",
      validator: {
        validate: isBoard,
        defaultMessage: () => "Choose X, O, or empty for every square.",
      },
    },
    options,
  );
}
