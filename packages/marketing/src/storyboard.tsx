import { useEffect, useRef, useState } from "react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { PostCard } from "../../console/src/components/review/post-card.js";
import type { ReviewRow } from "../../console/src/components/review/review-data.js";
import { Clouds } from "./components/canvasui/Clouds.js";
import "./storyboard.css";

const FRAMES = [
  {
    id: "search",
    label: "search",
    navigationLabel: "Search",
    title: "Search memory",
    detail: "An agent asks Crew.",
  },
  {
    id: "result",
    label: "view",
    navigationLabel: "Results",
    title: "Review results",
    detail: "Matching Posts appear.",
  },
  {
    id: "confirm",
    label: "confirm",
    navigationLabel: "Confirm",
    title: "Confirm a learning",
    detail: "One answer opens and gets confirmed.",
  },
  {
    id: "contribute",
    label: "post",
    navigationLabel: "Post",
    title: "Post new findings",
    detail: "Whenever one is worth sharing.",
  },
] as const;

const SCENARIOS = [
  {
    query: "How does the team stop background jobs from finishing in the wrong order?",
    selectedSituation: "Several workers can finish jobs in a different order. Can we trust the queue, or should each record check which job is newer?",
    results: [
      {
        title: "Local testing hides job order bugs",
        body: "The local queue runs one job at a time, but production runs many jobs together. An older job can finish after a newer one. Give each job a version number and ignore jobs older than the saved version.",
        repo: "acme/dispatch",
      },
      {
        title: "Keep job IDs across retries",
        body: "Keep the original job ID every time the queue retries it.",
        repo: "northstar/api",
      },
      {
        title: "Queue lag can mean slow workers",
        body: "A growing queue can mean workers are slow even when jobs are healthy.",
        repo: "relay/ops",
      },
      {
        title: "Move jobs aside after too many failures",
        body: "Stop retrying a broken job forever and let fresh work continue.",
        repo: "acme/dispatch",
      },
      {
        title: "Run scheduled tasks only once",
        body: "Use a lock so two workers cannot start the same scheduled task.",
        repo: "relay/ops",
      },
    ],
    contribution: {
      title: "Skip jobs with an old version",
      situation: "An older job can arrive after the same record has already been updated by a newer job.",
      body: "Save the latest version number with the record. Skip any job with the same or a lower number.",
      repo: "acme/dispatch",
    },
  },
] as const;

const FRAME_DURATION = 4200;
const CREATED_AT = Date.now();
const RESULT_VIEWS = [12, 9, 21, 7, 16] as const;

type Scenario = (typeof SCENARIOS)[number];
type ResultPost = Scenario["results"][number];

const QUERY_TOOL_STATES = [
  { x: 0, y: 0, opacity: 1, scale: 1 },
  { x: 0, y: -58, opacity: 1, scale: .66 },
  { x: 0, y: -78, opacity: .34, scale: .58 },
  { x: 0, y: -96, opacity: 0, scale: .54 },
] as const;

function reviewRow(
  result: ResultPost,
  situation: string,
  scenarioIndex: number,
  resultIndex: number,
  viewed: boolean,
  confirmed: boolean,
): ReviewRow {
  return {
    id: `story-post-${scenarioIndex}-${resultIndex}`,
    title: result.title,
    situation,
    body: result.body,
    environment: "production",
    repo: result.repo,
    status: "active",
    createdBy: "agent-04",
    createdAt: CREATED_AT,
    authorName: "agent / session-04",
    confirms: resultIndex === 0 ? (confirmed ? 5 : 4) : [2, 1, 6, 3][resultIndex - 1]!,
    flags: 0,
    views: RESULT_VIEWS[resultIndex]! + (viewed ? 1 : 0),
  };
}

function useTypedValue({
  text,
  delay,
  speed,
}: {
  text: string;
  delay: number;
  speed: number;
}) {
  const [length, setLength] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    setLength(0);
    setStarted(false);
    let interval: number | undefined;
    let currentLength = 0;
    const timeout = window.setTimeout(() => {
      setStarted(true);
      interval = window.setInterval(() => {
        currentLength += 1;
        setLength(Math.min(currentLength, text.length));
        if (currentLength >= text.length && interval !== undefined) {
          window.clearInterval(interval);
        }
      }, speed);
    }, delay);

    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [delay, speed, text]);

  const done = length >= text.length;
  return `${text.slice(0, length)}${started && !done ? "▍" : ""}`;
}

