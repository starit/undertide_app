import { SectionHeading } from "@/components/section-heading";
import { SpacesBrowser } from "@/components/spaces-browser";

export default function SpacesPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <SectionHeading
        eyebrow="Spaces"
        title="Navigate protocol governance hubs."
        description="Search governance spaces by category, verification, activity, or follower scale, then drill into protocol-specific proposal streams."
      />
      <div className="mt-10">
        <SpacesBrowser />
      </div>
    </section>
  );
}
