import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "rolldown";

const usage =
  "Usage: node tests/video-replay.mjs [--cases tests/evaluation-cases.json] [--fps N (defaults to app rate)] [--expected .OXXXOX.O] [--output-dir output/video-replay] video.mov [another.mov]";

function options(args) {
  const result = {
    fps: null,
    expected: null,
    outputDir: resolve("output/video-replay"),
    files: [],
    cases: null,
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help") return null;
    if (arg === "--") {
      result.files.push(...args.slice(index + 1).map((file) => resolve(file)));
      break;
    }
    if (["--fps", "--expected", "--output-dir", "--cases"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--"))
        throw new Error(`Missing value for ${arg}.`);
      if (arg === "--fps") result.fps = Number(value);
      if (arg === "--output-dir") result.outputDir = resolve(value);
      if (arg === "--cases") result.cases = resolve(value);
      if (arg === "--expected") {
        if (!/^[XO._]{9}$/i.test(value))
          throw new Error("Expected board needs nine X, O, or . characters.");
        result.expected = [...value.toUpperCase()].map((mark) =>
          /[XO]/.test(mark) ? mark : null,
        );
      }
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option ${arg}.`);
    } else result.files.push(resolve(arg));
  }
  if (!result.files.length) throw new Error("Provide at least one video file.");
  if (
    result.fps !== null &&
    (!Number.isFinite(result.fps) || result.fps < 1 || result.fps > 60)
  )
    throw new Error("FPS must be between 1 and 60.");
  return result;
}

async function loadCases(settings) {
  if (!settings.cases) return null;
  const contents = await readFile(settings.cases, "utf8");
  const data = JSON.parse(contents);
  if (
    data.schemaVersion !== 1 ||
    !Array.isArray(data.cases) ||
    !data.cases.length ||
    !Array.isArray(data.moveCompletionWindows)
  )
    throw new Error(
      "Cases require schemaVersion 1, cases, and moveCompletionWindows arrays.",
    );
  const ids = new Set();
  const normalizeVideo = (video) => {
    if (typeof video !== "string" || !video.trim())
      throw new Error("Each annotated case must identify its video path.");
    return resolve(dirname(settings.cases), video);
  };
  const cases = data.cases.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      !item.id ||
      ids.has(item.id) ||
      !Number.isFinite(item.timeSeconds) ||
      item.timeSeconds < 0 ||
      typeof item.board !== "string" ||
      !/^[XO.]{9}$/.test(item.board) ||
      !Array.isArray(item.scoreableCells) ||
      new Set(item.scoreableCells).size !== item.scoreableCells.length ||
      item.scoreableCells.some(
        (cell) => !Number.isInteger(cell) || cell < 0 || cell > 8,
      ) ||
      (item.boardPresent === false && item.scoreableCells.length > 0)
    )
      throw new Error(
        `Invalid or duplicate annotated case: ${item?.id ?? "unnamed"}.`,
      );
    ids.add(item.id);
    return { ...item, video: normalizeVideo(item.video) };
  });
  const moves = data.moveCompletionWindows.map((move) => {
    if (
      !move ||
      typeof move !== "object" ||
      !Number.isInteger(move.cell) ||
      move.cell < 0 ||
      move.cell > 8 ||
      !["X", "O"].includes(move.mark) ||
      !Number.isFinite(move.lastIncompleteSeconds) ||
      move.lastIncompleteSeconds < 0 ||
      !Number.isFinite(move.firstCompleteSeconds) ||
      move.firstCompleteSeconds <= move.lastIncompleteSeconds
    )
      throw new Error("Invalid annotated move completion window.");
    return {
      ...move,
      ...(move.video ? { video: normalizeVideo(move.video) } : {}),
    };
  });
  for (const file of settings.files) {
    if (!cases.some((item) => item.video === file))
      throw new Error(
        `No annotated cases match the exact video path: ${file}.`,
      );
    const applicable = moves.filter(
      (move) => !move.video || move.video === file,
    );
    if (new Set(applicable.map((move) => move.cell)).size !== applicable.length)
      throw new Error(`Repeated annotated move cells for ${file}.`);
  }
  return {
    path: settings.cases,
    sha256: createHash("sha256").update(contents).digest("hex"),
    gameCount: data.gameCount ?? null,
    labelSource: data.labelSource ?? null,
    limitations: data.limitations ?? [],
    cases,
    moves,
  };
}

async function compile(directory) {
  const frontend = fileURLToPath(new URL("../apps/frontend/", import.meta.url));
  const shared = fileURLToPath(new URL("../shared/", import.meta.url));
  const entry = join(directory, "entry.ts");
  const output = join(directory, "detector.mjs");
  await writeFile(
    entry,
    [
      `export { detectBoard } from ${JSON.stringify(join(frontend, "stores/camera-feed/workers/board-reader/grid-detection.ts"))};`,
      `export { createCalibration } from ${JSON.stringify(join(frontend, "stores/camera-feed/workers/board-reader/calibration.ts"))};`,
      `export { analyzeFrame } from ${JSON.stringify(join(frontend, "stores/camera-feed/workers/board-reader/frame-analysis.ts"))};`,
      `export * from ${JSON.stringify(join(shared, "session.helpers.ts"))};`,
      `export * from ${JSON.stringify(join(shared, "accept-session.ts"))};`,
      `export * from ${JSON.stringify(join(frontend, "stores/session/helpers/observation.helpers.ts"))};`,
      `export * from ${JSON.stringify(join(shared, "board.helpers.ts"))};`,
      `export { ANALYSIS_FPS } from ${JSON.stringify(join(frontend, "stores/camera-feed/camera-feed.store.ts"))};`,
    ].join("\n"),
  );
  await build({
    input: entry,
    platform: "node",
    output: { file: output, format: "esm" },
  });
  const hash = createHash("sha256")
    .update(await readFile(output))
    .digest("hex");
  return { api: await import(pathToFileURL(output).href), hash };
}

function dimensions(file) {
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,sample_aspect_ratio:stream_tags=rotate:stream_side_data=rotation",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 },
    ),
  );
  const stream = probe.streams?.[0];
  if (!(stream?.width > 0 && stream?.height > 0))
    throw new Error("No readable video stream.");
  const rotation = Number(
    stream.side_data_list?.find((data) => data.rotation !== undefined)
      ?.rotation ??
      stream.tags?.rotate ??
      0,
  );
  if (
    !Number.isFinite(rotation) ||
    Math.abs(rotation / 90 - Math.round(rotation / 90)) > 0.001
  )
    throw new Error(
      "Only right-angle video rotation is supported by this verifier.",
    );
  const [numerator, denominator] = (stream.sample_aspect_ratio ?? "1:1")
    .split(":")
    .map(Number);
  const pixelAspect =
    numerator > 0 && denominator > 0 ? numerator / denominator : 1;
  const rotated = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  const aspect = (stream.width * pixelAspect) / stream.height;
  const width = 960;
  const height = Math.round(width / (rotated ? 1 / aspect : aspect));
  if (height < 160 || height > 8192)
    throw new Error("Video aspect ratio is outside the supported bounds.");
  return {
    width,
    height,
    rotation,
    sourceWidth: stream.width,
    sourceHeight: stream.height,
    pixelAspect,
  };
}

const boardKey = (board) => board.map((mark) => mark ?? ".").join("");

function evaluateCases(report, annotation) {
  if (!annotation) return null;
  const cases = annotation.cases.filter((item) => item.video === report.file);
  const total = { cells: 0, correct: 0, wrong: 0, abstention: 0 };
  const byCondition = {};
  const scored = cases.map((item) => {
    let sample = null;
    for (const candidate of report.samples) {
      if (
        !sample ||
        Math.abs(candidate.time - item.timeSeconds) <
          Math.abs(sample.time - item.timeSeconds)
      )
        sample = candidate;
    }
    const matched =
      sample !== null &&
      Math.abs(sample.time - item.timeSeconds) <= 0.5 / report.fps + 1e-6;
    const count = {
      cells: item.scoreableCells.length,
      correct: 0,
      wrong: 0,
      abstention: 0,
    };
    const cells = item.scoreableCells.map((cell) => {
      const reading = matched ? sample.observation?.cells[cell] : null;
      const readable =
        reading &&
        reading.readable !== false &&
        Number.isFinite(reading.confidence) &&
        reading.confidence >= 0.78 &&
        reading.confidence <= 1 &&
        (reading.mark === "X" || reading.mark === "O" || reading.mark === null);
      const actual = readable ? (reading.mark ?? ".") : "?";
      const expected = item.board[cell];
      const outcome = !readable
        ? "abstention"
        : actual === expected
          ? "correct"
          : "wrong";
      count[outcome]++;
      return {
        cell,
        expected,
        actual,
        outcome,
        confidence: reading?.confidence ?? null,
      };
    });
    const condition = item.condition ?? "unspecified";
    byCondition[condition] ??= {
      cells: 0,
      correct: 0,
      wrong: 0,
      abstention: 0,
    };
    for (const key of Object.keys(total)) {
      total[key] += count[key];
      byCondition[condition][key] += count[key];
    }
    return {
      id: item.id,
      condition,
      annotatedTimeSeconds: item.timeSeconds,
      sampledTimeSeconds: matched ? sample.time : null,
      sampleOffsetSeconds: matched ? sample.time - item.timeSeconds : null,
      quality: matched ? (sample.observation?.quality ?? "detecting") : null,
      matched,
      counts: count,
      cells,
    };
  });
  const events = report.session?.events ?? [];
  const individual = events.filter((event) =>
    ["observed-move", "human-move", "ai-confirmed"].includes(event.kind),
  );
  const batches = events
    .filter((event) => event.kind === "board-sync")
    .map((event) => {
      const before = report.samples.findLast(
        (sample) => sample.time * 1000 < event.at - 1e-6 && sample.board,
      )?.board;
      const additions = (event.board ?? []).flatMap((mark, cell) =>
        mark !== null && before?.[cell] == null ? [{ cell, mark }] : [],
      );
      return {
        eventId: event.id,
        timeSeconds: event.at / 1000,
        additions,
        intermediateMoveOrder: "unknown",
      };
    });
  const moves = annotation.moves
    .filter((move) => !move.video || move.video === report.file)
    .map((move) => {
      const first = report.samples.find(
        (sample) => sample.board?.[move.cell] != null,
      );
      const event = first
        ? individual.find(
            (entry) =>
              entry.cell === move.cell &&
              Math.abs(entry.at - first.time * 1000) < 1e-6,
          )
        : null;
      const batch = first
        ? batches.find(
            (entry) =>
              Math.abs(entry.timeSeconds - first.time) < 1e-6 &&
              entry.additions.some((addition) => addition.cell === move.cell),
          )
        : null;
      return {
        cell: move.cell,
        expectedMark: move.mark,
        lastReviewedIncompleteSeconds: move.lastIncompleteSeconds,
        firstReviewedCompleteSeconds: move.firstCompleteSeconds,
        firstAcceptedTimeSeconds: first?.time ?? null,
        firstAcceptedMark: first?.board[move.cell] ?? null,
        acceptedExpectedMark: first?.board[move.cell] === move.mark,
        acceptanceKind: event
          ? "individual-move"
          : batch
            ? "board-sync"
            : first
              ? "opening-review-or-unattributed"
              : null,
        eventId: event?.id ?? batch?.eventId ?? null,
        delayAfterFirstReviewedCompleteSeconds: first
          ? first.time - move.firstCompleteSeconds
          : null,
        prematureAcceptance: first
          ? first.time <= move.lastIncompleteSeconds + 1e-6
          : false,
      };
    });
  return {
    casesPath: annotation.path,
    casesSha256: annotation.sha256,
    gameCount: annotation.gameCount,
    labelSource: annotation.labelSource,
    limitations: annotation.limitations,
    scoring:
      "Raw cell readings before temporal confirmation, restricted to manually scoreable cells. Unknown, unreadable, missing or confidence below 0.78 abstains. Global frame quality is reported separately and does not replace cell-level scoring. Nearest sampled frame must be within half an analysis interval.",
    visibleCells: { ...total, byCondition, cases: scored },
    moveAcceptance: {
      individualMoveEvents: individual.length,
      boardSyncEvents: batches.length,
      marksAcceptedViaBoardSync: batches.reduce(
        (sum, batch) => sum + batch.additions.length,
        0,
      ),
      batches,
      moves,
      timingInterpretation:
        "Completion bounds come from sparse manual review, not exact writing timestamps. Signed delay uses first reviewed complete frame as a reference. Acceptance at or before the last reviewed incomplete frame fails. Intermediate order within a board sync remains unknown.",
    },
    checks: {
      allAnnotatedFramesMatched: scored.every((item) => item.matched),
      allAnnotatedMovesAccepted: moves.every(
        (move) => move.acceptedExpectedMark,
      ),
      noPrematureAcceptedMoves: moves.every(
        (move) => !move.prematureAcceptance,
      ),
    },
  };
}

async function verify(file, settings, api, bundleHash) {
  const size = dimensions(file);
  const report = {
    file,
    ...size,
    fps: settings.fps,
    bundleHash,
    expectedFinalBoard: settings.expected,
    openingReview: null,
    openingAttempts: [],
    samples: [],
    resultEvidence: [],
    unexpectedAcceptedMarks: [],
    decoder: null,
    error: null,
    session: null,
  };
  const frameBytes = size.width * size.height * 4;
  const frameBuffer = Buffer.allocUnsafe(frameBytes);
  let buffered = 0;
  let index = 0;
  let calibration = null;
  let session = null;
  let nextSetupAt = 0;
  let previousEvents = 0;
  const wrongMarks = new Set();
  const processFrame = async () => {
    const time = index++ / settings.fps;
    const image = {
      width: size.width,
      height: size.height,
      data: new Uint8ClampedArray(
        frameBuffer.buffer,
        frameBuffer.byteOffset,
        frameBytes,
      ),
    };
    if (!session && time >= nextSetupAt) {
      nextSetupAt = time + 0.8;
      const corners = api.detectBoard(image);
      if (corners) {
        const attempt = {
          time,
          corners,
          board: null,
          accepted: false,
          error: null,
        };
        try {
          const candidate = api.createCalibration(image, corners, "existing");
          attempt.board = candidate.initialBoard;
          if (
            candidate.initialBoard.some(
              (mark) => mark !== null && mark !== "X" && mark !== "O",
            )
          )
            throw new Error("Opening board contains uncertain readings.");
          const legality = api.checkLegality(candidate.initialBoard);
          if (!legality.valid) throw new Error(legality.reason);
          session = api.resumeBoard(candidate.initialBoard, "replay");
          calibration = candidate;
          attempt.accepted = true;
          report.openingReview = {
            time,
            board: [...candidate.initialBoard],
            method:
              "Automatically confirmed for this verification run because all nine opening cells were known and legal. No human review was performed. Earlier move order is unknown.",
          };
        } catch (error) {
          attempt.error = error.message;
        }
        report.openingAttempts.push(attempt);
      }
    }
    let observation = calibration
      ? api.analyzeFrame(image, calibration, time * 1000)
      : null;
    if (observation && session) session = api.observe(session, observation);
    if (session) {
      for (const event of session.events.slice(previousEvents)) {
        if (event.kind === "result")
          report.resultEvidence.push({
            eventId: event.id,
            time,
            board: [...session.board],
            outcome: session.outcome,
            pageMatchesBoard: session.pageMatchesBoard,
            allCellsVisible:
              observation?.cells.length === 9 &&
              observation.cells.every(
                (cell, index) =>
                  cell.readable !== false &&
                  cell.mark === session.board[index] &&
                  cell.confidence >= 0.78 &&
                  cell.confidence <= 1,
              ),
          });
      }
      previousEvents = session.events.length;
      if (settings.expected)
        session.board.forEach((mark, cell) => {
          const key = `${cell}:${mark}`;
          if (
            mark !== null &&
            mark !== settings.expected[cell] &&
            !wrongMarks.has(key)
          ) {
            wrongMarks.add(key);
            report.unexpectedAcceptedMarks.push({
              time,
              cell,
              actual: mark,
              expected: settings.expected[cell],
            });
          }
        });
    }
    report.samples.push({
      time,
      observation,
      board: session ? [...session.board] : null,
      phase: session?.phase ?? null,
      pendingMove: session?.pendingMove ?? null,
      outcome: session?.outcome ?? null,
      pageMatchesBoard: session?.pageMatchesBoard ?? false,
      recoveryReason: session?.recoveryReason ?? null,
      message:
        session?.message ??
        observation?.message ??
        "Looking for an opening board.",
    });
  };
  const decoder = spawn(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-i",
      file,
      "-map",
      "0:v:0",
      "-vf",
      `fps=${settings.fps},scale=${size.width}:${size.height},setsar=1`,
      "-an",
      "-sn",
      "-dn",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  let spawnError = null;
  decoder.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-65536);
  });
  const completion = new Promise((resolve) => {
    decoder.once("error", (error) => {
      spawnError = error.message;
    });
    decoder.once("close", (code, signal) =>
      resolve({ code, signal, stderr, spawnError }),
    );
  });
  try {
    for await (const chunk of decoder.stdout) {
      let offset = 0;
      while (offset < chunk.length) {
        const amount = Math.min(frameBytes - buffered, chunk.length - offset);
        chunk.copy(frameBuffer, buffered, offset, offset + amount);
        offset += amount;
        buffered += amount;
        if (buffered === frameBytes) {
          await processFrame();
          buffered = 0;
        }
      }
    }
  } catch (error) {
    report.error = error.message;
    decoder.kill("SIGTERM");
  } finally {
    report.decoder = await completion;
  }
  if (report.decoder.code !== 0 || report.decoder.spawnError)
    report.error ??=
      report.decoder.spawnError ||
      report.decoder.stderr ||
      `Decoder exited with ${report.decoder.code}.`;
  if (buffered !== 0) report.error ??= "Decoder returned an incomplete frame.";
  if (!index) report.error ??= "No frames were decoded.";
  report.session = session;
  const expectedMatches = settings.expected
    ? !!session && boardKey(session.board) === boardKey(settings.expected)
    : null;
  const confirmedResult = report.resultEvidence.some(
    (evidence) =>
      evidence.outcome != null &&
      evidence.pageMatchesBoard &&
      evidence.allCellsVisible &&
      session &&
      boardKey(evidence.board) === boardKey(session.board),
  );
  const processing = report.samples.flatMap((sample) =>
    sample.observation ? [sample.observation.processingMs] : [],
  );
  const qualityCounts = {};
  for (const sample of report.samples) {
    const quality = sample.observation?.quality ?? "detecting";
    qualityCounts[quality] = (qualityCounts[quality] ?? 0) + 1;
  }
  report.measurements = {
    decodedFrames: index,
    sampledSeconds: index / settings.fps,
    qualityCounts,
    meanProcessingMs: processing.length
      ? processing.reduce((sum, value) => sum + value, 0) / processing.length
      : null,
    reacquisitions: report.samples.filter(
      (sample) => sample.observation?.reacquired,
    ).length,
  };
  report.checks = {
    confirmedResult,
    expectedMatches,
    noUnexpectedAcceptedMarks: !report.unexpectedAcceptedMarks.length,
  };
  report.evaluation = evaluateCases(report, settings.annotation);
  if (report.evaluation) Object.assign(report.checks, report.evaluation.checks);
  report.pass =
    !report.error &&
    confirmedResult &&
    expectedMatches !== false &&
    report.checks.noUnexpectedAcceptedMarks &&
    (!report.evaluation ||
      Object.values(report.evaluation.checks).every(Boolean));
  return report;
}

async function main() {
  const settings = options(process.argv.slice(2));
  if (!settings) {
    console.log(usage);
    return;
  }
  settings.annotation = await loadCases(settings);
  const temporary = await mkdtemp(join(tmpdir(), "paperplay-video-replay-"));
  try {
    const { api, hash } = await compile(temporary);
    settings.fps ??= api.ANALYSIS_FPS;
    if (settings.expected && !api.checkLegality(settings.expected).valid)
      throw new Error("Expected final board is not a legal tic-tac-toe board.");
    await mkdir(settings.outputDir, { recursive: true });
    const summaries = [];
    for (const [index, file] of settings.files.entries()) {
      console.log(`Verifying ${basename(file)} at ${settings.fps} fps…`);
      let report;
      try {
        report = await verify(file, settings, api, hash);
      } catch (error) {
        report = { file, pass: false, error: error.message, bundleHash: hash };
      }
      const filename = `${index + 1}-${basename(file).replace(/[^a-zA-Z0-9._-]/g, "_")}.json`;
      const output = join(settings.outputDir, filename);
      await writeFile(output, JSON.stringify(report, null, 2));
      summaries.push({
        file,
        output,
        pass: report.pass,
        error: report.error,
        checks: report.checks,
        ...(report.evaluation
          ? {
              visibleCells: {
                cells: report.evaluation.visibleCells.cells,
                correct: report.evaluation.visibleCells.correct,
                wrong: report.evaluation.visibleCells.wrong,
                abstention: report.evaluation.visibleCells.abstention,
              },
              moveAcceptance: report.evaluation.moveAcceptance,
            }
          : {}),
      });
      console.log(
        `${report.pass ? "PASS" : "FAIL"}: ${basename(file)}. Report: ${output}`,
      );
    }
    await writeFile(
      join(settings.outputDir, "summary.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          fps: settings.fps,
          bundleHash: hash,
          ...(settings.annotation
            ? {
                cases: {
                  path: settings.annotation.path,
                  sha256: settings.annotation.sha256,
                  gameCount: settings.annotation.gameCount,
                  limitations: settings.annotation.limitations,
                },
              }
            : {}),
          results: summaries,
        },
        null,
        2,
      ),
    );
    if (summaries.some((result) => !result.pass)) process.exitCode = 1;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`${error.message}\n${usage}`);
  process.exitCode = 2;
});
