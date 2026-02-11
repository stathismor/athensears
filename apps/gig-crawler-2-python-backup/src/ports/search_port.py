"""Search port interface."""
from abc import ABC, abstractmethod
from typing import List
from ..models.search_result import SearchResult


class SearchPort(ABC):
    """Abstract interface for web search."""

    @abstractmethod
    async def search(self, query: str, count: int = 20) -> List[SearchResult]:
        """Search the web for given query.

        Args:
            query: Search query string
            count: Number of results to return

        Returns:
            List of search results with URLs, titles, and descriptions
        """
        pass
