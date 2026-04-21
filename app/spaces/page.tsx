import { listSpaces } from "@/lib/repository";
import { SectionHeading } from "@/components/section-heading";
import { SpacesBrowser } from "@/components/spaces-browser";

const INITIAL_SPACE_LIMIT = 200;

export default async function SpacesPage() {
  const spaces = await listSpaces({ sort: "activity", limit: INITIAL_SPACE_LIMIT });

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <SectionHeading
        eyebrow="Spaces"
        title="Navigate protocol governance hubs."
        description="Search governance spaces by category, verification, activity, or follower scale, then drill into protocol-specific proposal streams. The initial view is capped to a fast, curated slice."
      />
      <div className="mt-10">
        <SpacesBrowser spaces={spaces} />
      </div>
    </section>
  );
}
