import type { Metadata } from "next";
import { listSpaces } from "@/lib/repository";
import { SectionHeading } from "@/components/section-heading";
import { SpacesBrowser } from "@/components/spaces-browser";
import { getDictionary } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

const INITIAL_SPACE_LIMIT = 200;

export const metadata: Metadata = {
  title: "Governance Spaces",
  description: "Browse verified Snapshot governance spaces by protocol, activity, and follower scale across Web3.",
  alternates: {
    canonical: "/spaces",
  },
};

export default async function SpacesPage() {
  const locale = await getServerLocale();
  const copy = getDictionary(locale);
  const spaces = await listSpaces({ sort: "activity", verified: true, limit: INITIAL_SPACE_LIMIT });

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <SectionHeading
        eyebrow={copy.spaces.eyebrow}
        title={copy.spaces.title}
        description={copy.spaces.description}
      />
      <div className="mt-10">
        <SpacesBrowser spaces={spaces} locale={locale} />
      </div>
    </section>
  );
}
