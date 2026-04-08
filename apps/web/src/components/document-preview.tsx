import { headers } from "next/headers";

import { preferPdfExternalViewerOnly } from "@/lib/pdf-viewer-preference";

type Props = {
  fileUrl: string;
  mimeType: string;
  title?: string;
};

export async function DocumentPreview({ fileUrl, mimeType, title = "Dokument" }: Props) {
  const ua = (await headers()).get("user-agent");
  const safariPdfFallback = preferPdfExternalViewerOnly(ua);

  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={fileUrl} alt="" className="h-full w-full object-contain" />
    );
  }

  if (isPdf) {
    if (safariPdfFallback) {
      return (
        <div className="text-muted-foreground flex h-full min-h-[280px] flex-col items-center justify-center gap-4 p-6 text-center text-sm">
          <p>
            V Safari nelze spolehlivě zobrazit náhled PDF přímo na stránce. Otevřete soubor v novém okně
            (nativní prohlížeč).
          </p>
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="bg-primary text-primary-foreground inline-flex rounded-md px-4 py-2 text-sm font-medium no-underline"
          >
            Otevřít PDF
          </a>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-[480px] flex-col">
        <iframe title={title} src={fileUrl} className="min-h-[480px] w-full flex-1 border-0" />
        <p className="text-muted-foreground mt-2 text-center text-xs">
          <a href={fileUrl} target="_blank" rel="noreferrer" className="text-primary underline">
            Otevřít PDF v novém okně
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="text-muted-foreground flex h-full min-h-[200px] flex-col items-center justify-center gap-2 p-4 text-center text-sm">
      <p>Tento typ souboru nelze vloženě zobrazit.</p>
      <a href={fileUrl} target="_blank" rel="noreferrer" className="text-primary underline">
        Stáhnout / otevřít ({title})
      </a>
    </div>
  );
}
