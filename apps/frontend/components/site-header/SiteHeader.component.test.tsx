import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { SiteHeader } from "./SiteHeader.component";

describe("SiteHeader", () => {
  it("links home and opens the tutorial", async () => {
    const onOpenTutorial = vi.fn();
    render(<SiteHeader onOpenTutorial={onOpenTutorial} />);
    expect(screen.getByRole("link", { name: "Paperplay home" })).toHaveAttribute("href", "/");
    await userEvent.click(screen.getByRole("button", { name: /Tutorial/ }));
    expect(onOpenTutorial).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /Voice/ })).toBeNull();
  });
});
