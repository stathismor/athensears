"""Brave Web Search API adapter."""
import httpx
from typing import List
from ...ports.search_port import SearchPort
from ...models.search_result import SearchResult
from ...utils.logger import setup_logger
from ...utils.retry import async_retry

logger = setup_logger(__name__)


class BraveSearchAdapter(SearchPort):
    """Brave Web Search API implementation."""

    BASE_URL = "https://api.search.brave.com/res/v1/web/search"

    def __init__(self, api_key: str):
        """Initialize with API key.

        Args:
            api_key: Brave API key
        """
        self.api_key = api_key
        self.client = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()

    @async_retry(max_attempts=3, exceptions=(httpx.HTTPError,))
    async def search(self, query: str, count: int = 20) -> List[SearchResult]:
        """Search the web using Brave Web Search API.

        Args:
            query: Search query string
            count: Number of results to return (max 20)

        Returns:
            List of search results
        """
        logger.info(f"Searching Brave for: {query}")

        headers = {
            "Accept": "application/json",
            "X-Subscription-Token": self.api_key,
        }

        params = {
            "q": query,
            "count": min(count, 20),
        }

        response = await self.client.get(
            self.BASE_URL,
            headers=headers,
            params=params,
        )
        response.raise_for_status()

        data = response.json()
        results = []

        # Parse web results
        web_results = data.get("web", {}).get("results", [])
        for result in web_results:
            results.append(
                SearchResult(
                    url=result.get("url", ""),
                    title=result.get("title", ""),
                    description=result.get("description"),
                )
            )

        logger.info(f"Found {len(results)} search results")
        return results
