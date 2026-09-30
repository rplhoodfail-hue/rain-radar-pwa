import { createServerFn } from "@tanstack/react-start";

export interface BmkgNewsItem {
  title: string;
  link: string;
  description: string;
  publishedAt: string;
}

function textBetween(source: string, tag: string): string {
  const match = source.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return (match?.[1] ?? "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export const getBmkgNews = createServerFn({ method: "GET" }).handler(async () => {
  const response = await fetch("https://www.bmkg.go.id/alerts/nowcast/id/rss.xml", {
    headers: { Accept: "application/rss+xml, application/xml" },
  });
  if (!response.ok) throw new Error(`Kabar BMKG tidak tersedia (${response.status})`);

  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 6).map((match) => {
    const item = match[1] ?? "";
    return {
      title: textBetween(item, "title"),
      link: textBetween(item, "link"),
      description: textBetween(item, "description"),
      publishedAt: textBetween(item, "pubDate"),
    } satisfies BmkgNewsItem;
  });
});