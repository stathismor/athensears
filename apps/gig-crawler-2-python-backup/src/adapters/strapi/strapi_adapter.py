"""Strapi CMS HTTP client adapter."""
import httpx
from typing import Optional, List
from datetime import datetime
from ...ports.gigs_port import GigsPort
from ...models.gig import Gig, StrapiGig
from ...models.venue import Venue, StrapiVenue
from ...models.strapi import StrapiResponse, StrapiEntity
from ...utils.logger import setup_logger
from ...utils.retry import async_retry

logger = setup_logger(__name__)


class StrapiAdapter(GigsPort):
    """Strapi CMS HTTP client implementation."""

    def __init__(self, api_url: str, api_token: str):
        """Initialize Strapi client.

        Args:
            api_url: Strapi API base URL
            api_token: Strapi API token
        """
        self.api_url = api_url.rstrip("/")
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "Authorization": f"Bearer {api_token}",
                "Content-Type": "application/json",
            },
        )
        # In-memory cache for venues
        self._venue_cache: dict[str, int] = {}

    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()

    @async_retry(max_attempts=3, exceptions=(httpx.HTTPError,))
    async def find_venue_by_name(self, name: str) -> Optional[tuple[int, Venue]]:
        """Find venue by name.

        Args:
            name: Venue name to search for

        Returns:
            Tuple of (venue_id, venue) if found, None otherwise
        """
        # Check cache first
        if name in self._venue_cache:
            logger.debug(f"Venue '{name}' found in cache: {self._venue_cache[name]}")
            # Return cached ID with minimal venue object
            return (self._venue_cache[name], Venue(name=name))

        url = f"{self.api_url}/api/venues"
        params = {"filters[name][$eq]": name}

        response = await self.client.get(url, params=params)
        response.raise_for_status()

        strapi_response = StrapiResponse(**response.json())

        if isinstance(strapi_response.data, list) and len(strapi_response.data) > 0:
            entity = strapi_response.data[0]
            venue = Venue(
                name=entity.attributes.get("name", ""),
                address=entity.attributes.get("address"),
                website=entity.attributes.get("website"),
            )
            # Cache the result
            self._venue_cache[name] = entity.id
            logger.info(f"Found venue '{name}' with ID {entity.id}")
            return (entity.id, venue)

        return None

    @async_retry(max_attempts=3, exceptions=(httpx.HTTPError,))
    async def create_venue(self, venue: Venue) -> int:
        """Create a new venue.

        Args:
            venue: Venue to create

        Returns:
            ID of created venue
        """
        url = f"{self.api_url}/api/venues"
        strapi_venue = StrapiVenue.from_venue(venue)

        response = await self.client.post(url, json=strapi_venue.model_dump())
        response.raise_for_status()

        strapi_response = StrapiResponse(**response.json())

        if isinstance(strapi_response.data, StrapiEntity):
            venue_id = strapi_response.data.id
            # Cache the new venue
            self._venue_cache[venue.name] = venue_id
            logger.info(f"Created venue '{venue.name}' with ID {venue_id}")
            return venue_id

        raise ValueError("Failed to create venue: unexpected response format")

    @async_retry(max_attempts=3, exceptions=(httpx.HTTPError,))
    async def find_gig(self, title: str, date: datetime) -> Optional[int]:
        """Check if gig already exists.

        Args:
            title: Gig title
            date: Gig date

        Returns:
            Gig ID if exists, None otherwise
        """
        url = f"{self.api_url}/api/gigs"

        # Format date for Strapi filter
        date_str = date.strftime("%Y-%m-%d")

        params = {
            "filters[title][$eq]": title,
            "filters[date][$gte]": date_str,
            "filters[date][$lte]": date_str,
        }

        response = await self.client.get(url, params=params)
        response.raise_for_status()

        strapi_response = StrapiResponse(**response.json())

        if isinstance(strapi_response.data, list) and len(strapi_response.data) > 0:
            gig_id = strapi_response.data[0].id
            logger.info(f"Found existing gig '{title}' on {date_str} with ID {gig_id}")
            return gig_id

        return None

    @async_retry(max_attempts=3, exceptions=(httpx.HTTPError,))
    async def create_gig(self, gig: Gig, venue_id: int) -> int:
        """Create a new gig.

        Args:
            gig: Gig to create
            venue_id: ID of the venue

        Returns:
            ID of created gig
        """
        url = f"{self.api_url}/api/gigs"
        strapi_gig = StrapiGig.from_gig(gig, venue_id)

        response = await self.client.post(url, json=strapi_gig.model_dump())
        response.raise_for_status()

        strapi_response = StrapiResponse(**response.json())

        if isinstance(strapi_response.data, StrapiEntity):
            gig_id = strapi_response.data.id
            logger.info(f"Created gig '{gig.title}' on {gig.date} with ID {gig_id}")
            return gig_id

        raise ValueError("Failed to create gig: unexpected response format")

    async def get_or_create_venue(self, venue_name: str) -> int:
        """Get existing venue ID or create new venue.

        Args:
            venue_name: Name of the venue

        Returns:
            Venue ID
        """
        # Try to find existing venue
        result = await self.find_venue_by_name(venue_name)
        if result:
            return result[0]

        # Create new venue
        venue = Venue(name=venue_name)
        return await self.create_venue(venue)
