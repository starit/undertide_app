import { getTranslations } from "next-intl/server";
import { TriangleAlert, ExternalLink } from "lucide-react";

interface ScamWarningProps {
  snapshotUrl: string;
  type: "space" | "proposal";
}

export async function ScamWarning({ snapshotUrl, type }: ScamWarningProps) {
  const t = await getTranslations("warnings");
  const typeLabel = type === "space" ? t("flaggedSpaceLabel") : t("flaggedProposalLabel");

  return (
    <div
      role="alert"
      className="flex gap-4 border border-destructive/60 bg-destructive/10 p-4 text-sm md:p-5"
    >
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-destructive">
          {t("flaggedHeading")}
        </p>
        <p className="mt-1 leading-relaxed text-muted-foreground">
          {t("flaggedDescription")}
        </p>
        <a
          href={snapshotUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-destructive/80 transition-colors hover:text-destructive"
        >
          {t("viewOnSnapshot")} ({typeLabel})
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}
