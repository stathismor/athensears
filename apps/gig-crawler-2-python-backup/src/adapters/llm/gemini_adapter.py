"""Google Gemini LLM adapter."""
import json
import google.generativeai as genai
from typing import List
from ...ports.llm_port import LLMPort
from ...models.search_result import SearchResult
from ...models.scraped_content import ScrapedContent
from ...models.gig import Gig
from ...utils.logger import setup_logger
from ...utils.retry import async_retry

logger = setup_logger(__name__)


class GeminiLLMAdapter(LLMPort):
    """Google Gemini LLM implementation."""

    def __init__(self, api_key: str, model: str = "gemini-1.5-flash"):
        """Initialize Gemini client.

        Args:
            api_key: Google Gemini API key
            model: Model name (gemini-1.5-flash or gemini-1.5-pro)
        """
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(
            model,
            generation_config={
                "temperature": 0.1,
                "response_mime_type": "application/json",
            },
        )

    @async_retry(max_attempts=3, exceptions=(Exception,))
    async def filter_promising_urls(
        self, search_results: List[SearchResult]
    ) -> List[str]:
        """Filter search results to promising URLs (Pass 1).

        Args:
            search_results: List of search results from web search

        Returns:
            List of promising URLs to scrape
        """
        from ...prompts.url_filter import URL_FILTER_PROMPT

        logger.info(f"Filtering {len(search_results)} search results with Gemini")

        # Format search results for prompt
        results_text = "\n\n".join(
            f"URL: {r.url}\nTitle: {r.title}\nDescription: {r.description or 'N/A'}"
            for r in search_results
        )

        prompt = URL_FILTER_PROMPT.format(search_results=results_text)

        response = await self.model.generate_content_async(prompt)

        try:
            data = json.loads(response.text)
            urls = data.get("promising_urls", [])
            logger.info(f"Filtered to {len(urls)} promising URLs")
            return urls
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response: {e}")
            logger.error(f"Response text: {response.text}")
            return []

    @async_retry(max_attempts=3, exceptions=(Exception,))
    async def extract_gigs_from_content(
        self, scraped_content: ScrapedContent
    ) -> List[Gig]:
        """Extract structured gig data from scraped content (Pass 2).

        Args:
            scraped_content: Scraped content from a URL

        Returns:
            List of extracted gigs
        """
        from ...prompts.gig_extraction import GIG_EXTRACTION_PROMPT

        if not scraped_content.success or not scraped_content.text:
            logger.warning(f"Skipping extraction for {scraped_content.url} (no text)")
            return []

        logger.info(f"Extracting gigs from {scraped_content.url}")

        # Truncate text if too long (to avoid token limits)
        text = scraped_content.text[:50000]

        prompt = GIG_EXTRACTION_PROMPT.format(
            url=scraped_content.url,
            content=text,
        )

        response = await self.model.generate_content_async(prompt)

        try:
            data = json.loads(response.text)
            gigs_data = data.get("gigs", [])

            gigs = []
            for gig_data in gigs_data:
                try:
                    # Parse date
                    from ...utils.date_utils import parse_flexible_date
                    date = parse_flexible_date(gig_data.get("date", ""))

                    if not date:
                        logger.warning(f"Skipping gig with invalid date: {gig_data}")
                        continue

                    gig = Gig(
                        title=gig_data.get("title", ""),
                        date=date,
                        venue_name=gig_data.get("venue_name", "Unknown Venue"),
                        description=gig_data.get("description"),
                        price=gig_data.get("price"),
                        url=scraped_content.url,
                        image_url=gig_data.get("image_url"),
                    )
                    gigs.append(gig)
                except Exception as e:
                    logger.warning(f"Failed to parse gig: {e} - {gig_data}")
                    continue

            logger.info(f"Extracted {len(gigs)} gigs from {scraped_content.url}")
            return gigs

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response: {e}")
            logger.error(f"Response text: {response.text}")
            return []
