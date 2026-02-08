"""Scraped content models for Pass 2."""
from typing import Optional
from pydantic import BaseModel


class ScrapedContent(BaseModel):
    """Scraped content from trafilatura."""
    url: str
    text: Optional[str] = None
    raw_html: Optional[str] = None
    success: bool = True
    error: Optional[str] = None
