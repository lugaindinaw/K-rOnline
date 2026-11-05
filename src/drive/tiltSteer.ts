export function scaledTilt(degrees: number): number {
  const dead = 8;
  const full = 32;
  const magnitude = Math.abs(degrees);
  if (!Number.isFinite(degrees) || magnitude <= dead) {
    return 0;
  }
  const amount = Math.min(1, (magnitude - dead) / (full - dead));
  return Math.sign(degrees) * amount;
}

export function steerFromTilt(
  sample: { beta: number | null; gamma: number | null },
  landscape: boolean,
): number {
  const raw = landscape ? sample.beta : sample.gamma;
  if (raw == null) {
    return 0;
  }
  return scaledTilt(raw);
}

export async function requestTiltPermission(request?: () => Promise<string>): Promise<boolean> {
  if (!request) {
    return true;
  }
  try {
    return (await request()) === "granted";
  } catch {
    return false;
  }
}