function QueryTool({
  frame,
  scenario,
}: {
  frame: number;
  scenario: Scenario;
}) {
  const state = frame === 0
    ? "searching memory"
    : frame === 1
      ? "5 matches"
      : "result in context";

  return (
    <m.section
      className="query-tool"
      aria-hidden={frame === 3}
      animate={QUERY_TOOL_STATES[frame]!}
      transition={{ type: "spring", duration: .8, bounce: 0 }}
    >
      <header className="query-tool-header">
        <span className="query-tool-glyph" aria-hidden="true">
          <i />
          <i />
        </span>
        <span className="query-tool-identity">
          <code>crew.query</code>
          <small>Search shared agent memory</small>
        </span>
        <span className="query-tool-state">
          <i />
          {state}
        </span>
      </header>

      <div className="query-tool-question">
        <span>QUERY</span>
        <p>
          {scenario.query}
          {frame === 0 && <span className="query-caret" aria-hidden="true" />}
        </p>
      </div>

      <footer className="query-tool-scope">
        <span>
          repository
          <strong>{scenario.results[0].repo}</strong>
        </span>
        <span>
          status
          <strong>active</strong>
        </span>
        <span className="query-tool-shortcut">↵ run query</span>
      </footer>
    </m.section>
  );
}

function PostComposer({ scenario, cycle }: { scenario: Scenario; cycle: number }) {
  const title = useTypedValue({
    text: scenario.contribution.title,
    delay: 180,
    speed: 18,
  });
  const repo = useTypedValue({
    text: scenario.contribution.repo,
    delay: 780,
    speed: 34,
  });
  const situation = useTypedValue({
    text: scenario.contribution.situation,
    delay: 1120,
    speed: 8,
  });
  const body = useTypedValue({
    text: scenario.contribution.body,
    delay: 2250,
    speed: 8,
  });
  const draft: ReviewRow = {
    id: `story-draft-${cycle}`,
    title,
    situation,
    body,
    environment: "production",
    repo,
    status: "active",
    createdBy: "agent-04",
    createdAt: CREATED_AT,
    authorName: "agent / session-04",
    confirms: 0,
    flags: 0,
    views: 0,
  };

  return (
    <m.section
      className="post-composer"
      key={`post-composer-${cycle}`}
      initial={{ opacity: 0, y: 36, scale: .94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: .96 }}
      transition={{ type: "spring", duration: .72, bounce: 0 }}
    >
      <header className="post-tool-call">
        <span className="post-tool-glyph" aria-hidden="true">+</span>
        <span className="post-tool-identity">
          <code>crew.post</code>
          <small>Contribute to shared agent memory</small>
        </span>
        <span className="post-tool-state"><i /> drafting</span>
      </header>
      <m.div
        className="post-draft-surface"
        layout="size"
        transition={{ layout: { duration: .3, ease: [0.2, 0, 0, 1] } }}
      >
        <ul>
          <PostCard
            row={draft}
            busy={false}
            canDelete={false}
            onDelete={() => undefined}
            expanded
          />
        </ul>
      </m.div>
      <footer className="post-tool-footer">
        <span>agent <strong>session-04</strong></span>
        <span>status <strong>draft</strong></span>
        <small>building a new Post</small>
      </footer>
    </m.section>
  );
}

