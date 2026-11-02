import { useCountUp, usePlayback } from "@steamfield/ui/react/playback";
import type { ReactElement } from "react";

function Stat({
  id,
  label,
  end,
}: {
  readonly id: string;
  readonly label: string;
  readonly end: number;
}): ReactElement {
  const { ref, value } = useCountUp<HTMLDivElement>(end, { duration: 1500 });
  return (
    <div ref={ref} className="pg-stat">
      <strong data-stat={id}>{value.toLocaleString("en-US")}</strong>
      <span>{label}</span>
    </div>
  );
}

function Progress(): ReactElement {
  const { ref, elapsed, paused, complete, ready, toggle, replay } = usePlayback<HTMLDivElement>({
    duration: 4000,
  });
  return (
    <div ref={ref}>
      <progress
        className="pg-progress"
        aria-label="Playback progress"
        max={4000}
        value={complete ? 4000 : elapsed}
      />
      {ready ? (
        <div className="pg-row">
          <button type="button" onClick={toggle} disabled={complete}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={replay}>
            Replay
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PlaybackPage(): ReactElement {
  return (
    <>
      <h1>playback</h1>
      <section className="pg-section" aria-labelledby="pb-count">
        <h2 id="pb-count">useCountUp</h2>
        <div className="pg-row">
          <Stat id="users" label="Active users" end={12400} />
          <Stat id="projects" label="Projects" end={860} />
          <Stat id="uptime" label="Days online" end={365} />
        </div>
      </section>
      <section className="pg-section" aria-labelledby="pb-progress">
        <h2 id="pb-progress">usePlayback</h2>
        <Progress />
      </section>
    </>
  );
}
