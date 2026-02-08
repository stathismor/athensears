"""FastAPI server with APScheduler for gig-crawler-2."""
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz

from .config import settings
from .utils.logger import setup_logger
from .adapters.brave_search.brave_search_adapter import BraveSearchAdapter
from .adapters.content_scraper.trafilatura_adapter import TrafilaturaAdapter
from .adapters.llm.gemini_adapter import GeminiLLMAdapter
from .adapters.strapi.strapi_adapter import StrapiAdapter
from .commands.sync_gigs_command import SyncGigsCommand
from . import __version__

logger = setup_logger(__name__)

# Global adapters (initialized in lifespan)
search_adapter = None
scraper_adapter = None
llm_adapter = None
gigs_adapter = None
scheduler = None


async def sync_gigs():
    """Execute gig sync workflow."""
    try:
        logger.info("Starting scheduled gig sync")

        command = SyncGigsCommand(
            search=search_adapter,
            scraper=scraper_adapter,
            llm=llm_adapter,
            gigs=gigs_adapter,
        )

        stats = await command.execute()
        logger.info(f"Sync completed successfully: {stats}")

    except Exception as e:
        logger.error(f"Sync failed: {e}", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown."""
    global search_adapter, scraper_adapter, llm_adapter, gigs_adapter, scheduler

    # Startup
    logger.info("Starting gig-crawler-2 service")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"Strapi API: {settings.strapi_api_url}")
    logger.info(f"Gemini Model: {settings.gemini_model}")
    logger.info(f"Cron Schedule: {settings.cron_schedule}")

    # Initialize adapters
    search_adapter = BraveSearchAdapter(api_key=settings.brave_api_key)
    scraper_adapter = TrafilaturaAdapter()
    llm_adapter = GeminiLLMAdapter(
        api_key=settings.gemini_api_key,
        model=settings.gemini_model,
    )
    gigs_adapter = StrapiAdapter(
        api_url=settings.strapi_api_url,
        api_token=settings.strapi_api_token,
    )

    # Initialize scheduler
    scheduler = AsyncIOScheduler(timezone=pytz.timezone(settings.timezone))

    # Add cron job
    trigger = CronTrigger.from_crontab(settings.cron_schedule)
    scheduler.add_job(
        sync_gigs,
        trigger=trigger,
        id="sync_gigs",
        name="Sync Gigs",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started")

    yield

    # Shutdown
    logger.info("Shutting down gig-crawler-2 service")

    if scheduler:
        scheduler.shutdown()

    if search_adapter:
        await search_adapter.close()
    if scraper_adapter:
        await scraper_adapter.close()
    if gigs_adapter:
        await gigs_adapter.close()


app = FastAPI(
    title="Gig Crawler 2",
    description="Athens music events crawler with two-pass architecture",
    version=__version__,
    lifespan=lifespan,
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return JSONResponse(
        content={
            "status": "ok",
            "service": "gig-crawler-2",
            "version": __version__,
            "environment": settings.environment,
        }
    )


@app.post("/api/sync")
async def manual_sync():
    """Manual sync endpoint."""
    try:
        logger.info("Manual sync triggered via API")

        command = SyncGigsCommand(
            search=search_adapter,
            scraper=scraper_adapter,
            llm=llm_adapter,
            gigs=gigs_adapter,
        )

        stats = await command.execute()

        return JSONResponse(
            content={
                "status": "success",
                "message": "Sync completed successfully",
                "stats": stats,
            }
        )

    except Exception as e:
        logger.error(f"Manual sync failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    """Root endpoint."""
    return JSONResponse(
        content={
            "service": "gig-crawler-2",
            "version": __version__,
            "endpoints": {
                "health": "/health",
                "sync": "/api/sync (POST)",
            },
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.environment == "development",
    )
