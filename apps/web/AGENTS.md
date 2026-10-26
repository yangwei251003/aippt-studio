<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## AIPPT visual baseline lock

Before changing any homepage or workbench UI, read `../../docs/UI_VISUAL_BASELINE_LOCK.md` completely.

- The approved visual baseline is locked to commit `280de95` and the screenshots named in that document.
- Do not replace, redesign, simplify, or broadly restyle the homepage, project list, create center, blueprint, Agent Studio, editor, quality center, delivery center, navigation, Page Core IP, or their shared visual components unless the user explicitly requests that exact surface in the current task.
- Unrelated feature work must not edit the protected files listed in the baseline document.
- Preserve the Pazhou night skyline, black engineering console, lime accent, orbit/five-card composition, dense workbench cards, and Page Core IP.
- Never use `git reset --hard`, `git clean`, force-push, or whole-worktree restore for UI recovery. Inspect status and diffs first, preserve unrelated changes, and restore only named protected paths from the approved baseline.
- Any authorized visual change requires before/after screenshots at the same viewport plus `lint`, `typecheck`, and `build` before it may become the new baseline.
