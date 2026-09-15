#!/usr/bin/env python3
"""Resolve every COPY source in the Dockerfile and say whether it exists.

Three deploys in a row failed on a Dockerfile that had been read carefully and
looked right: a dropped COPY, a lockfile that was no longer copied before
`npm ci`, and a `public/` directory that existed on one machine and not in the
repository. Reading the file does not catch these. Resolving the paths does.

Context sources are checked against `git ls-files`, not the filesystem. That
distinction is the whole point: `public/` was an empty directory left by the
Next scaffold, git cannot track an empty directory, so it was absent from every
fresh clone while `test -e public` passed locally. A path that exists on this
disk but is not committed fails here.

Sources of the form `--from=<stage>` are resolved to the instruction in that
stage that creates them: a COPY whose destination matches, `COPY . .` when the
path really is in the build context and not excluded by .dockerignore, or a RUN
that generates it (npm ci makes node_modules, next build makes .next).

Run it before any push that touches the Dockerfile, .dockerignore, or the set of
files the image needs:

    npm run check:dockerfile

Exits non-zero if any source fails to resolve.
"""

import fnmatch
import io
import os
import re
import subprocess
import sys

DOCKERFILE = "Dockerfile"
DOCKERIGNORE = ".dockerignore"


def instructions(path):
    """Join line continuations and drop comments, as the Dockerfile parser does."""
    out, buf = [], None
    for line in io.open(path, encoding="utf-8").read().split("\n"):
        stripped = line.strip()
        if buf is None:
            if not stripped or stripped.startswith("#"):
                continue
            buf = line
        else:
            if stripped.startswith("#"):
                continue
            buf += line
        if buf.rstrip().endswith("\\"):
            buf = buf.rstrip()[:-1]
        else:
            out.append(re.sub(r"\s+", " ", buf).strip())
            buf = None
    if buf is not None:
        out.append(re.sub(r"\s+", " ", buf).strip())
    return out


def stage_name(instruction):
    m = re.match(r"FROM\s+(\S+)(?:\s+AS\s+(\S+))?$", instruction, re.I)
    return (m.group(2) or m.group(1)).lower() if m else None


def build_stages(instrs):
    """Map each stage to its instructions and its WORKDIR."""
    stages, current = {}, None
    for i in instrs:
        name = stage_name(i)
        if name:
            current = name
            stages[name] = {"instr": [], "workdir": "/"}
            continue
        if current is None:
            continue
        stages[current]["instr"].append(i)
        w = re.match(r"WORKDIR\s+(\S+)$", i, re.I)
        if w:
            stages[current]["workdir"] = w.group(1)
    return stages


def load_ignores():
    if not os.path.exists(DOCKERIGNORE):
        return []
    return [
        l.strip()
        for l in io.open(DOCKERIGNORE, encoding="utf-8").read().split("\n")
        if l.strip() and not l.strip().startswith("#")
    ]


IGNORES = load_ignores()


def dockerignored(path):
    top = path.split("/")[0]
    return [p for p in IGNORES if fnmatch.fnmatch(path, p) or fnmatch.fnmatch(top, p)]


def git_tracked(path):
    """True when git has the path committed. A directory counts if it holds files."""
    for probe in (path, path.rstrip("/") + "/"):
        result = subprocess.run(
            ["git", "ls-files", "--", probe], capture_output=True, text=True
        )
        if result.stdout.strip():
            return True, len(result.stdout.strip().split("\n"))
    return False, 0


def copy_sources(instruction):
    """Return (sources, --from stage or None) for a COPY."""
    m = re.match(r"COPY\s+(.*)$", instruction, re.I)
    if not m:
        return None, None
    tokens = m.group(1).split()
    frm = None
    for t in tokens:
        f = re.match(r"--from=(\S+)$", t)
        if f:
            frm = f.group(1).lower()
    paths = [t for t in tokens if not t.startswith("--")]
    return paths[:-1], frm


def produced_by(stages, stage, abspath, upto=None):
    """Find the instruction in `stage` that creates abspath.

    Every instruction is considered. A later RUN can produce a path that
    `COPY . .` did not bring in -- .next is exactly that -- so a miss records a
    reason and the search continues rather than returning a failure early.

    `upto` bounds the search to instructions before that index, which is what
    a RUN's prerequisites need: the file has to be there already.
    """
    st = stages.get(stage)
    if st is None:
        return None, "stage '%s' is not defined in this Dockerfile" % stage
    workdir = st["workdir"].rstrip("/")
    target = abspath.rstrip("/")
    misses = []

    for i in st["instr"][:upto]:
        sources, _ = copy_sources(i)
        if sources is not None:
            dest = re.match(r"COPY\s+(.*)$", i, re.I).group(1).split()[-1]
            dest_abs = dest if dest.startswith("/") else workdir + "/" + dest.lstrip("./")
            dest_abs = re.sub(r"/+", "/", dest_abs).rstrip("/") or "/"
            # `COPY a b ./` and any dest ending in / place each source *inside*
            # the destination directory, so the paths created are dest/basename.
            if sources != ["."] and (len(sources) > 1 or dest.endswith("/")):
                landed = {
                    re.sub(r"/+", "/", dest_abs + "/" + os.path.basename(s)).rstrip("/")
                    for s in sources
                }
                if target in landed:
                    return i, None
            elif dest_abs == target:
                return i, None
            if sources == ["."] and dest_abs in (workdir, "/"):
                rel = target[len(workdir) + 1:] if target.startswith(workdir + "/") else None
                if not rel:
                    continue
                excluded = dockerignored(rel)
                tracked, count = git_tracked(rel)
                if excluded:
                    misses.append(
                        "`COPY . .` does not bring it in: .dockerignore excludes "
                        "'%s' via %s" % (rel, ", ".join(excluded))
                    )
                elif not tracked:
                    misses.append(
                        "`COPY . .` does not bring it in: '%s' is NOT in the git tree"
                        % rel
                    )
                else:
                    return (
                        "COPY . .  (context path '%s', %d tracked file(s))" % (rel, count),
                        None,
                    )
            continue

        run = re.match(r"RUN\s+(.*)$", i, re.I)
        if run:
            command, base = run.group(1), target.split("/")[-1]
            if base == "node_modules" and re.search(r"\bnpm (ci|install|i)\b", command):
                return i[:60] + ("..." if len(i) > 60 else ""), None
            if base == ".next" and re.search(r"npm run build|next build", command):
                return i[:60] + ("..." if len(i) > 60 else ""), None

    why = "no instruction in stage '%s' produces %s" % (stage, target)
    return None, (why + " -- " + "; ".join(misses) if misses else why)


