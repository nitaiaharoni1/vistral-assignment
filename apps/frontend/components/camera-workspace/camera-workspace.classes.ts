import { cn } from "../shared/cn";

export const cameraPanelWelcome = cn(
  "grid min-h-[min(610px,calc(100dvh-140px))] min-w-0 grid-cols-[0.95fr_1.05fr] items-center gap-14",
  "max-[1150px]:gap-9 max-[800px]:min-h-0 max-[800px]:grid-cols-2 max-[800px]:gap-6",
  "max-[600px]:flex max-[600px]:h-full max-[600px]:min-h-0 max-[600px]:flex-col max-[600px]:items-stretch max-[600px]:gap-[clamp(12px,2.4dvh,20px)]",
  "short-landscape:min-h-0 short-landscape:gap-6",
);

export const cameraPanelLive = "flex h-full min-h-0 flex-col";

export const welcomeArtSlotClass = "max-[600px]:min-h-28 max-[600px]:flex-1";

export const cameraFrameSlotClass =
  "grid min-h-0 flex-1 place-items-start justify-items-center [container-type:size]";

export const welcomeCopyClass = cn(
  "min-w-0 py-6 max-[600px]:w-full max-[600px]:shrink-0 max-[600px]:p-0",
  "short-landscape:py-2",
);

export const welcomeTitleClass = cn(
  "text-[72px] leading-[1.02] font-[780] tracking-[-0.04em] text-nowrap",
  "min-[1600px]:text-[80px] max-[1150px]:text-[58px] max-[800px]:text-[46px]",
  "max-[600px]:text-[clamp(36px,min(13vw,8dvh),54px)] min-[601px]:max-[700px]:text-[40px]",
  "short-landscape:text-[40px]",
);

export const welcomeLeadClass = cn(
  "mt-[26px] max-w-[360px] text-lg leading-[1.6] text-muted",
  "max-[800px]:mt-5 max-[800px]:text-base",
  "max-[600px]:mt-[clamp(8px,2dvh,16px)] max-[600px]:max-w-[340px] max-[600px]:text-[15px] max-[600px]:leading-normal",
  "short-landscape:mt-4 short-landscape:text-base short-landscape:leading-normal",
);

export const welcomeActionsClass = cn(
  "mt-[34px] flex flex-wrap items-center gap-5",
  "max-[1150px]:gap-3 max-[800px]:mt-6 max-[600px]:mt-[clamp(12px,2.4dvh,20px)] max-[600px]:gap-5",
  "max-[359px]:gap-2.5 short-landscape:mt-4",
);

export const welcomeUtilitiesClass = cn(
  "mt-14 flex flex-wrap items-center gap-[18px] text-[13px] text-muted [&>span]:text-[#b1b7c3]",
  "max-[800px]:mt-[26px] max-[600px]:mt-2 max-[600px]:gap-x-2.5 max-[600px]:gap-y-0",
  "max-[600px]:[&>a]:text-[13px] max-[600px]:[&>button]:text-[13px]",
  "max-[359px]:justify-between max-[359px]:gap-x-1.5 max-[359px]:[&>span]:hidden",
  "short-landscape:mt-3",
);

export const cameraStageBase = "relative min-w-0";

export const cameraStageWelcome = cn(
  "w-full overflow-hidden rounded-[24px] bg-welcome-stage",
  "max-[600px]:h-full max-[600px]:max-h-none max-[600px]:rounded-[20px]",
  "short-landscape:w-[min(100%,calc(100svh-100px))] short-landscape:justify-self-end",
);

export const cameraStageLive = cn(
  "mx-auto w-[min(100cqw,calc(100cqh*var(--frame-ratio)))]",
  "short-orient:grid short-orient:h-full short-orient:w-full short-orient:place-items-center short-orient:grid-cols-[minmax(0,1fr)_260px] short-orient:overflow-hidden short-orient:rounded-2xl short-orient:bg-ink",
);

export const cameraImagePlaneClass = "relative mx-auto w-full";

export const cameraImagePlaneWelcomeClass = cn(
  cameraImagePlaneClass,
  "max-[600px]:h-full max-[600px]:max-h-none",
);

export const cameraImagePlaneLiveClass = cn(
  cameraImagePlaneClass,
  "short-orient:w-[min(100%,calc(100cqh*var(--frame-ratio)))]",
);

export const cameraNextActionClass = cn(
  "absolute right-2.5 bottom-2.5 left-2.5",
  "short-orient:left-auto short-orient:w-60",
);

export const cameraStageBlocked = cn(
  "[&_canvas]:invisible [&_video]:invisible",
);

export const sourceVideoHidden =
  "pointer-events-none fixed bottom-0 left-0 h-px w-px opacity-0";

export const sourceVideoPreview =
  "static block aspect-[var(--frame-ratio)] h-auto w-full rounded-2xl object-contain opacity-100";

export const welcomeArtClass = cn(
  "block aspect-square h-auto w-full object-cover",
  "max-[600px]:h-full max-[600px]:aspect-auto max-[600px]:object-center",
);

export const frameStatusClass = cn(
  "pointer-events-none absolute top-3.5 right-3.5 left-3.5 flex items-start justify-end gap-2",
  "max-[600px]:top-2.5 max-[600px]:right-2.5 max-[600px]:left-2.5",
);

export const cameraBlockerClass = cn(
  "absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-auto rounded-2xl bg-accent-wash p-6 text-center text-ink",
  "[&>svg]:shrink-0 [&>svg]:text-accent",
  "short-orient:gap-2.5 short-orient:p-4",
);

export const overlayLegendClass =
  "flex flex-wrap items-center gap-x-4 gap-y-2.5 text-xs text-muted [&>span]:inline-flex [&>span]:items-center [&>span]:gap-[5px]";
