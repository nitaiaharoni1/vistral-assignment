import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./SiteHeader.component";

describe("SiteHeader", () => {
  it("links home and opens the tutorial", async () => {
    const onOpenTutorial = vi.fn();
    const onToggleVoice = vi.fn();
    render(
      <SiteHeader
        onOpenTutorial={onOpenTutorial}
        voiceOn
        onToggleVoice={onToggleVoice}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Paperplay home" }),
    ).toHaveAttribute("href", "/");
    await userEvent.click(screen.getByRole("button", { name: /Tutorial/ }));
    expect(onOpenTutorial).toHaveBeenCalledOnce();
    const voice = screen.getByRole("button", { name: "Voice on" });
    expect(voice).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(voice);
    expect(onToggleVoice).toHaveBeenCalledOnce();
  });
});
