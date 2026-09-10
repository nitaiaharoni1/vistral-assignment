import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { ErrorNotice } from "./ErrorNotice.component";

describe("ErrorNotice", () => {
  it("exposes the message as an alert", () => {
    render(<ErrorNotice>Camera permission was declined.</ErrorNotice>);
    expect(screen.getByRole("alert")).toHaveTextContent("Camera permission was declined.");
  });
});
