import { formatDate } from "@/lib/dates";
import type { Cadence } from "@/lib/repo/cadence";
import { cn } from "@/lib/utils";

/**
 * The outbound operation in two numbers: builds out today against the target,
 * and what share of everyone in the cadence has answered.
 *
 * Bars carry the shape and stay neutral. A missed day gets one amber tick under
 * it, so falling short is a mark you can count rather than a wall of colour --
 * fourteen amber bars would spend the meaning of amber on decoration.
 */
export function CadencePanel({ cadence }: { cadence: Cadence }) {
  const { target, today, days, streak, missed, replyRate } = cadence;
  const short = today < target;
  const ceiling = Math.max(target, ...days.map((day) => day.sent));

  return (
    <section className="border-hairline grid border-b wide:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
      {/* Today against the target. */}
      <div className="border-hairline flex flex-col justify-between border-b p-4 wide:border-r wide:border-b-0">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-text-3 font-mono text-micro font-medium tracking-label uppercase">
            Builds out today
          </h2>
          <span className="text-text-3 font-mono text-micro tracking-badge uppercase">
            target {target}
          </span>
        </div>

        <p className="mt-3 flex items-baseline gap-2">
          <span
            className={cn(
              "font-serif text-figure leading-none",
              short ? "text-signal-warm" : "text-text-1",
            )}
          >
            {today}
          </span>
          <span className="text-text-3 font-mono text-data">of {target}</span>
        </p>

        <p className="text-text-3 mt-3 font-mono text-micro">
          {short ? (
            <span className="text-signal-warm">
              {target - today} more {target - today === 1 ? "build" : "builds"}{" "}
              today
            </span>
          ) : (
            <>target met</>
          )}
          {streak > 0 ? (
            <span className="text-text-3">
              {" "}
              · {streak} day{streak === 1 ? "" : "s"} running
            </span>
          ) : null}
        </p>
      </div>

      {/* The last fortnight, as shape. */}
      <div className="border-hairline flex flex-col justify-between border-b p-4 wide:border-r wide:border-b-0">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-text-3 font-mono text-micro font-medium tracking-label uppercase">
            Last {days.length} days
          </h3>
          <span
            className={cn(
              "font-mono text-micro tracking-badge uppercase",
              missed > 0 ? "text-signal-warm" : "text-text-3",
            )}
          >
            {missed === 0 ? "on target" : `${missed} under`}
          </span>
        </div>

        <div className="mt-4 flex h-16 items-end gap-1">
          {days.map((day, index) => {
            const isToday = index === days.length - 1;
            return (
              <div
                key={day.start.getTime()}
                className="flex min-w-0 flex-1 flex-col items-center gap-1"
                title={`${formatDate(day.start)} - ${day.sent} of ${target}`}
              >
                <div className="flex h-14 w-full items-end">
                  <div
                    className={cn(
                      "motion-base w-full rounded-t-[1px]",
                      day.sent === 0
                        ? "bg-hairline"
                        : isToday
                          ? "bg-text-2"
                          : "bg-text-3",
                    )}
                    style={{
                      height: `${Math.max(
                        day.sent === 0 ? 2 : 8,
                        (day.sent / ceiling) * 100,
                      )}%`,
                    }}
                  />
                </div>
                {/* One tick per missed day. Today is still open, so it is never
                    marked as missed. */}
                <span
                  aria-hidden
                  className={cn(
                    "h-0.5 w-1.5 rounded-full",
                    !day.met && !isToday ? "bg-signal-warm" : "bg-transparent",
                  )}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Of everyone who got a build, who answered. */}
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-text-3 font-mono text-micro font-medium tracking-label uppercase">
            Reply rate
          </h3>
          <span className="text-text-3 font-mono text-micro tracking-badge uppercase">
            {days.length}d
          </span>
        </div>

        <p
          className="text-text-1 mt-3 font-serif text-figure leading-none"
          title="Replied over everyone who entered the cadence, including those still in it"
        >
          {replyRate.rate === null
            ? "--"
            : `${Math.round(replyRate.rate * 100)}%`}
        </p>

        <dl className="text-text-3 mt-3 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-micro">
          <div className="flex gap-1">
            <dt>replied</dt>
            <dd className="text-text-2">{replyRate.replied}</dd>
          </div>
          <div className="flex gap-1">
            <dt>no answer</dt>
            <dd className="text-text-2">{replyRate.noAnswer}</dd>
          </div>
          <div className="flex gap-1">
            <dt>still in</dt>
            <dd className="text-text-2">{replyRate.inFlight}</dd>
          </div>
        </dl>

        {/* The denominator, said out loud: a rate over four people is not a
            rate, and hiding the sample is how that gets forgotten. */}
        <p className="text-text-3 mt-2 font-mono text-micro">
          of {replyRate.entered} in the cadence
        </p>
      </div>
    </section>
  );
}
