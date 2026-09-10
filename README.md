# Paperplay

Play tic-tac-toe against an agent on real paper. **You draw both X and O.** The camera reads the page, minimax chooses O, and the screen and optional voice tell you where to draw it. A later reading must see that O on the paper before the game moves on.

The app has a **React + MobX frontend** and a **NestJS backend**. Both run locally; the backend uses the OpenRouter SDK for hosted board reading. No database server or Docker setup is required.

## Demo video

**[vistral-nitai-demo-video-720p.mp4](./vistral-nitai-demo-video-720p.mp4)**: one full game, end to end, with the human and the page in frame (84 s, approximately 8.5 MB, H.264 with audio).

`vistral-nitai-demo-video.MP4` is the larger original recording, retained separately and excluded from git. Use the linked compressed copy to review the submitted game.

## Run a live game in under ten minutes

Have Node.js **24.x with npm**, a computer with a webcam and a modern browser, a pen, white paper, internet access, and an [OpenRouter API key](https://openrouter.ai/settings/keys) with credit ready before starting. Check Node with `node -v`. The project requires Node >=24; 24.x is a suitable choice for its development dependencies. Camera readings are paid model calls; cost depends on the model, images, and usage.

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

Open the **Local** address it prints, normally [http://127.0.0.1:5173](http://127.0.0.1:5173). If the port is busy, use the different address Vite prints. Keep both terminals running.

**Setup check:** open `/api/game-agent/status` at that same address. `"configured": true` means the NestJS backend loaded a key, not that the provider has accepted it yet. The first board reading checks provider access.

**4. Play.**

1. Draw a large empty 3×3 grid on white paper, or click **Print a board**. Keep the page flat, upright, evenly lit, and fully in frame.
2. Click **Let's Play**, allow the camera, and hold the empty board still until the grid is found.
3. Draw an X in any square. Lift your hand and hold still. Within a few seconds the screen shows your X and names the square for O.
4. Draw that O. The agent waits until it sees the O on paper, then hands the turn back. Repeat until the screen shows a win or a draw.

If a reading stalls, click the checkmark in the camera toolbar (**Done drawing. Check board**) to reanalyze the current view. **Tutorial** in the header replays the drawing walkthrough. Ctrl+C in each terminal stops everything.

**No key or camera?** `npm ci` then `npm start`, and click **See it play**. A generated game runs through the local reader with no model calls. **Load a video** runs the same local reader on a recording.

## Decisions, and why

- **Locating the grid.** A classical detector in a browser Web Worker finds the two horizontal and two vertical lines, computes a homography from the four inner intersections, and tracks the corners frame to frame at about 16 fps. No model. This grid detection runs locally. The local reader uses a 288×288 board; the frontend separately creates a 384×384 JPEG crop for the hosted reader.
- **Deciding a new mark appeared.** The frontend samples a good-quality view at most once per 120 ms and compares ink signatures against its last four submitted crops. A changed view must stay stable for at least three samples over the current game's capture window, initially 300 ms and adjustable between games up to 900 ms. Submission checks ignore occupied cells; full model readings still include all nine cells. Normal play is automatic; the manual check button is a fallback.
- **Reading the marks.** A hosted vision model (`google/gemini-3.8-flash` through the OpenRouter SDK, strict JSON schema, temperature 0) reads the stable crop and returns nine cells with confidences. Handwriting variance is where a general vision model earns its cost; the classical shape classifier still handles the video and demo modes so the whole loop stays testable without a key. The model is told it is a reader only and must never infer a mark from turn order.
- **Ambiguity and low confidence.** If the model reports the board as not clear, or any cell is unknown or below 0.85 confidence, the saved board is held and the screen asks for a still, clear view. An illegal board is rejected with the reason. Nothing is guessed, and a suggested O is never written into the state until a reading sees it.
- **Choosing the move.** Exact minimax over the confirmed board, no model. Tic-tac-toe is solved, the search is instant, and a model in that seat would only add cost and a new failure mode. From an empty board, accurate readings and correctly drawn agent moves allow optimal play. Recognition errors or drawing O elsewhere can still affect the physical game.
- **Turn order and the second hand.** The human is X and moves first, and the human also draws the agent's O. A displayed O stays dashed on screen until it is confirmed on paper. If the O is drawn in a different empty square, the agent accepts the real placement and says so, because ink on the page is the move.
- **Where the expensive inference sits.** On selected crops, with additional calls possible for setup, uncertainty, manual checks, and retries. The server enforces 1.5 s between calls per game, 20 calls per minute, 80 per game, and a cumulative spend cap (`AGENT_BUDGET_USD`, default $1).
- **Latency and cost.** Each request's model latency and reported cost are logged as `agent-request` events in the session log. Frame sampling adds up to a few hundred milliseconds before the call. Speed and price were not benchmarked beyond the demo game.
- **Output.** The instruction is shown above the live camera and spoken through the browser's built-in speech synthesis when available, so the player can keep looking at the paper. The **Voice** button in the header turns speech off and remembers the choice.

## Learning between games (optional Section 2)

Two things persist in `.paperplay/agent-state.json` by default and survive a server restart. Automatic capture timing needs no manual corrections:

- **Capture timing.** Each completed camera game records how many automatic readings were unclear. With at least six automatic checks and three accepted added marks, if a quarter or more were unclear, the next game waits up to 100 ms longer for a stable view, up to 900 ms. If none were and the same eligibility checks pass, it waits up to 100 ms less, down to 300 ms. Games with rejected readings, request failures, or manual corrections leave the setting alone. "Smarter" here means fewer unclear readings per accepted move without more false accepts; the counts that drive it are in the session log under `captureFeedback`.
- **Corrected examples.** If you use **Correct a reading**, the last two corrected crops for your browser profile are sent as labeled examples with every later request, so the model sees your handwriting.

Before the NestJS migration, persistence was checked with a synthetic game and a fresh process. That earlier check is not a new evaluation of this refactor. Real improvement across games has not been demonstrated, and a handful of games cannot separate improvement from variance. Each active game keeps its starting timing; profile, model, prompt version, and algorithm separate the timing memories. The [feedback design](docs/architecture.md#5-feedback-at-scale) explains the update rules and how improvement would be measured.

## Architecture

[docs/architecture.md](docs/architecture.md) covers the built loop and the proposed game-agnostic system with Mermaid diagrams. [docs/architecture.svg](docs/architecture.svg) is a one-page visual summary.

## Controls and settings

| Control                       | What it does                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------- |
| **Done drawing. Check board** | Reanalyzes the current camera view now.                                         |
| **Detect again**              | Searches for the grid again after the page or camera moved.                     |
| **Voice**                     | Toggles browser speech and remembers the preference.                            |
| **Pause**                     | Stops new checks. Hiding the tab also pauses observation.                       |
| **New game**                  | Starts a fresh session. Use an empty board.                                     |
| **Save session log**          | Downloads game state, events, recent worker observations, and feedback metrics. |
| **Correct a reading**         | Manually label the last submitted snapshot. Logged separately from camera data. |

Optional settings in `.env.local` (restart the agent after changing them):

| Setting            | Default                   | Purpose                                                                                                                                             |
| ------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_MODEL` | `google/gemini-3.8-flash` | Reader model; must accept images and the required strict JSON response format.                                                                      |
| `AGENT_BUDGET_USD` | `1`                       | Cumulative local spend cap across saved games, not per game or a provider billing guarantee.                                                        |
| `AGENT_PORT`       | `4174`                    | NestJS port. Vite reads this setting from the same environment file; restart `npm start` too. No proxy code edit is needed.                         |
| `PAPERPLAY_DIR`    | `.paperplay`              | Directory for `agent-state.json`, relative to the working directory unless absolute. Keep custom locations private and outside served source files. |

The backend starts at [`apps/backend/main.ts`](apps/backend/main.ts), with `AppModule`, `CommonModule`, and `GameAgentModule`. Its controller exposes `/api/game-agent`; shared request/reply types live in [`shared/game-agent-protocol`](shared/game-agent-protocol). NestJS validates request bodies and injects separate services for orchestration, board rules/feedback, model access, and storage. These are services inside one process, not separately deployed servers.

Both processes bind to `127.0.0.1`. Board crops and corrected examples are sent to OpenRouter. `.paperplay/` and `.env.local` are gitignored. The state file also retains games, latest analyzed images, examples, feedback, and cumulative spend. Changing the storage directory starts from a different state file. A browser profile is not an authenticated customer account; this is a local setup, not a public multi-user deployment. A phone needs a reachable, secure browser origin and matching network setup.

## If something goes wrong

| Symptom                                | Next step                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Unsupported Node version               | Use Node 24.x, reopen the terminal, rerun `npm ci`.                                                                |
| `EADDRINUSE`                           | Port 4174 is occupied. Reuse your running agent, or choose another `AGENT_PORT` and restart both processes.        |
| Board reader is not configured         | `.env.local` is missing or misplaced. Restart `npm run agent` after editing it.                                    |
| Model key not accepted or credit limit | Check the key and credit in OpenRouter, then restart the agent.                                                    |
| Analysis budget reached                | `AGENT_BUDGET_USD` is cumulative across games. Raise it deliberately.                                              |
| Camera denied                          | Allow the camera for the Local address in browser settings and retry **Let's Play**.                               |
| Grid missing or reading unclear        | Better light, whole page in frame, hand away, hold still. Then **Detect again** or check.                          |
| Please wait before checking again      | A request is in flight, or a failed request paused automatic retries for 15 s.                                     |
| Too many new games                     | New sessions are capped at 120 per rolling hour per process. Wait for the window to clear; avoid repeated reloads. |

Reloading the page creates a new game; it does not resume the saved session. After an analysis failure, the client tries `/sync`. If it cannot recover a newer reply, it makes the same view eligible for an automatic retry after the backoff.

## Development

```sh
npm run check     # typecheck, lint, format
npm run build     # production build into dist/
npm test          # unit tests (vitest)
npm run replay -- path/to/video.mov   # run the local reader over a recording, report to output/video-replay
```

`npm run build` typechecks frontend and backend, then bundles the frontend into `dist/`; it does not produce a standalone backend bundle. `npm run preview` serves that frontend build, and camera play still requires `npm run agent`.

The replay command additionally needs **ffmpeg and ffprobe** installed and on `PATH`; `npm ci` does not install them. It writes a report under `output/video-replay` and uses the local reader, with no model calls.

The local reader in `npm run replay` expects the board to fill most of the frame, as the in-app **Load a video** mode does. It does not lock onto the demo video above, where the page is small in a wide phone shot; that recording documents the live camera path, which uses the hosted model.
