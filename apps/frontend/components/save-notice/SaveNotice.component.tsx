import { X } from "@phosphor-icons/react";
import { Action } from "../shared/action/Action.component";

type SaveNoticeProps = {
  notice: string;
  onDismiss: () => void;
};

export function SaveNotice({ notice, onDismiss }: SaveNoticeProps) {
  return (
    <div
      hidden={!notice}
      className={
        notice
          ? "fixed bottom-[max(24px,env(safe-area-inset-bottom))] left-1/2 z-10 flex w-max max-w-[min(640px,calc(100%-32px-env(safe-area-inset-left)-env(safe-area-inset-right)))] -translate-x-1/2 items-center gap-4 rounded-2xl border border-line bg-white py-3 pr-3.5 pl-5 shadow-[0_10px_35px_rgb(27_41_77/14%)]"
          : undefined
      }
      role="status"
    >
      <p className="text-sm">{notice}</p>
      {notice && (
        <Action tone="icon" label="Dismiss notification" onClick={onDismiss}>
          <X size={18} aria-hidden="true" />
        </Action>
      )}
    </div>
  );
}
