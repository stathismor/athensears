"""Scraper port interface."""
from abc import ABC, abstractmethod
from typing import List
from ..models.scraped_content import ScrapedContent


class ScraperPort(ABC):
    """Abstract interface for web scraping."""

    @abstractmethod
    async def scrape(self, url: str) -> ScrapedContent:
        """Scrape content from a single URL.

        Args:
            url: URL to scrape

        Returns:
            Scraped content with extracted text
        """
        pass

    @abstractmethod
    async def scrape_many(self, urls: List[str]) -> List[ScrapedContent]:
        """Scrape content from multiple URLs concurrently.

        Args:
            urls: List of URLs to scrape

        Returns:
            List of scraped content results
        """
        pass
