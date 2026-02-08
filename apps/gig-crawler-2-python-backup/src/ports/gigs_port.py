"""Gigs repository port interface."""
from abc import ABC, abstractmethod
from typing import Optional, List
from datetime import datetime
from ..models.gig import Gig
from ..models.venue import Venue


class GigsPort(ABC):
    """Abstract interface for gigs repository (Strapi)."""

    @abstractmethod
    async def find_venue_by_name(self, name: str) -> Optional[tuple[int, Venue]]:
        """Find venue by name.

        Args:
            name: Venue name to search for

        Returns:
            Tuple of (venue_id, venue) if found, None otherwise
        """
        pass

    @abstractmethod
    async def create_venue(self, venue: Venue) -> int:
        """Create a new venue.

        Args:
            venue: Venue to create

        Returns:
            ID of created venue
        """
        pass

    @abstractmethod
    async def find_gig(self, title: str, date: datetime) -> Optional[int]:
        """Check if gig already exists.

        Args:
            title: Gig title
            date: Gig date

        Returns:
            Gig ID if exists, None otherwise
        """
        pass

    @abstractmethod
    async def create_gig(self, gig: Gig, venue_id: int) -> int:
        """Create a new gig.

        Args:
            gig: Gig to create
            venue_id: ID of the venue

        Returns:
            ID of created gig
        """
        pass

    @abstractmethod
    async def get_or_create_venue(self, venue_name: str) -> int:
        """Get existing venue ID or create new venue.

        Args:
            venue_name: Name of the venue

        Returns:
            Venue ID
        """
        pass
