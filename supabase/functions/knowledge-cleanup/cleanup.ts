type CleanupDependencies = {
  collect: () => Promise<string[]>;
  remove: (storageKey: string) => Promise<void>;
  acknowledge: (storageKey: string) => Promise<void>;
};

const CONCURRENT_REMOVALS = 10;

export async function runKnowledgeCleanup({ collect, remove, acknowledge }: CleanupDependencies) {
  const pending = await collect();
  let removed = 0;
  for (let offset = 0; offset < pending.length; offset += CONCURRENT_REMOVALS) {
    const batch = pending.slice(offset, offset + CONCURRENT_REMOVALS);
    const results = await Promise.allSettled(batch.map(async (storageKey) => {
      await remove(storageKey);
      await acknowledge(storageKey);
    }));
    removed += results.filter(({ status }) => status === "fulfilled").length;
  }
  return { removed, failed: pending.length - removed };
}
