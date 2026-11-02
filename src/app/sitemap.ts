import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";


/** The public pages. The app itself (/app) is not listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const root = siteUrl().origin;
  return ["", "/grader", "/security", "/privacy", "/terms"].map((path) => ({
    url: `${root}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
