"""LLM port interface."""
from abc import ABC, abstractmethod
from typing import List
from ..models.search_result import SearchResult
from ..models.scraped_content import ScrapedContent
from ..models.gig import Gig


class LLMPort(ABC):
    """Abstract interface for LLM operations."""

    @abstractmethod
    async def filter_promising_urls(
        self, search_results: List[SearchResult]
    ) -> List[str]:
        """Filter search results to promising URLs (Pass 1).

        Args:
            search_results: List of search results from web search

        Returns:
            List of promising URLs to scrape
        """
        pass

    @abstractmethod
    async def extract_gigs_from_content(
        self, scraped_content: ScrapedContent
    ) -> List[Gig]:
        """Extract structured gig data from scraped content (Pass 2).

        Args:
            scraped_content: Scraped content from a URL

        Returns:
            List of extracted gigs
        """
        pass
