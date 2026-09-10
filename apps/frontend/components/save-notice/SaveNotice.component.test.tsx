import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { SaveNotice } from "./SaveNotice.component";

describe("SaveNotice", () => {
  it("stays hidden without a notice", () => {
    const { container } = render(<SaveNotice notice="" onDismiss={vi.fn()} />);
    expect(container.firstElementChild).toHaveAttribute("hidden");
    expect(screen.queryByRole("button", { name: "Dismiss notification" })).not.toBeInTheDocument();
  });

  it("shows the notice and dismisses it", async () => {
    const onDismiss = vi.fn();
    render(<SaveNotice notice="Session log ready to save." onDismiss={onDismiss} />);
    expect(screen.getByRole("status")).toHaveTextContent("Session log ready to save.");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
