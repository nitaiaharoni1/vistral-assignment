# Paperplay

Play tic-tac-toe against an agent on real paper. You draw X. The camera reads the page, minimax picks O, the screen tells you where to draw it, and the next reading confirms the O is actually on the paper before the game moves on.

## Demo video

**[vistral-nitai-demo-video-720p.mp4](./vistral-nitai-demo-video-720p.mp4)**: one full game, end to end, with the human and the page in frame (84 s, phone recording, 9 MB H.264, previews in a browser).

`vistral-nitai-demo-video.MP4` is the original 160 MB HEVC recording. It ships in the zip submission and is not committed to git because it exceeds GitHub's file size limit.

## Run a live game in under ten minutes

You need Node.js 24 or newer, a computer with a webcam, a pen, white paper, and an [OpenRouter API key](https://openrouter.ai/settings/keys) with a little credit. Each board reading is one paid vision-model call, well under a cent.

**1. Install.** Clone or unzip the repository, open a terminal in the folder that contains `package.json`, and run:

```sh
npm ci
```

**2. Add your key.** Create a file named `.env.local` next to `package.json`:

```dotenv
OPENROUTER_API_KEY=sk-or-your-key-here
```

**3. Start the two processes.** In one terminal:

```sh
npm run agent
```

Wait for `Paperplay agent listening on 127.0.0.1:4174`. In a second terminal, same folder:

```sh
npm start
```

Open the Local address it prints, normally http://127.0.0.1:5173.

**4. Play.**

1. Draw a large empty 3×3 grid on white paper, or click **Print a board**. Keep the page flat, upright, evenly lit, and fully in frame.
2. Click **Let's Play**, allow the camera, and hold the empty board still until the grid is found.
3. Draw an X in any square. Lift your hand and hold still. Within a few seconds the screen shows your X and names the square for O.
4. Draw that O. The agent waits until it sees the O on paper, then hands the turn back. Repeat until the screen shows a win or a draw.

If a reading stalls, click the checkmark in the camera toolbar (**Done drawing. Check board**) to reanalyze the current view. **Tutorial** in the header replays the drawing walkthrough. Ctrl+C in each terminal stops everything.

**No key or camera?** `npm ci` then `npm start`, and click **See it play**. A generated game runs through the local reader with no model calls. **Load a video** runs the same local reader on a recording.

## Decisions, and why

- **Locating the grid.** A classical detector in a browser Web Worker finds the two horizontal and two vertical lines, computes a homography from the four inner intersections, and tracks the corners frame to frame at about 16 fps. No model. It is cheap, private, and gives every later step a rectified 384×384 crop with known cell positions.
- **Deciding a new mark appeared.** Per-cell ink density is measured in every unoccupied cell on every sampled frame. When the signature changes and then holds still for three samples over at least 300 ms, one crop is submitted. Occupied cells are ignored so a hand resting near an old mark does not trigger a call. The human never presses anything; the manual check button exists only as a fallback.
- **Reading the marks.** A hosted vision model (`google/gemini-3.8-flash` through OpenRouter, strict JSON schema, temperature 0) reads the stable crop and returns nine cells with confidences. Handwriting variance is where a general vision model earns its cost; the classical shape classifier still handles the video and demo modes so the whole loop stays testable without a key. The model is told it is a reader only and must never infer a mark from turn order.
- **Ambiguity and low confidence.** If the model reports the board as not clear, or any cell is unknown or below 0.85 confidence, the saved board is held and the screen asks for a still, clear view. An illegal board is rejected with the reason. Nothing is guessed, and a suggested O is never written into the state until a reading sees it.
- **Choosing the move.** Exact minimax over the confirmed board, no model. Tic-tac-toe is solved, the search is instant, and a model in that seat would only add cost and a new failure mode. The agent never loses.
- **Turn order and the second hand.** The human is X and moves first, and the human also draws the agent's O. A displayed O stays dashed on screen until it is confirmed on paper. If the O is drawn in a different empty square, the agent accepts the real placement and says so, because ink on the page is the move.
- **Where the expensive inference sits.** Only on stable, changed crops: roughly one model call per move. The server enforces 1.5 s between calls per game, 20 calls per minute, 80 per game, and a cumulative spend cap (`AGENT_BUDGET_USD`, default $1).
- **Latency and cost.** Each request's model latency and reported cost are logged as `agent-request` events in the session log. Frame sampling adds up to a few hundred milliseconds before the call. Speed and price were not benchmarked beyond the demo game.
- **Output.** Both. The instruction is shown above the live camera and spoken through the browser's built-in speech synthesis, because the player is looking at the paper, not the screen. The **Voice** button in the header turns speech off and remembers the choice.

## Learning between games (optional Section 2)

Two things persist in `.paperplay/agent-state.json` and survive a server restart:

- **Capture timing.** Each completed camera game records how many automatic readings were unclear. If a quarter or more were unclear, the next game waits 100 ms longer for a stable view, up to 900 ms. If none were, it waits 100 ms less, down to 300 ms. Games with rejected readings, request failures, or manual corrections leave the setting alone. "Smarter" here means fewer unclear readings per accepted move without more false accepts; the counts that drive it are in the session log under `captureFeedback`.
- **Corrected examples.** If you use **Correct a reading**, the last two corrected crops for your browser profile are sent as labeled examples with every later request, so the model sees your handwriting.

Persistence was verified with a synthetic game and a fresh process. Real improvement across games has not been demonstrated, and a handful of games cannot separate improvement from variance. The architecture doc says how that would be measured.

## Architecture

[docs/architecture.md](docs/architecture.md) covers the built loop and the proposed game-agnostic system with Mermaid diagrams. [docs/architecture.svg](docs/architecture.svg) is a one-page visual summary.

## Controls and settings

| Control                       | What it does                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------- |
| **Done drawing. Check board** | Reanalyzes the current camera view now.                                         |
| **Detect again**              | Searches for the grid again after the page or camera moved.                     |
| **Pause**                     | Stops new checks. Hiding the tab also pauses observation.                       |
| **New game**                  | Starts a fresh session. Use an empty board.                                     |
| **Save session log**          | Downloads game state, events, recent worker observations, and feedback metrics. |
| **Correct a reading**         | Manually label the last submitted snapshot. Logged separately from camera data. |

Optional settings in `.env.local` (restart the agent after changing them): `OPENROUTER_MODEL` (default `google/gemini-3.8-flash`, must accept images and strict JSON output), `AGENT_BUDGET_USD` (default `1`, cumulative), `AGENT_PORT` (default `4174`, also update the proxy in `vite.config.ts`).

Both processes bind to `127.0.0.1`. Board crops and corrected examples are sent to OpenRouter. `.paperplay/` and `.env.local` are gitignored.

## If something goes wrong

| Symptom                                | Next step                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| Unsupported Node version               | Use Node 24 or newer, reopen the terminal, rerun `npm ci`.                                |
| `EADDRINUSE`                           | Another agent is already on port 4174. Stop it or set `AGENT_PORT`.                       |
| Board reader is not configured         | `.env.local` is missing or misplaced. Restart `npm run agent` after editing it.           |
| Model key not accepted or credit limit | Check the key and credit in OpenRouter, then restart the agent.                           |
| Analysis budget reached                | `AGENT_BUDGET_USD` is cumulative across games. Raise it deliberately.                     |
| Camera denied                          | Allow the camera for the Local address in browser settings and retry **Let's Play**.      |
| Grid missing or reading unclear        | Better light, whole page in frame, hand away, hold still. Then **Detect again** or check. |
| Please wait before checking again      | A request is in flight, or a failed request paused automatic retries for 15 s.            |

## Development

```sh
npm run check     # typecheck, lint, format
npm run build     # production build into dist/
npm test          # unit tests (vitest)
npm run replay -- path/to/video.mov   # run the local reader over a recording, report to output/video-replay
```

The local reader in `npm run replay` expects the board to fill most of the frame, as the in-app **Load a video** mode does. It does not lock onto the demo video above, where the page is small in a wide phone shot; that recording documents the live camera path, which uses the hosted model.
