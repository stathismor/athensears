"""Venue models matching Strapi schema."""
from typing import Optional
from pydantic import BaseModel, Field


class Venue(BaseModel):
    """Venue model for business logic."""
    name: str
    address: Optional[str] = None
    website: Optional[str] = None


class StrapiVenue(BaseModel):
    """Venue model for Strapi API."""
    data: dict = Field(...)

    @classmethod
    def from_venue(cls, venue: Venue) -> "StrapiVenue":
        """Convert Venue to Strapi format."""
        return cls(
            data={
                "name": venue.name,
                "address": venue.address,
                "website": venue.website,
            }
        )
