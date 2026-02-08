"""Trafilatura web scraper adapter."""
import asyncio
import httpx
import trafilatura
from typing import List
from ...ports.scraper_port import ScraperPort
from ...models.scraped_content import ScrapedContent
from ...utils.logger import setup_logger

logger = setup_logger(__name__)


class TrafilaturaAdapter(ScraperPort):
    """Web scraper using httpx + trafilatura."""

    def __init__(self):
        """Initialize scraper."""
        self.client = httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; GigCrawler/2.0; +https://athensears.gr)"
            },
        )

    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()

    async def scrape(self, url: str) -> ScrapedContent:
        """Scrape content from a single URL.

        Args:
            url: URL to scrape

        Returns:
            Scraped content with extracted text
        """
        logger.info(f"Scraping URL: {url}")

        try:
            response = await self.client.get(url)
            response.raise_for_status()
            html = response.text

            # Extract clean text using trafilatura
            text = trafilatura.extract(
                html,
                include_comments=False,
                include_tables=True,
                no_fallback=False,
            )

            if text:
                logger.info(f"Extracted {len(text)} chars from {url}")
                return ScrapedContent(
                    url=url,
                    text=text,
                    raw_html=html,
                    success=True,
                )
            else:
                logger.warning(f"No text extracted from {url}, keeping raw HTML")
                return ScrapedContent(
                    url=url,
                    text=None,
                    raw_html=html,
                    success=True,
                )

        except Exception as e:
            logger.error(f"Failed to scrape {url}: {e}")
            return ScrapedContent(
                url=url,
                text=None,
                raw_html=None,
                success=False,
                error=str(e),
            )

    async def scrape_many(self, urls: List[str]) -> List[ScrapedContent]:
        """Scrape content from multiple URLs concurrently.

        Args:
            urls: List of URLs to scrape

        Returns:
            List of scraped content results
        """
        logger.info(f"Scraping {len(urls)} URLs concurrently")
        tasks = [self.scrape(url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=False)

        successful = sum(1 for r in results if r.success)
        logger.info(f"Scraped {successful}/{len(urls)} URLs successfully")

        return results
