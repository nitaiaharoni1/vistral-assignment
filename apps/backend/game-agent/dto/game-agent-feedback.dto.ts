import type { FeedbackRequest } from "../../../../shared/game-agent-protocol/game-agent-protocol";
import type { Board } from "../../../../shared/types";
import { IsPaperBoard } from "./dto.decorators";
import { GameAgentSessionDto } from "./game-agent-session.dto";

export class GameAgentFeedbackDto extends GameAgentSessionDto implements FeedbackRequest {
  @IsPaperBoard()
  board!: Board;
}
