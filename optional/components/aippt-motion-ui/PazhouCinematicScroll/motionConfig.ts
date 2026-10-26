export const PAZHOU_CINEMATIC_SCROLL_PX = 4600;

export const PAZHOU_SCENES = {
  opening: { enter: 0, settle: 80, exitStart: 520, exitEnd: 760 },
  ingestion: { enter: 560, settle: 900, exitStart: 1500, exitEnd: 1760 },
  orchestration: { enter: 1480, settle: 1820, exitStart: 2460, exitEnd: 2720 },
  outputs: { enter: 2380, settle: 2760, exitStart: 3260, exitEnd: 3500 },
  gallery: { enter: 3160, settle: 3560, exitStart: 4080, exitEnd: 4300 },
  product: { enter: 3980, settle: 4300, exitStart: 4520, exitEnd: 4600 },
} as const;

export const PAZHOU_MOTION = {
  scrollLerp: 0.14,
  pointerLerp: 0.12,
  pointerWorldX: 18,
  pointerWorldY: 8,
  pointerAgentX: 24,
  pointerAgentY: 12,
  maxBlurPx: 14,
  maxWorldScale: 1.22,
  sourceTravelVw: 52,
  outputSpreadVw: 32,
  galleryEnterVw: 360,
  mobileGalleryEnterVw: 180,
  lowPowerDpr: 1,
  mobileDpr: 1.25,
  desktopDpr: 1.5,
} as const;
