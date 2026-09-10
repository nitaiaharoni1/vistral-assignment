import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { Modal } from "./Modal.component";

describe("Modal", () => {
  it("opens with labels and closes on cancel", async () => {
    const onClose = vi.fn();
    render(
      <Modal open labelledBy="title" describedBy="copy" onClose={onClose}>
        <h2 id="title">Reset?</h2>
        <p id="copy">This clears the board.</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Reset?" });
    expect(dialog).toHaveAttribute("aria-describedby", "copy");
    dialog.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not listen for backdrop clicks unless asked", async () => {
    const onClose = vi.fn();
    render(
      <Modal open labelledBy="title" onClose={onClose}>
        <h2 id="title">Open</h2>
      </Modal>,
    );
    await userEvent.click(screen.getByRole("dialog", { name: "Open" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
