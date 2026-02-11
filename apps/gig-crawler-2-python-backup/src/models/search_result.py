"""Search result models for Pass 1."""
from typing import Optional
from pydantic import BaseModel


class SearchResult(BaseModel):
    """Search result from Brave Web Search API."""
    url: str
    title: str
    description: Optional[str] = None
