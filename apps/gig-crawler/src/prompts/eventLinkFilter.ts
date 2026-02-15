export const EVENT_LINK_FILTER_PROMPT = (
  links: string[],
  pageContext: { url: string; title?: string }
) => `You are analyzing links extracted from an event listing page.

SOURCE PAGE:
- URL: ${pageContext.url}
- Title: ${pageContext.title || "N/A"}

EXTRACTED LINKS (${links.length} total):
${links.map((link, i) => `${i + 1}. ${link}`).join("\n")}

TASK:
Identify which links point to INDIVIDUAL EVENT DETAIL PAGES (not listing pages, calendars, or navigation).

EVENT DETAIL PAGE characteristics:
- Single event/concert/gig page
- Usually contains: /event/, /concert/, /gig/, /show/, or numeric ID
- NOT: /agenda/, /calendar/, /events (plural), /archive/, /category/
- NOT: navigation, homepage, about, contact, social media
- NOT: ticket marketplace (external sites)

LISTING PAGE characteristics (exclude these):
- Multiple events on one page
- Calendar views, agenda pages
- Archive pages, past events
- Category/genre pages

OUTPUT FORMAT:
{
  "event_detail_urls": [
    "https://example.com/event/band-name",
    "https://example.com/concert/123"
  ]
}

Return 0-20 URLs. Prefer quality over quantity. If unsure, exclude the link.`;
