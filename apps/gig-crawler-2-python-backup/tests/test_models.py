"""Test data models."""
import pytest
from datetime import datetime
from src.models.gig import Gig, StrapiGig
from src.models.venue import Venue, StrapiVenue
from src.models.search_result import SearchResult
from src.models.scraped_content import ScrapedContent


def test_gig_model():
    """Test Gig model creation."""
    gig = Gig(
        title="Test Concert",
        date=datetime(2026, 2, 15, 20, 0, 0),
        venue_name="Test Venue",
        description="Test description",
        price="€15",
        url="https://example.com/event",
    )
    assert gig.title == "Test Concert"
    assert gig.venue_name == "Test Venue"


def test_strapi_gig_conversion():
    """Test Gig to Strapi format conversion."""
    gig = Gig(
        title="Test Concert",
        date=datetime(2026, 2, 15, 20, 0, 0),
        venue_name="Test Venue",
    )
    strapi_gig = StrapiGig.from_gig(gig, venue_id=1)
    assert strapi_gig.data["title"] == "Test Concert"
    assert strapi_gig.data["venue"] == 1


def test_venue_model():
    """Test Venue model creation."""
    venue = Venue(
        name="Test Venue",
        address="123 Test St",
        website="https://example.com",
    )
    assert venue.name == "Test Venue"


def test_search_result_model():
    """Test SearchResult model."""
    result = SearchResult(
        url="https://example.com",
        title="Test Result",
        description="Test description",
    )
    assert result.url == "https://example.com"


def test_scraped_content_model():
    """Test ScrapedContent model."""
    content = ScrapedContent(
        url="https://example.com",
        text="Scraped text content",
        success=True,
    )
    assert content.success is True
    assert content.text == "Scraped text content"
