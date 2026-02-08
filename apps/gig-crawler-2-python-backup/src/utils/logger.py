"""Logging configuration."""
import logging
import sys
from typing import Optional

from ..config import settings


def setup_logger(name: Optional[str] = None) -> logging.Logger:
    """Set up logger with configured level and format."""
    logger = logging.getLogger(name or __name__)

    if logger.handlers:
        return logger

    logger.setLevel(getattr(logging, settings.log_level.upper()))

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(getattr(logging, settings.log_level.upper()))

    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)

    logger.addHandler(handler)
    return logger
