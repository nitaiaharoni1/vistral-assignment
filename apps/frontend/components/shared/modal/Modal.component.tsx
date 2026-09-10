import { useEffect } from "react";
import { useRef } from "react";
import type { MouseEvent } from "react";
import type { ReactNode } from "react";
import { cn } from "../cn/cn";

const cardClass = cn(
  "w-[min(520px,calc(100%-32px-env(safe-area-inset-left)-env(safe-area-inset-right)))]",
  "max-h-[calc(100dvh-32px-env(safe-area-inset-top)-env(safe-area-inset-bottom))]",
  "m-auto overscroll-contain rounded-[24px] border border-line bg-white p-8 text-ink shadow-[0_24px_70px_rgb(18_34_73/18%)]",
  "backdrop:bg-[rgb(24_31_54/35%)] open:animate-dialog-open open:backdrop:animate-motion-fade",
  "motion-settle max-[600px]:rounded-[20px] max-[600px]:p-[22px]",
);

const sheetClass = cn(cardClass, "h-[min(500px,calc(100svh-32px-env(safe-area-inset-top)-env(safe-area-inset-bottom)))]", "open:flex! open:flex-col! open:overflow-hidden", "short-landscape:px-[22px] short-landscape:py-4");

type ModalLayout = "card" | "sheet";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  layout?: ModalLayout;
  closeOnBackdrop?: boolean;
  children: ReactNode;
};

// True when the click landed outside the dialog box.
function clickedBackdrop(event: MouseEvent<HTMLDialogElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
}

// Returns card or sheet styles for the dialog.
function layoutClass(layout: ModalLayout): string {
  switch (layout) {
    case "card":
      return cardClass;
    case "sheet":
      return sheetClass;
    default: {
      const exhaustive: never = layout;
      return exhaustive;
    }
  }
}

// Shows a labeled dialog and closes it when asked.
export function Modal({ open, onClose, labelledBy, describedBy, layout = "card", closeOnBackdrop = false, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={layoutClass(layout)}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={
        closeOnBackdrop
          ? (event) => {
              if (clickedBackdrop(event)) onClose();
            }
          : undefined
      }
    >
      {children}
    </dialog>
  );
}
