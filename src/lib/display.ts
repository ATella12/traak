export const formatWalletAddress = (value: string | undefined, options?: { start?: number; end?: number }): string => {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  const start = options?.start ?? 6;
  const end = options?.end ?? 4;

  if (trimmed.length <= start + end + 3) {
    return trimmed;
  }

  return `${trimmed.slice(0, start)}...${trimmed.slice(-end)}`;
};
