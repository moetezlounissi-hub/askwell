import { expect, it, vi } from "vitest";
import { runKnowledgeCleanup } from "../../../../../supabase/functions/knowledge-cleanup/cleanup";

it("acknowledges only successful removals and retries remaining work on a new run", async () => {
  const first = "project/first.pdf";
  const second = "project/second.pdf";
  const collect = vi.fn().mockResolvedValueOnce([first, second]).mockResolvedValueOnce([first]);
  const remove = vi.fn()
    .mockRejectedValueOnce(new Error("Storage unavailable"))
    .mockResolvedValue(undefined);
  const acknowledge = vi.fn().mockResolvedValue(undefined);

  expect(await runKnowledgeCleanup({ collect, remove, acknowledge })).toEqual({ removed: 1, failed: 1 });
  expect(acknowledge).toHaveBeenCalledExactlyOnceWith(second);

  expect(await runKnowledgeCleanup({ collect, remove, acknowledge })).toEqual({ removed: 1, failed: 0 });
  expect(acknowledge).toHaveBeenLastCalledWith(first);
});
