import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideArticleShell } from "@/components/guide-article";
import { GUIDE_BODIES } from "@/content/guides";
import { GUIDES, getGuide, guidePath } from "@/lib/guides";
import { SITE_URL } from "@/lib/site-url";

/** Optional AdSense slot — only renders when NEXT_PUBLIC_ADSENSE_ENABLED=true. */
const GUIDE_AD_SLOT = process.env.NEXT_PUBLIC_ADSENSE_GUIDE_SLOT;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return { title: "Guide not found" };

  const canonical = guidePath(guide.slug);
  return {
    title: guide.title,
    description: guide.description,
    keywords: guide.keywords,
    alternates: { canonical },
    openGraph: {
      title: `${guide.title} | CoasterTrak`,
      description: guide.description,
      url: `${SITE_URL}${canonical}`,
      type: "article",
      publishedTime: guide.published,
    },
    twitter: {
      card: "summary_large_image",
      title: `${guide.title} | CoasterTrak`,
      description: guide.description,
    },
  };
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params;
  const guide = getGuide(slug);
  const body = GUIDE_BODIES[slug];
  if (!guide || !body) notFound();

  return (
    <GuideArticleShell guide={guide} adSlot={GUIDE_AD_SLOT || undefined}>
      {body}
    </GuideArticleShell>
  );
}
