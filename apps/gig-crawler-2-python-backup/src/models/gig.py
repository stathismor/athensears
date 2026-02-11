"""Gig models matching Strapi schema."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class Gig(BaseModel):
    """Gig model for business logic."""
    title: str
    date: datetime
    venue_name: str
    description: Optional[str] = None
    price: Optional[str] = None
    url: Optional[str] = None
    image_url: Optional[str] = None


class StrapiGig(BaseModel):
    """Gig model for Strapi API."""
    data: dict = Field(...)

    @classmethod
    def from_gig(cls, gig: Gig, venue_id: int) -> "StrapiGig":
        """Convert Gig to Strapi format."""
        return cls(
            data={
                "title": gig.title,
                "date": gig.date.isoformat(),
                "venue": venue_id,
                "description": gig.description,
                "price": gig.price,
                "url": gig.url,
                "imageUrl": gig.image_url,
            }
        )
