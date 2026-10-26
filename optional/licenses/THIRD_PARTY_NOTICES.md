# Third-Party Notices

## Presentation ecosystem (production dependencies)

- PptxGenJS 4.0.1 — MIT — https://github.com/gitbrent/PptxGenJS — native editable PPTX rendering.
- pptx-automizer 0.9.0 — MIT — https://github.com/singerla/pptx-automizer — template/master/slide composition behind `TemplatePptxAdapter`.
- Reveal.js 6.0.1 — MIT — https://github.com/hakimel/reveal.js — offline HTML presentation and speaker-notes runtime.
- Konva 10.3.0 and react-konva 19.2.5 — MIT — https://github.com/konvajs/konva — infinite-canvas rendering foundation.
- JSZip 3.10.1 — MIT or GPL-3.0-or-later — https://github.com/Stuk/jszip — OOXML and maintainable HTML ZIP packaging; this product uses it under MIT.

Versions are exact in workspace package manifests; registry integrity hashes are retained in `pnpm-lock.yaml`. The generated dependency inventory is `output/sbom.spdx.json`.

## Presentation ecosystem (ported ideas; no upstream runtime code)

Presenton, PPTAgent, presentation-skill, codex-ppt-skill, Slidev Skill and Microsoft presentations are represented only by restricted, versioned JSON-Schema workflows and original AIPPT implementation. No upstream application is executed in production. Audit-gated commit identifiers remain `PENDING_AUDIT` and are not eligible for release until completed.

PPTist is research-only because of AGPL-3.0 obligations. tldraw is excluded from the dependency tree pending a valid production license. Fabric.js, Slidev and Marp are not part of the native editable-PPTX delivery path.

## React Bits

Source:
- https://github.com/DavidHDev/react-bits
- https://reactbits.dev/llms.txt

License at package creation:
- MIT + Commons Clause License Condition v1.0
- Copyright © 2026 David Haz

Use:
- Permitted as part of an application, website or product, including commercial use and modification.
- Do not sell, sublicense or redistribute React Bits components themselves as a standalone component library, bundle or port.
- Preserve the copyright and permission notice in substantial copies.

The copies under `components/reactbits-reference/` came from the user's supplied reference file and are included for private AIPPT application development. Codex must verify current official source, license and install instructions before production integration.

## Uiverse Button

Source:
- User-provided snippet attributed to `gharsh11032000`
- https://uiverse.io/

Uiverse states that site UI elements are published under the MIT License and are free for personal and commercial use. Preserve creator attribution in source comments.

## OGL

Used by React Bits Lightfall and CircularGallery reference. Verify the current official repository, package version and license before installation.

## GSAP

Used by PillNav and FoldText reference. Verify current GSAP package and license; only use features permitted for the chosen deployment.

## Motion

Used by ElasticSlider reference. Verify current `motion` package and license.

## MotionSites

The MotionSites Mostar prompt is a design and motion-engineering reference. Do not copy the original protected photos, font, branding or page identity without permission. The user-provided MCP endpoint must be treated as a remote third-party tool and inspected before use.

## Unsplash

If integrated through the API, comply with current API Guidelines, including hotlinking returned URLs, attribution, required download endpoint calls and secret protection.

## Pexels

If integrated through the API, comply with current documentation, prominent Pexels linking and photographer attribution where possible.

## Generated Visuals

The approved AIPPT logo, IP and page concept images were generated during the project conversation. They are direction and composition assets; final production files require cleanup, vector redraw, factual UI text and applicable AI-content labeling.