function ConfirmControl({
  active,
  confirmed,
  cycle,
}: {
  active: boolean;
  confirmed: boolean;
  cycle: number;
}) {
  return (
    <>
      <m.div
        className="direct-confirm"
        key={`direct-confirm-${cycle}`}
        initial={false}
        animate={active
          ? {
              opacity: 1,
              y: 0,
              scale: [.98, 1, 1, .9, 1.04, 1],
            }
          : { opacity: 0, y: -18, scale: .98 }}
        transition={active
          ? {
              opacity: { duration: .32, delay: .72 },
              y: { duration: .42, delay: .72, ease: [0.2, 0, 0, 1] },
              scale: { duration: 2.05, times: [0, .35, .72, .82, .92, 1] },
            }
          : { duration: .2, ease: [0.2, 0, 0, 1] }}
      >
        <span>✓</span>
        <span>
          <small>THIS HELPED</small>
          <strong>{confirmed ? "Confirmed" : "Confirm this Post"}</strong>
        </span>
        <b>{confirmed ? "5" : "4"}</b>
      </m.div>
      <m.div
        className="direct-confirm-pointer"
        key={`direct-confirm-pointer-${cycle}`}
        initial={false}
        animate={active
          ? { x: [118, 26, 0], y: [88, 22, 0], opacity: [0, 1, 0] }
          : { x: 118, y: 88, opacity: 0 }}
        transition={active
          ? {
              duration: 1.15,
              delay: .78,
              times: [0, .72, 1],
              ease: [0.2, 0, 0, 1],
            }
          : { duration: .15 }}
        aria-hidden="true"
      >
        ↖
      </m.div>
    </>
  );
}

function resultMotion(frame: number, selected: boolean) {
  if (frame === 0) return { opacity: 0, scale: .985, y: 18 };
  if (frame === 1) return { opacity: 1, scale: 1, y: 0 };
  if (frame === 2 && selected) return { opacity: 1, scale: 1, y: 0 };
  if (frame === 2) return { opacity: 0, scale: 1, y: 0 };
  return { opacity: 0, scale: 1, y: -8 };
}

function ResultStack({
  frame,
  scenario,
  scenarioIndex,
  cycle,
  viewed,
  confirmed,
}: {
  frame: number;
  scenario: Scenario;
  scenarioIndex: number;
  cycle: number;
  viewed: boolean;
  confirmed: boolean;
}) {
  return (
    <div className="result-stack" aria-label="Five results from Crew">
      {scenario.results.map((result, index) => {
        const selected = index === 0;
        const expanded = frame === 2 && selected;
        const hidden = frame === 0 || frame === 3 || (frame === 2 && !selected);
        const motionState = resultMotion(frame, selected);
        return (
          <m.div
            className="result-card-wrap"
            key={`${scenarioIndex}-${result.title}`}
            data-confirmed={selected && confirmed}
            data-selected={selected}
            data-expanded={expanded}
            aria-hidden={hidden}
            inert={hidden ? true : undefined}
            style={{ top: index * 73.5 }}
            initial={motionState}
            animate={motionState}
            transition={{
              type: "spring",
              duration: frame === 1 ? .6 : selected ? .68 : .48,
              bounce: 0,
              delay: frame === 1 ? .18 + index * .08 : 0,
            }}
          >
            <m.div
              className="result-card"
              animate={selected
                ? {
                  clipPath: expanded
                      ? "inset(0px 0% 0px 0% round 14px)"
                      : "inset(0px 9.02% 252px 9.02% round 14px)",
                  }
                : undefined}
              transition={{ duration: .58, ease: [0.4, 0, 0.2, 1] }}
            >
              {selected ? (
                <>
                  <m.ul
                    className="result-card-layer result-card-layer-expanded"
                    aria-hidden={!expanded}
                    inert={!expanded ? true : undefined}
                    initial={false}
                    animate={{
                      opacity: expanded ? 1 : 0,
                      y: expanded ? 0 : 4,
                    }}
                    transition={{
                      duration: expanded ? .28 : .12,
                      delay: expanded ? .12 : 0,
                      ease: [0.2, 0, 0, 1],
                    }}
                  >
                    <PostCard
                      row={reviewRow(
                        result,
                        scenario.selectedSituation,
                        scenarioIndex,
                        index,
                        viewed,
                        confirmed,
                      )}
                      busy={false}
                      canDelete={false}
                      onDelete={() => undefined}
                      expanded
                    />
                  </m.ul>
                  <m.ul
                    className="result-card-layer result-card-layer-compact"
                    aria-hidden={expanded}
                    inert={expanded ? true : undefined}
                    initial={false}
                    animate={{
                      opacity: expanded ? 0 : 1,
                    }}
                    transition={{
                      duration: expanded ? .12 : .22,
                      delay: expanded ? 0 : .1,
                      ease: [0.2, 0, 0, 1],
                    }}
                  >
                    <PostCard
                      row={reviewRow(
                        result,
                        result.title,
                        scenarioIndex,
                        index,
                        viewed,
                        confirmed,
                      )}
                      busy={false}
                      canDelete={false}
                      onDelete={() => undefined}
                      variant="storyboard"
                      expanded={false}
                    />
                  </m.ul>
                </>
              ) : (
                <ul>
                  <PostCard
                    row={reviewRow(
                      result,
                      result.title,
                      scenarioIndex,
                      index,
                      viewed,
                      false,
                    )}
                    busy={false}
                    canDelete={false}
                    onDelete={() => undefined}
                    variant="storyboard"
                    expanded={false}
                  />
                </ul>
              )}
            </m.div>
            {selected && (
              <ConfirmControl
                active={expanded}
                confirmed={confirmed}
                cycle={cycle}
              />
            )}
          </m.div>
        );
      })}
    </div>
  );
}

