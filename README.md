# Paperplay

Play tic-tac-toe against an agent on real paper. **You draw both X and O.** The camera reads the page, minimax chooses O, and the screen tells you where to draw it. A later reading must see that O on the paper before the game moves on.

The app has a **React + MobX frontend** and a **NestJS backend**. Both run locally; the backend uses the OpenRouter SDK for hosted board reading. No database server or Docker setup is required.

## Demo video

https://github.com/user-attachments/assets/00edf122-2622-4812-9bbf-565d4d89545a

**[vistral-nitai-demo-video-720p.mp4](./vistral-nitai-demo-video-720p.mp4)**: one full game, end to end, with the camera view and game instructions visible (84 s, approximately 8.5 MB, H.264 with audio).

`vistral-nitai-demo-video.MP4` is the larger original recording, retained separately and excluded from git. Use the linked compressed copy to review the submitted game.

## Run a live game in under ten minutes

Have Node.js **24.x with npm**, a computer with a webcam and a modern browser, a pen, white paper, internet access, and an [OpenRouter API key](https://openrouter.ai/settings/keys) with credit ready before starting. Check Node with `node -v`. The project requires Node >=24; 24.x is a suitable choice for its development dependencies. Camera readings are paid model calls; cost depends on the model, images, and usage.

**1. Install.** Clone or unzip the repository, open a terminal in the folder that contains `package.json`, and run:

```sh
npm ci
```

**2. Add your key.** Copy the public template next to `package.json` (do not overwrite an existing `.env.local`):

```sh
cp -n .env.example .env.local
```

Open `.env.local` and fill in `OPENROUTER_API_KEY` with your own key. Leave the other settings at their defaults to start:

```dotenv
OPENROUTER_API_KEY=sk-or-your-key-here
```

`.env.example` contains only public defaults and an empty key. Put secrets and custom settings in `.env.local`, never in the example or a `VITE_*` variable (those variables can reach the browser). Both processes read `.env.local`; restart them after changes.

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

1. Draw a large empty 3×3 grid with a dark pen on clean white paper, or click **Print a board**. Keep the page flat, upright, evenly lit, and fully in frame.
2. Click **Let's Play**, allow the camera, and hold the empty board still until the grid is found.
3. Draw an X in any square. Lift your hand and hold still. Within a few seconds the screen shows your X and names the square for O.
4. Draw that O. The agent waits until it sees the O on paper, then hands the turn back. Repeat until the screen shows a win or a draw.

If a reading stalls, click the checkmark in the camera toolbar (**Done drawing. Check board**) to reanalyze the current view. **Tutorial** in the header replays the drawing walkthrough. Ctrl+C in each terminal stops everything.

**No key or camera?** `npm ci` then `npm start`, and click **See it play**. A generated game runs through the local reader with no model calls. **Load a video** runs the same local reader on a recording.

## Decisions, and why

- **Locating the grid.** A classical detector in a browser Web Worker finds the two horizontal and two vertical lines, computes a homography from the four inner intersections, and tracks the corners frame to frame with a target of 16 checks per second. No model. This grid detection runs locally. Grid search downsamples the frame to at most 360 pixels on its longest side and applies gentle grayscale cleanup. Grid validation, tracking, and hand/darkness checks still use the original camera image. The local reader uses a 288×288 board.
- **Preparing the model image.** The frontend samples a separate 288×288 grayscale crop. Only when that snapshot is needed does it suppress faint background traces, emphasize darker strokes, and encode one cached JPEG. This uses 44% fewer pixels than the previous 384×384 crop and avoids repeated JPEG encoding while waiting. It is not hard black-and-white thresholding; very faint real pencil marks can still be lost.
- **Deciding a new mark appeared.** The frontend samples a good-quality view at most once per 120 ms and compares ink signatures against its last four submitted crops. A changed view must stay stable for at least three samples over the current game's capture window, initially 300 ms and adjustable between games up to 900 ms. Submission checks ignore occupied cells; full model readings still include all nine cells. Normal play is automatic; the manual check button is a fallback.
- **Reading the marks.** A hosted vision model (`google/gemini-3.8-flash` through the OpenRouter SDK, strict JSON schema, temperature 0) reads the stable crop and returns nine cells with confidences. Handwriting variance is where a general vision model earns its cost; the classical shape classifier still handles the video and demo modes so the whole loop stays testable without a key. The model is told it is a reader only and must never infer a mark from turn order.
- **Ambiguity and low confidence.** If the model reports the board as not clear, or any cell is unknown or below 0.85 confidence, the saved board is held and the screen asks for a still, clear view. An illegal board is rejected with the reason. The prompt asks the model to ignore clearly erased or background traces and report ambiguous marks as unknown. These checks reduce mistakes but cannot rule out a confident misread. A suggested O is not committed until a reading sees it.
- **Choosing the move.** Exact minimax over the confirmed board, no model. Tic-tac-toe is solved, the search is instant, and a model in that seat would only add cost and a new failure mode. From an empty board, accurate readings and correctly drawn agent moves allow optimal play. Recognition errors or drawing O elsewhere can still affect the physical game.
- **Turn order and the second hand.** The human is X and moves first, and the human also draws the agent's O. A displayed O stays dashed on screen until it is confirmed on paper. If the O is drawn in a different empty square, the agent accepts the real placement and says so, because ink on the page is the move.
- **Where the expensive inference sits.** On selected crops, with additional calls possible for setup, uncertainty, manual checks, and retries. The server enforces 1.5 s between calls per game, 20 calls per minute, 80 per game, and a cumulative spend cap (`AGENT_BUDGET_USD`, default $1).
- **Latency and cost.** Each request's model latency and reported cost are logged as `agent-request` events in the session log. Automatic capture waits for a stable view over its 300–900 ms window, plus sampling and request pacing. Focused Mac measurements on an empty-board photo and one marked recording frame reduced median snapshot preparation from roughly 1.2 ms to 0.5 ms, excluding JPEG encoding, camera pixel readback, and network/model time. Those cleaned images were read correctly by the hosted model. This is a small diagnostic, not an iPhone, end-to-end latency, or accuracy benchmark.
- **Output.** The instruction is shown over the live camera so the player can see the next mark without guessing.

## Learning between games (optional Section 2)

Two things persist in `.paperplay/agent-state.json` by default and survive a server restart. Automatic capture timing needs no manual corrections:

- **Capture timing.** Each completed camera game records how many automatic readings were unclear. With at least six automatic checks and three accepted added marks, if a quarter or more were unclear, the next game waits up to 100 ms longer for a stable view, up to 900 ms. If none were and the same eligibility checks pass, it waits up to 100 ms less, down to 300 ms. Games with rejected automatic readings, request failures, or manual corrections leave the setting alone. "Smarter" here means fewer unclear readings per accepted move without more false accepts; the counts that drive it are in the session log under `captureFeedback`.
- **Corrected examples.** If you expand **Session** and use **Correct a reading**, the last two corrected crops for your browser profile are sent as labeled examples with every later request, so the model sees your handwriting.

Before the NestJS migration, persistence was checked with a synthetic game and a fresh process. That earlier check is not a new evaluation of this refactor. Real improvement across games has not been demonstrated, and a handful of games cannot separate improvement from variance. Each active game keeps its starting timing; profile, model, prompt version, and timing algorithm separate the timing memories. Image-cleanup versions are not yet tracked separately. The [feedback design](docs/architecture.md#5-feedback-at-scale) explains the update rules and how improvement would be measured.

## Architecture

**[Read the architecture PDF](docs/architecture.pdf)** for the visual overview and full design with rendered diagrams, TL;DRs, and section bookmarks.

[docs/architecture.md](docs/architecture.md) is the editable source covering the built loop and proposed game-agnostic system. [docs/architecture.svg](docs/architecture.svg) is the one-page visual summary.

## Controls and settings

| Control                       | What it does                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------- |
| **Done drawing. Check board** | Reanalyzes the current camera view now.                                         |
| **Detect again**              | Searches for the grid again after the page or camera moved.                     |
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

Both processes bind to `127.0.0.1`. Board crops and corrected examples are sent to OpenRouter. `.paperplay/` and `.env.local` are gitignored. The state file retains games, latest analyzed images, examples, feedback, and cumulative spend. Cleanup removes sessions after two hours without backend access and clears a finished game's latest image after 30 minutes without access. It runs during session access or saving, not on a timer; disk changes wait for the next save. Saved examples, profile timing, and cumulative spend remain. Use **Save session log** before leaving if you need the full game history. Changing the storage directory starts from a different state file. A browser profile is not an authenticated customer account; this is a local setup, not a public multi-user deployment. A phone needs a reachable, secure browser origin and matching network setup.

## If something goes wrong

| Symptom                                                        | Next step                                                                                                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unsupported Node version                                       | Use Node 24.x, reopen the terminal, rerun `npm ci`.                                                                                                                                                     |
| `EADDRINUSE`                                                   | Port 4174 is occupied. Reuse your running agent, or choose another `AGENT_PORT` and restart both processes.                                                                                             |
| Board reader is not configured                                 | `.env.local` is missing or misplaced. Restart `npm run agent` after editing it.                                                                                                                         |
| Model key not accepted or credit limit                         | Check the key and credit in OpenRouter, then restart the agent.                                                                                                                                         |
| Analysis budget reached                                        | `AGENT_BUDGET_USD` is cumulative across games. Raise it deliberately.                                                                                                                                   |
| Camera denied                                                  | Allow the camera for the Local address in browser settings and retry **Let's Play**.                                                                                                                    |
| Grid missing, faint marks missed, or background traces counted | Use a clean sheet and a dark pen, improve the light, move your hand away, and hold still. Then **Detect again** or check. If a false move was already accepted, start a **New game** on an empty board. |
| Please wait before checking again                              | A request is in flight, or a failed request paused automatic retries for 15 s.                                                                                                                          |
| Too many new games                                             | New sessions are capped at 120 per rolling hour per process. Wait for the window to clear; avoid repeated reloads.                                                                                      |

Reloading the page creates a new game; it does not resume the saved session. After an analysis failure, the client tries `/sync`. If it cannot recover a newer reply, it makes the same view eligible for an automatic retry after the backoff.

## Development

### Keeping local configuration private

`npm ci` installs this repository's Git guards automatically, preserving existing pre-commit and pre-push hooks. If you installed with lifecycle scripts disabled, run `npm run prepare` before committing.

- `.gitignore` excludes `.env`, `.env.local`, and other `.env.*` files. Only the root [`.env.example`](.env.example) is public.
- Before a commit, the guard checks the actual staged files, including private environment files added with `git add -f`. The example accepts only the five exact public defaults listed in `scripts/env-guard.mjs`, with an empty API key. Extra settings, comments, or changed values are rejected. Change personal settings in `.env.local`.
- Before a push, the guard checks every outgoing commit, so removing a secret in a later commit does not hide the earlier copy. Error messages do not print configuration values.
- `npm run env:check` checks the staged environment files and your working copy of the example. To intentionally change a public default, review and update both the example and the guard's approved values together.

These guards protect environment files, not secrets pasted into arbitrary source files, images, or documents. Local hooks can also be bypassed. Keep any existing general secret scanner enabled; do not treat this as a guarantee against every possible leak. If a real key reaches GitHub, revoke it with the provider immediately; deleting the latest copy does not remove it from Git history.

```sh
npm run check     # typecheck, lint, format
npm run build     # production build into dist/
npm test          # unit tests (vitest)
npm run replay -- path/to/video.mov   # run the local reader over a recording, report to output/video-replay
```

`npm run build` typechecks frontend and backend, then bundles the frontend into `dist/`; it does not produce a standalone backend bundle. `npm run preview` serves that frontend build, and camera play still requires `npm run agent`.

The replay command additionally needs **ffmpeg and ffprobe** installed and on `PATH`; `npm ci` does not install them. It writes a report under `output/video-replay` and uses the local reader, with no model calls.

The local reader in `npm run replay` expects the board to fill most of the frame, as the in-app **Load a video** mode does. It does not lock onto the demo video above, where the page is small in a wide phone shot; that recording documents the live camera path, which uses the hosted model.
