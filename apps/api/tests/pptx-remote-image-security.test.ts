import { describe, expect, it } from "vitest";
import { assertManagedPresentationImageSource, assertSafeRemoteImageUrl } from "../src/export/pptx-exporter.js";

describe("PPTX remote image boundary", () => {
  it.each([
    "http://example.com/a.png",
    "https://localhost/a.png",
    "https://127.0.0.1/a.png",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.1/a.png",
    "https://192.168.1.2/a.png",
    "https://172.20.1.2/a.png",
    "https://100.64.0.1/a.png",
    "https://[::1]/a.png",
    "https://[fd00::1]/a.png",
  ])("blocks unsafe source %s", (url) => expect(() => assertSafeRemoteImageUrl(url)).toThrow());

  it("accepts a public HTTPS asset URL", () => {
    expect(assertSafeRemoteImageUrl("https://images.example.com/a.png").hostname).toBe("images.example.com");
  });

  it("keeps the exporter offline even for otherwise public URLs", () => {
    expect(() => assertManagedPresentationImageSource("https://images.example.com/a.png")).toThrow(/never access the network/);
    expect(assertManagedPresentationImageSource("data:image/png;base64,iVBORw0KGgo=")).toMatch(/^data:image/);
  });
});
