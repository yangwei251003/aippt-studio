> 历史开发验收记录；并非本次开源迁移新验收。原参考截图与运行产物未随仓库分发。

# Design QA

- Source: `[本地私有来源，未公开]`
- Implementation: `artifacts/design-qa/home-after-4.png`
- Project list: `artifacts/design-qa/projects-after.png`
- Hover state: `artifacts/design-qa/pill-nav-hover.png`
- Combined comparison: `artifacts/design-qa/home-comparison-v1.png`
- Viewport: source 1000 × 849; implementation captured at the same 1000 × 849 logical viewport and normalized from 1.25 DPR for the comparison board.

## Comparison

- Preserved the Pazhou night skyline, observatory grid, orbit, Page Core center, five-card composition, rail, CTA hierarchy, and engineering typography.
- Replaced the four high-contrast white cards with translucent dark olive console surfaces, as explicitly requested. Text and lime data marks retain clear contrast.
- Replaced the static capsule links with the supplied PillNav interaction: circular fill expansion, two-layer label transition, active marker, logo rotation, and mobile popover.
- Added pointer-relative spring tilt to all five orbit cards without changing their base placement or content.
- Verified Scroll Float at initial, mid-scroll, and completed states; completed characters clear transforms and remain readable.
- Verified the workspace DotGrid changes canvas frames under pointer motion. Reduced-motion keeps the pointer color response while removing inertial displacement.

## Motion and layout regression pass

- Homepage reference: `[本地私有来源，未公开]`
- Homepage implementation: `artifacts/design-qa/homepage-bottom-layout-final.png`
- Workspace reference: `[本地私有来源，未公开]`
- Workspace implementation: `artifacts/design-qa/workbench-dotgrid-pillnav-final.png`
- Pricing reference: `[本地私有来源，未公开]`
- Pricing implementation: `artifacts/design-qa/pricing-spotlight-borderglow-final.png`
- Scroll Float evidence: `artifacts/design-qa/homepage-scrollfloat-reveal.png`

### Verified fixes

- The Page Core trust heading is horizontal again, with normal section height and no clipped or vertically stacked characters.
- Scroll Float characters interpolate from hidden/stretched to their final readable state during scrolling; reduced-motion uses an opacity-only reveal.
- DotGrid pointer tracking works in both normal and reduced-motion modes. Three sampled canvas frames produced distinct hashes after pointer movement.
- Pill navigation exposes all six workspace destinations and has a clearly distinct lime hover and active state.
- Workbench panels remain translucent enough for the reactive background to stay visible without weakening content contrast.
- Pricing cards combine a pointer spotlight, highlighted edge, and soft exterior glow while preserving the existing Free/Pro content and billing interaction.
- Key homepage, workspace, and pricing actions use the brand-adapted specular sweep without adding a WebGL runtime dependency.

## Iteration history

1. Initial implementation exposed the correct dark cards but revealed a double line break in the hero and insufficient hover contrast.
2. Restored the headline rhythm, changed the pill reveal to lime-on-dark, and added a deterministic Scroll Float completed state.

## Result

final result: passed

## Recovery and enrichment pass — 2026-08-23

- Homepage reference: `[本地私有来源，未公开]`
- Homepage implementation: `artifacts/design-qa/home-restored-enhanced.png`
- Interactive Page Core section: `artifacts/design-qa/home-sage-interaction.png`
- Real project list: `artifacts/design-qa/project-list-restored.png`
- Full homepage: `artifacts/design-qa/home-full-page.png`
- Viewport: 1592 × 900 for reference comparison and desktop acceptance.

### Verified recovery

- Preserved the selected Pazhou skyline, orbit, five-card system, dark engineering grid, lime accent, Page Core center, CTA hierarchy, and homepage density.
- Replaced the sparse bottom-left rail with a compact interactive Page Core live-status console without disturbing the hero composition.
- Added six production Page Core states with hover, focus, click, keyboard navigation, live copy, responsive layout, and reduced-motion handling.
- Added continuous-project and deliverable sections, clarified navigation labels, removed decorative punctuation from display headings, and verified all anchors.
- Restored all six workbench stages. Direct navigation and visible navigation both render non-empty content; opening a real project reaches the editor.
- Loaded eight persisted API projects with real names, page counts, timestamps, stages, and covers. No raw `Failed to fetch` text is exposed.
- Compared the supplied reference and the implementation in the same visual review input. The implementation keeps the reference composition and adds only the requested left-side Page Core module.

final result: passed
