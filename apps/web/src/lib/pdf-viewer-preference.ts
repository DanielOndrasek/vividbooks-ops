/**
 * Safari (macOS / iOS) bez Chromium často padá na vloženém PDF v iframe.
 * Chrome, Edge, Firefox, Chrome na iOS (CriOS) → vložený náhled je v pořádku.
 */
export function preferPdfExternalViewerOnly(userAgent: string | null): boolean {
  if (!userAgent?.trim()) {
    return false;
  }
  const ua = userAgent;
  if (/chrome|crios|chromium|edg|edgios|opr\/|opios|firefox|fxios/i.test(ua)) {
    return false;
  }
  return /safari/i.test(ua);
}
