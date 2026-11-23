/** Role pro sklad — jedna pravda pro API routy i UI (UI nenabízí akci, která by skončila 403). */
export const INVENTORY_WRITE_ROLES = ["ADMIN", "APPROVER"] as const;
/** Aktualizace ze Fulfillment.cz je idempotentní čtení stavu → smí každá přihlášená role. */
export const INVENTORY_SYNC_ROLES = ["ADMIN", "APPROVER", "VIEWER"] as const;

export function canWriteInventory(role: string | null | undefined): boolean {
  return !!role && (INVENTORY_WRITE_ROLES as readonly string[]).includes(role);
}

export function canSyncInventory(role: string | null | undefined): boolean {
  return !!role && (INVENTORY_SYNC_ROLES as readonly string[]).includes(role);
}
