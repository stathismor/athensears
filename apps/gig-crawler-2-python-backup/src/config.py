"""Configuration management using Pydantic settings."""
from pydantic import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables."""

    # Strapi CMS
    strapi_api_url: str = "http://localhost:1337"
    strapi_api_token: str

    # Brave Web Search API
    brave_api_key: str

    # Google Gemini API
    gemini_api_key: str
    gemini_model: str = "gemini-1.5-flash"

    # Server
    port: int = 3001
    environment: str = "development"

    # Cron
    cron_schedule: str = "0 2 * * *"
    timezone: str = "Europe/Athens"

    # Logging
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


settings = Settings()
