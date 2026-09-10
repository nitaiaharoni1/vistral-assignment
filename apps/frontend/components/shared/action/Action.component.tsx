import type { ReactNode, Ref } from "react";
import { cn } from "../cn";

const accentClass = cn(
  "inline-flex min-h-[46px] items-center justify-center gap-[9px] rounded-xl border border-transparent px-[19px] py-3 text-sm leading-[1.4] font-[650] whitespace-nowrap",
  "border-accent bg-accent text-white hover:border-accent-hover hover:bg-accent-hover",
  "[&>svg:last-child]:ml-2.5 [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-[160ms] [&>svg:last-child]:ease-settle",
  "[@media(hover:hover)_and_(pointer:fine)]:hover:enabled:[&>svg:last-child]:translate-x-[3px]",
);

const quietClass = cn(
  "inline-flex min-h-[46px] items-center justify-center gap-[9px] rounded-xl border border-transparent px-[19px] py-3 text-sm leading-[1.4] font-[650] whitespace-nowrap",
  "border-line bg-paper text-[#3f4755] hover:border-[#b4bdd0] hover:bg-[#f0f3fa]",
);

const textClass = cn(
  "inline-flex min-h-9 items-center justify-center gap-[7px] px-0 py-1.5 text-sm font-[550] text-[#545e72] underline-offset-4 hover:text-accent hover:underline",
  "pointer-coarse:min-h-11 max-[600px]:min-h-11",
);

const iconClass =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-xl p-2.5 text-[#5c6576] hover:bg-accent-wash hover:text-accent";

type ActionTone = "accent" | "quiet" | "text" | "icon";
type ActionSize = "default" | "welcome" | "board";

type ActionLayout = {
  size?: ActionSize;
  wide?: boolean;
  fill?: boolean;
  span?: "full";
  children: ReactNode;
};

type IconActionProps = ActionLayout & {
  tone: "icon";
  label: string;
  href?: undefined;
  target?: undefined;
  rel?: undefined;
  onClick?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

type ButtonActionProps = ActionLayout & {
  tone?: Exclude<ActionTone, "icon">;
  label?: string;
  href?: undefined;
  target?: undefined;
  rel?: undefined;
  onClick?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

type LinkActionProps = ActionLayout & {
  tone?: Exclude<ActionTone, "icon">;
  label?: string;
  href: string;
  target?: string;
  rel?: string;
  onClick?: undefined;
  disabled?: undefined;
  autoFocus?: undefined;
  ref?: Ref<HTMLAnchorElement>;
};

type ActionProps = IconActionProps | ButtonActionProps | LinkActionProps;

function isLink(props: ActionProps): props is LinkActionProps {
  return typeof props.href === "string";
}

function toneClass(tone: ActionTone): string {
  switch (tone) {
    case "accent":
      return accentClass;
    case "quiet":
      return quietClass;
    case "text":
      return textClass;
    case "icon":
      return iconClass;
    default: {
      const exhaustive: never = tone;
      return exhaustive;
    }
  }
}

function sizeClass(tone: ActionTone, size: ActionSize): string | false {
  if (tone === "text" || tone === "icon") return false;
  switch (size) {
    case "default":
      return false;
    case "welcome":
      return cn(
        "min-h-[54px] px-[21px] py-[15px] text-base",
        "max-[1150px]:px-4 max-[1150px]:py-3.5 max-[1150px]:text-sm",
        "max-[600px]:min-h-[50px] max-[600px]:text-[15px]",
        "max-[359px]:px-3.5 max-[359px]:text-sm",
      );
    case "board":
      return "min-h-[50px] text-base";
    default: {
      const exhaustive: never = size;
      return exhaustive;
    }
  }
}

function actionClass(
  tone: ActionTone,
  size: ActionSize,
  wide: boolean,
  fill: boolean,
  span: "full" | undefined,
): string {
  return cn(
    toneClass(tone),
    sizeClass(tone, size),
    wide && "min-w-[150px] shrink-0",
    fill && "w-full",
    span === "full" && "col-span-full",
  );
}

export function Action(props: ActionProps) {
  const tone = props.tone ?? "accent";
  const size = props.size ?? "default";
  const className = actionClass(
    tone,
    size,
    props.wide === true,
    props.fill === true,
    props.span,
  );
  if (isLink(props)) {
    const { href, target, rel, label, children, ref } = props;
    return (
      <a
        ref={ref}
        className={className}
        href={href}
        target={target}
        rel={rel ?? (target === "_blank" ? "noreferrer" : undefined)}
        aria-label={label}
      >
        {children}
      </a>
    );
  }
  const { onClick, disabled, autoFocus, label, children, ref } = props;
  return (
    <button
      ref={ref}
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={label}
    >
      {children}
    </button>
  );
}
