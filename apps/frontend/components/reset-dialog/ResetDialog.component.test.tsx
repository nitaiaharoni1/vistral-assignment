import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { ResetDialog } from "./ResetDialog.component";

describe("ResetDialog", () => {
  it("asks before starting a new game", async () => {
    const onKeepPlaying = vi.fn();
    const onRestart = vi.fn();
    render(<ResetDialog open onKeepPlaying={onKeepPlaying} onRestart={onRestart} />);
    expect(screen.getByRole("dialog", { name: "Start a new game?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    expect(onKeepPlaying).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Start new game" }));
    expect(onRestart).toHaveBeenCalledOnce();
  });
});
