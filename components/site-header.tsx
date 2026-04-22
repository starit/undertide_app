import { getTranslations } from "next-intl/server";
import { SiteHeaderClient } from "@/components/site-header-client";

export async function SiteHeader() {
  const tNav = await getTranslations("nav");
  const navItems = [
    { href: "/", label: tNav("home") },
    { href: "/spaces", label: tNav("spaces") },
    { href: "/proposals", label: tNav("proposals") },
    { href: "/search", label: tNav("search") },
    { href: "/about", label: tNav("about") },
  ];

  return <SiteHeaderClient navItems={navItems} governanceLabel={tNav("governanceIntelligence")} />;
}
