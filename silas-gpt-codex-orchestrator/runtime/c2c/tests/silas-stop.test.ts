import { afterEach, describe, expect, it, vi } from "vitest";
import { stopBridge } from "../src/process/daemon.js";
import { probeBridge, readRuntimeState } from "../src/bridge/runtime.js";

vi.mock("../src/workspace/manager.js", () => ({ Workspace: class { id = "our-workspace"; } }));
vi.mock("../src/bridge/runtime.js", () => ({
  probeBridge: vi.fn(), readRuntimeState: vi.fn(),
  findBridgeObservation: vi.fn(), findLiveBridge: vi.fn(),
}));

afterEach(() => vi.restoreAllMocks());
describe("Silas bridge shutdown ownership", () => {
  for (const observed of [null, { workspaceId: "another-workspace" }, { workspaceId: "our-workspace" }]) {
    it(`never signals a saved PID when shutdown cannot be authenticated: ${JSON.stringify(observed)}`, async () => {
      vi.mocked(readRuntimeState).mockReturnValue({ pid: 12345678, port: 1, adminToken: "test" } as any);
      vi.mocked(probeBridge).mockResolvedValue(observed as any);
      const kill = vi.spyOn(process, "kill").mockReturnValue(true);
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unreachable"));
      expect(await stopBridge("/unused")).toBe(false);
      expect(kill).not.toHaveBeenCalled();
    });
  }
  it("uses the authenticated endpoint when identity matches", async () => {
    vi.mocked(readRuntimeState).mockReturnValue({ pid: 12345678, port: 1, adminToken: "test" } as any);
    vi.mocked(probeBridge).mockResolvedValue({ workspaceId: "our-workspace" } as any);
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    expect(await stopBridge("/unused")).toBe(true);
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:1/admin/shutdown", expect.objectContaining({
      method: "POST", headers: { Authorization: "Bearer test" },
    }));
    expect(kill).not.toHaveBeenCalled();
  });
});
