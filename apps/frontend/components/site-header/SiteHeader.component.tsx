import { Circle } from "@phosphor-icons/react";
import { Question } from "@phosphor-icons/react";
import { SpeakerHigh } from "@phosphor-icons/react";
import { SpeakerSlash } from "@phosphor-icons/react";
import { X } from "@phosphor-icons/react";
import { cn } from "../shared/cn/cn";

type SiteHeaderProps = {
  compact?: boolean;
  onOpenTutorial: () => void;
  voiceOn: boolean;
  onToggleVoice: () => void;
};

const headerButtonClass = cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3.5 py-[9px] text-sm text-[#555c6a] hover:bg-[#eaedf3] hover:text-ink", "max-[600px]:gap-1.5 max-[600px]:p-2 max-[600px]:text-[13px]");

// Builds the header height and padding for compact or full.
function headerClass(compact: boolean): string {
  return cn(
    "mx-auto flex w-full max-w-[1376px] shrink-0 items-center justify-between gap-6 px-12",
    compact ? "h-16" : "h-[88px] min-[1600px]:h-[104px] max-[800px]:h-[76px] max-[600px]:h-16",
    "max-[1150px]:px-8 max-[800px]:px-6 max-[600px]:px-5 short-landscape:h-16",
  );
}

const brandClass = cn(
  "inline-flex min-h-11 items-center gap-3 text-[25px] font-[760] tracking-[-0.7px]",
  "hover:[&_span.text-accent]:text-accent-hover hover:[&_.text-muted]:text-ink",
  "max-[600px]:gap-2 max-[600px]:text-[23px] max-[359px]:text-[21px]",
);

const brandMarkClass = cn("mr-0.5 flex items-center gap-px text-accent", "max-[600px]:gap-0 max-[600px]:[&_svg]:w-[18px] max-[359px]:hidden");

// Shows the brand, voice toggle, and tutorial button.
export function SiteHeader({ compact = false, onOpenTutorial, voiceOn, onToggleVoice }: SiteHeaderProps) {
  return (
    <header className={headerClass(compact)}>
      <a className={brandClass} href="/" aria-label="Paperplay home" translate="no">
        <span className={brandMarkClass} aria-hidden="true">
          <X size={22} weight="bold" />
          <Circle size={21} weight="bold" />
        </span>
        paperplay
        <span className="ml-[3px] text-xs font-medium tracking-normal text-muted max-[800px]:hidden">by Vistral</span>
      </a>
      <div className="flex items-center gap-1">
        <button type="button" className={headerButtonClass} aria-pressed={voiceOn} aria-label={voiceOn ? "Voice on" : "Voice off"} onClick={onToggleVoice}>
          {voiceOn ? <SpeakerHigh size={19} aria-hidden="true" /> : <SpeakerSlash size={19} aria-hidden="true" />}
          <span className="max-[600px]:hidden">Voice</span>
        </button>
        <button type="button" className={headerButtonClass} onClick={onOpenTutorial}>
          <Question size={19} aria-hidden="true" /> Tutorial
        </button>
      </div>
    </header>
  );
}
