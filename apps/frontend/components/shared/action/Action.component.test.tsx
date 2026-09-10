import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Action } from "./Action.component";

describe("Action", () => {
  it("renders a button and fires the click handler", async () => {
    const onClick = vi.fn();
    render(<Action onClick={onClick}>Save</Action>);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders a quiet disabled button", () => {
    render(
      <Action tone="quiet" disabled>
        Wait
      </Action>,
    );
    expect(screen.getByRole("button", { name: "Wait" })).toBeDisabled();
  });

  it("adds noreferrer to a new-tab link", () => {
    render(
      <Action href="https://example.com" target="_blank">
        Docs
      </Action>,
    );
    const link = screen.getByRole("link", { name: "Docs" });
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("uses the label as the accessible name for an icon button", () => {
    render(
      <Action tone="icon" label="Close">
        ×
      </Action>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});
