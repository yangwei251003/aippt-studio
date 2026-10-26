# Presentation Ecosystem V2

The product now uses `PresentationDocumentV2` as the shared source for editable PPTX, offline Reveal HTML, image-deck workflows, and free-canvas frames/paths.

## Runtime boundaries

- Models output brief/storyboard/page intent/copy. Deterministic semantic layouts own coordinates.
- Fourteen versioned Skill manifests deny shell, secret, workspace, and network access. Production never downloads or executes GitHub Skills.
- The built-in template registry contains 12 scenarios × 10 distinct semantic intents. Uploaded PPTX files remain candidates until rights/font confirmation.
- `PptxRendererAdapter` emits native editable objects. `TemplatePptxAdapter` uses pptx-automizer for master-preserving composition.
- `HtmlExportService` emits an offline single file or maintainable ZIP with deck JSON, theme tokens, Reveal core, and speaker notes.
- Image decks require outline, direction, and sample approval before per-slide tasks unlock. The public contract states that pixels are not object-level editable.
- React-Konva renders frames in world coordinates. PPTX follows frame order but does not claim to preserve camera animation.

## Feature flags

- `FEATURE_DECK_V2=true`
- `FEATURE_IMAGE_DECK=false`
- `FEATURE_INFINITE_CANVAS=false`

Image deck and production-scale canvas release remain gated until editable PPTX/HTML quality criteria pass. The canvas foundation is available in the workbench for controlled evaluation.

## Quality

Every page receives content, geometry, and render-stage results. The current deterministic pass checks sources, placeholders, alt text, capacity, bounds, text overlap, and visibility. Pixel-level DeckTape snapshots, Open XML SDK validation, Gotenberg smoke tests, and PowerPoint/WPS real-device acceptance remain deployment responsibilities and cannot be replaced by LibreOffice-only tests.
