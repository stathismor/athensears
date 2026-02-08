"""Strapi API response models."""
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel


class StrapiEntity(BaseModel):
    """Single entity from Strapi."""
    id: int
    attributes: Dict[str, Any]


class StrapiResponse(BaseModel):
    """Response from Strapi API."""
    data: Optional[Union[StrapiEntity, List[StrapiEntity]]] = None
    meta: Optional[Dict[str, Any]] = None
