export function isOfficialSource(
  source: string | null | undefined
): boolean {
  return (
    source === "official_export" ||
    source === "official_api"
  );
}

export function isVerifiedAccuracy(
  accuracy: string | null | undefined
): boolean {
  return (
    accuracy === "verified" ||
    accuracy === "exact"
  );
}

export function isOfficialVerifiedRecord(
  source: string | null | undefined,
  accuracy: string | null | undefined
): boolean {
  return (
    isOfficialSource(source) &&
    isVerifiedAccuracy(accuracy)
  );
}