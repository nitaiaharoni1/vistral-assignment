import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";

const render = vi.fn();

vi.mock("react-dom/client", () => ({
  default: { createRoot: () => ({ render }) },
  createRoot: () => ({ render }),
}));

// Stub page used while testing the mount.
function App() {
  return null;
}

vi.mock("./pages/App.page", () => ({ default: App }));

vi.mock("@fontsource-variable/figtree", () => ({}));
vi.mock("@fontsource/ibm-plex-mono/latin-400.css", () => ({}));
vi.mock("./styles.css", () => ({}));

describe("main", () => {
  it("mounts the app on #root", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import("./main.tsx");
    expect(render).toHaveBeenCalledOnce();
  });
});
