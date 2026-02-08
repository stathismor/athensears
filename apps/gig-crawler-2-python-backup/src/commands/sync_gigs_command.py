"""Sync gigs command - orchestrates two-pass workflow."""
from typing import Dict, Any
from ..ports.search_port import SearchPort
from ..ports.scraper_port import ScraperPort
from ..ports.llm_port import LLMPort
from ..ports.gigs_port import GigsPort
from ..utils.logger import setup_logger
from ..utils.date_utils import get_date_range_query

logger = setup_logger(__name__)


class SyncGigsCommand:
    """Command to sync gigs using two-pass approach."""

    def __init__(
        self,
        search: SearchPort,
        scraper: ScraperPort,
        llm: LLMPort,
        gigs: GigsPort,
    ):
        """Initialize command with dependencies.

        Args:
            search: Search adapter (Brave)
            scraper: Scraper adapter (trafilatura)
            llm: LLM adapter (Gemini)
            gigs: Gigs repository (Strapi)
        """
        self.search = search
        self.scraper = scraper
        self.llm = llm
        self.gigs = gigs

    async def execute(self) -> Dict[str, Any]:
        """Execute two-pass sync workflow.

        Returns:
            Dictionary with sync statistics
        """
        logger.info("Starting gig sync (two-pass approach)")

        stats = {
            "search_results": 0,
            "filtered_urls": 0,
            "scraped_urls": 0,
            "gigs_extracted": 0,
            "gigs_created": 0,
            "gigs_skipped": 0,
            "errors": 0,
        }

        try:
            # PASS 1: Search → Filter URLs
            logger.info("=== PASS 1: Discovery ===")

            # Step 1: Search with Brave
            date_range = get_date_range_query(days_ahead=30)
            query = f"live music events concerts gigs Athens Greece {date_range}"

            search_results = await self.search.search(query, count=20)
            stats["search_results"] = len(search_results)
            logger.info(f"Found {len(search_results)} search results")

            if not search_results:
                logger.warning("No search results found, aborting sync")
                return stats

            # Step 2: Filter promising URLs with Gemini
            promising_urls = await self.llm.filter_promising_urls(search_results)
            stats["filtered_urls"] = len(promising_urls)
            logger.info(f"Filtered to {len(promising_urls)} promising URLs")

            if not promising_urls:
                logger.warning("No promising URLs found, aborting sync")
                return stats

            # PASS 2: Scrape → Extract → Store
            logger.info("=== PASS 2: Extraction ===")

            # Step 3: Scrape URLs with trafilatura
            scraped_contents = await self.scraper.scrape_many(promising_urls)
            successful_scrapes = [sc for sc in scraped_contents if sc.success]
            stats["scraped_urls"] = len(successful_scrapes)
            logger.info(f"Successfully scraped {len(successful_scrapes)} URLs")

            # Step 4: Extract gigs from each scraped page
            all_gigs = []
            for scraped_content in successful_scrapes:
                try:
                    gigs = await self.llm.extract_gigs_from_content(scraped_content)
                    all_gigs.extend(gigs)
                except Exception as e:
                    logger.error(f"Failed to extract gigs from {scraped_content.url}: {e}")
                    stats["errors"] += 1

            stats["gigs_extracted"] = len(all_gigs)
            logger.info(f"Extracted {len(all_gigs)} total gigs")

            if not all_gigs:
                logger.warning("No gigs extracted, sync complete")
                return stats

            # Step 5: Store gigs in Strapi (with deduplication)
            for gig in all_gigs:
                try:
                    # Check if gig already exists
                    existing_gig_id = await self.gigs.find_gig(gig.title, gig.date)
                    if existing_gig_id:
                        logger.info(f"Skipping duplicate gig: {gig.title} on {gig.date}")
                        stats["gigs_skipped"] += 1
                        continue

                    # Get or create venue
                    venue_id = await self.gigs.get_or_create_venue(gig.venue_name)

                    # Create gig
                    gig_id = await self.gigs.create_gig(gig, venue_id)
                    logger.info(f"Created gig {gig_id}: {gig.title} on {gig.date}")
                    stats["gigs_created"] += 1

                except Exception as e:
                    logger.error(f"Failed to store gig '{gig.title}': {e}")
                    stats["errors"] += 1

            logger.info("=== Sync Complete ===")
            logger.info(f"Search results: {stats['search_results']}")
            logger.info(f"Filtered URLs: {stats['filtered_urls']}")
            logger.info(f"Scraped URLs: {stats['scraped_urls']}")
            logger.info(f"Gigs extracted: {stats['gigs_extracted']}")
            logger.info(f"Gigs created: {stats['gigs_created']}")
            logger.info(f"Gigs skipped (duplicates): {stats['gigs_skipped']}")
            logger.info(f"Errors: {stats['errors']}")

            return stats

        except Exception as e:
            logger.error(f"Fatal error during sync: {e}")
            stats["errors"] += 1
            raise
