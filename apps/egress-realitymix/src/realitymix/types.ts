/**
 * Typy odvozené z dokumentace XML-RPC rozhraní RealityMIX.
 * Všechny RPC metody vrací strukturu { output, status, statusMessage }.
 * statusCode === 0 znamená úspěch; jiné hodnoty znamenají chybu / expiraci session.
 */

export interface RmixEnvelope<T> {
  output: T;
  status: number;
  statusMessage: string;
}

export interface RmixGetHashOutput {
  sessionId: string;
  nonce: string;
}

export type RmixLoginOutput = boolean;

export interface RmixListingStat {
  advert_id: string | number;
  rkid?: string;
  date?: string;
  list_views?: number;
  detail_views?: number;
  contact_views?: number;
  inquiries?: number;
  [key: string]: unknown;
}

export interface RmixInquiry {
  inquiry_id: string | number;
  advert_id?: string | number;
  rkid?: string;
  created_at?: string;
  email?: string;
  phone?: string;
  name?: string;
  message?: string;
  [key: string]: unknown;
}
