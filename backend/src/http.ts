export function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
