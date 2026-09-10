import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorNotice } from "./ErrorNotice.component";

describe("ErrorNotice", () => {
  it("exposes the message as an alert", () => {
    render(<ErrorNotice>Camera permission was declined.</ErrorNotice>);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Camera permission was declined.",
    );
  });
});
