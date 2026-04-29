import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getPlatformStats, listSpaces } from "@/lib/repository";
import { SectionHeading } from "@/components/section-heading";
import { SpacesBrowser } from "@/components/spaces-browser";

const INITIAL_SPACE_LIMIT = 200;

export const metadata: Metadata = {
  title: "Governance Spaces",
  description: "Browse verified Snapshot governance spaces by protocol, activity, and follower scale across Web3.",
  alternates: {
    canonical: "/spaces",
  },
};

export default async function SpacesPage() {
  const tSpaces = await getTranslations("spaces");
  const [spaces, stats] = await Promise.all([
    listSpaces({ sort: "activity", verified: true, limit: INITIAL_SPACE_LIMIT }),
    getPlatformStats(),
  ]);

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <SectionHeading
        eyebrow={tSpaces("eyebrow")}
        title={tSpaces("title")}
        description={tSpaces("description")}
      />
      <div className="mt-10">
        <SpacesBrowser spaces={spaces} totalSpacesCount={stats.spacesCount} />
      </div>
    </section>
  );
}
