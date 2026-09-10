import { WarningCircle } from "@phosphor-icons/react";
import { cn } from "../cn/cn";

type ErrorNoticeProps = {
  children: string;
  flush?: boolean;
};

// Shows an error message with a warning icon.
export function ErrorNotice({ children, flush = false }: ErrorNoticeProps) {
  return (
    <div role="alert" className={cn("flex items-start gap-2.5 rounded-xl bg-error-wash px-4 py-3.5 text-sm text-error [&>svg]:mt-0.5", flush ? "mt-0" : "mt-[18px]")}>
      <WarningCircle size={19} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