# A RUN that needs a file present is the other half of this check. Resolving
# every COPY source proves each COPY works; it cannot notice a COPY that was
# deleted, which is how `npm ci` once ran in a stage with no lockfile in it.
RUN_REQUIREMENTS = [
    (r"\bnpm ci\b", ["package.json", "package-lock.json"]),
    (r"\bnpm (install|i)\b", ["package.json"]),
    (r"npm run build|next build", ["package.json", "node_modules"]),
]


def check_run_prerequisites(stages):
    """For each RUN, confirm an earlier instruction in its stage put its inputs there."""
    rows = []
    for stage, st in stages.items():
        workdir = st["workdir"].rstrip("/")
        for index, i in enumerate(st["instr"]):
            run = re.match(r"RUN\s+(.*)$", i, re.I)
            if not run:
                continue
            for pattern, needed in RUN_REQUIREMENTS:
                if not re.search(pattern, run.group(1)):
                    continue
                for rel in needed:
                    target = workdir + "/" + rel
                    who, err = produced_by(stages, stage, target, upto=index)
                    rows.append((stage, run.group(1)[:24], target, who is not None,
                                 ("provided by: " + who) if who else err))
    return rows


def main():
    instrs = instructions(DOCKERFILE)
    stages = build_stages(instrs)

    rows, failures, current = [], 0, None
    for i in instrs:
        name = stage_name(i)
        if name:
            current = name
            continue
        sources, frm = copy_sources(i)
        if sources is None:
            continue
        for src in sources:
            if frm:
                who, err = produced_by(stages, frm, src)
                ok = who is not None
                rows.append((current, "--from=" + frm, src, ok,
                             ("produced by: " + who) if ok else err))
            elif src == ".":
                rows.append((current, "context", src, True, "whole build context"))
            else:
                excluded = dockerignored(src)
                tracked, count = git_tracked(src)
                if excluded:
                    ok, why = False, ".dockerignore excludes it via %s" % ", ".join(excluded)
                elif not tracked:
                    ok, why = False, "NOT in the git tree" + (
                        " (on this disk but untracked -- a fresh clone will not have it)"
                        if os.path.exists(src) else " and not on disk"
                    )
                else:
                    ok, why = True, "git-tracked, %d file(s)" % count
                rows.append((current, "context", src, ok, why))
            if not rows[-1][3]:
                failures += 1

    if not rows:
        print("No COPY instructions found in %s -- is the file empty?" % DOCKERFILE)
        return 1

    w1 = max(len(r[0] or "") for r in rows)
    w2 = max(len(r[1]) for r in rows)
    w3 = max(len(r[2]) for r in rows)
    header = "%-*s  %-*s  %-*s  %-4s  %s" % (w1, "STAGE", w2, "ORIGIN", w3, "SOURCE", "", "RESOLUTION")
    print(header)
    print("-" * len(header))
    for st, origin, src, ok, why in rows:
        print("%-*s  %-*s  %-*s  %-4s  %s"
              % (w1, st, w2, origin, w3, src, "PASS" if ok else "FAIL", why))
    print("-" * len(header))
    print("%d COPY source(s) checked, %d failing" % (len(rows), failures))

    prereqs = check_run_prerequisites(stages)
    if prereqs:
        p1 = max(len(r[0]) for r in prereqs)
        p2 = max(len(r[1]) for r in prereqs)
        p3 = max(len(r[2]) for r in prereqs)
        head2 = "%-*s  %-*s  %-*s  %-4s  %s" % (p1, "STAGE", p2, "RUN", p3, "NEEDS", "", "RESOLUTION")
        print("\n" + head2)
        print("-" * len(head2))
        for stage, cmd, target, ok, why in prereqs:
            print("%-*s  %-*s  %-*s  %-4s  %s"
                  % (p1, stage, p2, cmd, p3, target, "PASS" if ok else "FAIL", why))
        print("-" * len(head2))
        missing = sum(1 for r in prereqs if not r[3])
        failures += missing
        print("%d RUN prerequisite(s) checked, %d failing" % (len(prereqs), missing))

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
