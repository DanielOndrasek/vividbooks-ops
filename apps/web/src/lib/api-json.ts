/** Bezpečně přečte JSON z fetch odpovědi — HTML/prázdné tělo nesmí shodit UI. */
export async function readFetchJson<T extends object>(
  res: Response,
): Promise<T & { error?: string }> {
  const text = await res.text();
  if (!text.trim()) {
    return {
      error: res.ok ? undefined : `Chyba ${res.status}`,
    } as T & { error?: string };
  }
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return {
      error: `Neočekávaná odpověď serveru (${res.status}).`,
    } as T & { error?: string };
  }
}

export function errorMessageFromUnknown(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

export function prismaErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code: unknown }).code);
    if (code === "P2002") {
      return "Doklad už má evidenci platby — převod nelze dokončit.";
    }
    if (code === "P2025") {
      return "Záznam už neexistuje.";
    }
  }
  const raw = err instanceof Error ? err.message : String(err);
  if (/permission denied/i.test(raw)) {
    return "Databáze nepovolila tuto akci (chybí oprávnění).";
  }
  if (raw.trim()) {
    return raw;
  }
  return fallback;
}
