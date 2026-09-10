import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { Tutorial } from "./Tutorial.component";

describe("Tutorial", () => {
  it("walks through the steps and can finish", async () => {
    const onClose = vi.fn();
    const onFinish = vi.fn();
    render(<Tutorial open onClose={onClose} onFinish={onFinish} paperVideoSrc="/tutorial-game-detected.mp4" />);
    expect(screen.getByRole("heading", { name: /empty grid/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: /You’re X/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: /Let’s play/ }));
    expect(onFinish).toHaveBeenCalledOnce();
  });
});