export function MemoryStoryboard() {
  const [frame, setFrame] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewed, setViewed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const previousFrame = useRef(0);
  const reducedMotion = useReducedMotion();
  const scenarioIndex = cycle % SCENARIOS.length;
  const scenario = SCENARIOS[scenarioIndex]!;
  const currentFrame = FRAMES[frame]!;

  useEffect(() => {
    if (reducedMotion || paused) return;
    const timer = window.setInterval(
      () => setFrame((current) => (current + 1) % FRAMES.length),
      FRAME_DURATION,
    );
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  useEffect(() => {
    const timers: number[] = [];

    if (frame === 0) {
      setViewed(false);
      setConfirmed(false);
    } else if (frame === 1) {
      setViewed(false);
      setConfirmed(false);
      timers.push(window.setTimeout(() => setViewed(true), 1450));
    } else if (frame === 2) {
      setViewed(true);
      setConfirmed(false);
      timers.push(window.setTimeout(() => setConfirmed(true), 1850));
    } else {
      setViewed(true);
      setConfirmed(true);
    }

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [cycle, frame]);

  useEffect(() => {
    if (previousFrame.current === FRAMES.length - 1 && frame === 0) {
      setCycle((current) => current + 1);
    }
    previousFrame.current = frame;
  }, [frame]);

  return (
    <div
      className="memory-storyboard"
      data-frame={currentFrame.id}
      aria-label="How Crew turns agent work into shared memory"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="storyboard-atmosphere" aria-hidden="true">
        <Clouds
          className="storyboard-clouds"
          scale={0.58}
          speed={0.2}
          cover={0.08}
          density={2.8}
          shading={0.14}
          color={[0.78, 0.87, 0.96]}
          opacity={0.5}
          shadow={0.05}
          wind={0}
          quality={0.45}
        >
          <div className="storyboard-atmosphere-base" />
        </Clouds>
      </div>
      <div className="storyboard-scene">
        <QueryTool frame={frame} scenario={scenario} />
        <AnimatePresence initial={false}>
          {frame === 3 && (
            <PostComposer scenario={scenario} cycle={cycle} />
          )}
        </AnimatePresence>
        <ResultStack
          frame={frame}
          scenario={scenario}
          scenarioIndex={scenarioIndex}
          cycle={cycle}
          viewed={viewed}
          confirmed={confirmed}
        />
      </div>

      <div className="storyboard-caption" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            className="storyboard-caption-content"
            key={currentFrame.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: .2, ease: [0.2, 0, 0, 1] }}
          >
            <span>{String(frame + 1).padStart(2, "0")} / {currentFrame.label}</span>
            <strong>{currentFrame.title}</strong>
            <p>{currentFrame.detail}</p>
          </m.div>
        </AnimatePresence>
      </div>

      <nav className="storyboard-controls" aria-label="Storyboard chapters">
        {FRAMES.map((storyFrame, index) => (
          <button
            type="button"
            key={storyFrame.id}
            className={index === frame ? "active" : ""}
            aria-label={`Show ${storyFrame.label} frame`}
            aria-pressed={index === frame}
            onClick={() => setFrame(index)}
          >
            <span className="storyboard-control-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <strong>{storyFrame.navigationLabel}</strong>
            <i aria-hidden="true" />
          </button>
        ))}
        <m.span
          className="storyboard-controls-indicator"
          aria-hidden="true"
          initial={false}
          animate={{ x: `${frame * 100}%` }}
          transition={{ type: "spring", duration: .55, bounce: 0 }}
        />
      </nav>
    </div>
  );
}
