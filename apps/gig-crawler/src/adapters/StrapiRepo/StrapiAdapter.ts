import axios, { type AxiosInstance } from "axios";
import type { GigsPort } from "../../ports/GigsPort.js";
import type { Gig } from "../../models/gig.js";
import type { Venue } from "../../models/venue.js";
import { toStrapiGig } from "../../models/gig.js";
import { toStrapiVenue } from "../../models/venue.js";
import { StrapiVenueResponseSchema, StrapiGigResponseSchema } from "../../models/strapi.js";
import { logger } from "../../utils/logger.js";
import { retry } from "../../utils/retry.js";
import { env } from "../../models/env.js";

export class StrapiAdapter implements GigsPort {
  private readonly client: AxiosInstance;
  private readonly venueCache: Map<string, number> = new Map();

  constructor(
    apiUrl: string = env.STRAPI_API_URL,
    apiToken: string = env.STRAPI_API_TOKEN
  ) {
    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  async findVenueByName(
    name: string
  ): Promise<{ id: number; venue: Venue } | null> {
    // Check cache first (case-insensitive)
    const cacheKey = name.toLowerCase();
    if (this.venueCache.has(cacheKey)) {
      const id = this.venueCache.get(cacheKey)!;
      logger.debug({ name, id }, "Venue found in cache");
      return { id, venue: { name } };
    }

    return retry(
      async () => {
        const response = await this.client.get("/api/venues", {
          params: {
            "filters[name][$eqi]": name,
          },
        });

        const parsed = StrapiVenueResponseSchema.parse(response.data);

        if (Array.isArray(parsed.data) && parsed.data.length > 0) {
          const entity = parsed.data[0];
          const venue: Venue = {
            name: entity.name,
            address: entity.address ?? undefined,
            website: entity.website ?? undefined,
          };

          // Cache the result (case-insensitive key)
          this.venueCache.set(cacheKey, entity.id);
          logger.info({ name, id: entity.id }, "Found venue");
          return { id: entity.id, venue };
        }

        return null;
      },
      {
        maxAttempts: 3,
        onError: (error, attempt) => {
          logger.warn({ error, attempt, name }, "Find venue attempt failed");
        },
      }
    );
  }

  async createVenue(venue: Venue): Promise<number> {
    return retry(
      async () => {
        const strapiVenue = toStrapiVenue(venue);
        const response = await this.client.post("/api/venues", strapiVenue);

        const parsed = StrapiVenueResponseSchema.parse(response.data);

        if (parsed.data && !Array.isArray(parsed.data)) {
          const id = parsed.data.id;
          // Cache the new venue (case-insensitive key)
          this.venueCache.set(venue.name.toLowerCase(), id);
          logger.info({ name: venue.name, id }, "Created venue");
          return id;
        }

        throw new Error("Failed to create venue: unexpected response format");
      },
      {
        maxAttempts: 3,
        onError: (error, attempt) => {
          logger.warn(
            { error, attempt, venue: venue.name },
            "Create venue attempt failed"
          );
        },
      }
    );
  }

  async findGig(title: string, date: Date): Promise<number | null> {
    return retry(
      async () => {
        const dateStr = date.toISOString().split("T")[0];

        const response = await this.client.get("/api/gigs", {
          params: {
            "filters[title][$eqi]": title,
            "filters[date][$gte]": `${dateStr}T00:00:00.000Z`,
            "filters[date][$lte]": `${dateStr}T23:59:59.999Z`,
          },
        });

        const parsed = StrapiGigResponseSchema.parse(response.data);

        if (Array.isArray(parsed.data) && parsed.data.length > 0) {
          const id = parsed.data[0].id;
          logger.info({ title, date: dateStr, id }, "Found existing gig");
          return id;
        }

        return null;
      },
      {
        maxAttempts: 3,
        onError: (error, attempt) => {
          logger.warn({ error, attempt, title }, "Find gig attempt failed");
        },
      }
    );
  }

  async createGig(gig: Gig, venueId: number): Promise<number> {
    return retry(
      async () => {
        const strapiGig = toStrapiGig(gig, venueId);
        const response = await this.client.post("/api/gigs", strapiGig);

        const parsed = StrapiGigResponseSchema.parse(response.data);

        if (parsed.data && !Array.isArray(parsed.data)) {
          const id = parsed.data.id;
          logger.info(
            { title: gig.title, date: gig.date, id },
            "Created gig"
          );
          return id;
        }

        throw new Error("Failed to create gig: unexpected response format");
      },
      {
        maxAttempts: 3,
        onError: (error, attempt) => {
          // Extract detailed error info from Axios errors
          let errorDetail = error;
          if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as any;
            errorDetail = {
              status: axiosError.response?.status,
              statusText: axiosError.response?.statusText,
              data: axiosError.response?.data,
              message: axiosError.message,
            };
          }
          logger.warn(
            { error: errorDetail, attempt, gig: gig.title, gigData: toStrapiGig(gig, venueId) },
            "Create gig attempt failed"
          );
        },
      }
    );
  }

  async getOrCreateVenue(venueName: string): Promise<number> {
    const existing = await this.findVenueByName(venueName);
    if (existing) {
      return existing.id;
    }

    const venue: Venue = { name: venueName };
    return await this.createVenue(venue);
  }

  async deleteAllGigs(): Promise<number> {
    return retry(
      async () => {
        try {
          // Try custom bulk endpoint first (more efficient)
          logger.info("Deleting all gigs using bulk endpoint");
          const response = await this.client.post("/api/gigs/deleteAll");
          const deletedCount = response.data.data.deleted;
          logger.info({ deletedCount }, "Deleted all gigs via bulk endpoint");
          return deletedCount;
        } catch (error: any) {
          // Fallback to individual deletes if bulk endpoint not available (405) or forbidden (403)
          if (error.response?.status === 405 || error.response?.status === 403) {
            logger.info(
              { status: error.response?.status },
              "Bulk endpoint not available, falling back to individual deletes"
            );
            return await this.deleteAllGigsIndividual();
          }
          throw error;
        }
      },
      {
        maxAttempts: 3,
        onError: (error, attempt) => {
          logger.warn({ error, attempt }, "Delete all gigs attempt failed");
        },
      }
    );
  }

  private async deleteAllGigsIndividual(): Promise<number> {
    logger.info("Fetching all gigs to delete individually");

    const response = await this.client.get("/api/gigs", {
      params: {
        "pagination[pageSize]": 100,
      },
    });

    const data = response.data;
    const gigs = Array.isArray(data.data) ? data.data : [];

    logger.info({ count: gigs.length }, "Deleting gigs individually");

    let deletedCount = 0;

    for (const gig of gigs) {
      try {
        logger.info({ id: gig.id, documentId: gig.documentId }, "Deleting gig");
        const deleteResponse = await this.client.delete(`/api/gigs/${gig.documentId}`);
        logger.info({ id: gig.id, documentId: gig.documentId, status: deleteResponse.status }, "Gig deleted");
        deletedCount++;
      } catch (error) {
        logger.error({ id: gig.id, documentId: gig.documentId, error }, "Failed to delete gig");
      }
    }

    // Handle pagination if there are more than 100 gigs
    const pagination = data.meta?.pagination;
    const totalCount = pagination?.total || gigs.length;
    if (totalCount > 100) {
      logger.info(
        { total: totalCount, deleted: deletedCount },
        "More gigs to delete, fetching next page"
      );
      const remainingCount = await this.deleteAllGigsIndividual();
      deletedCount += remainingCount;
    }

    logger.info({ deletedCount }, "Deleted all gigs individually");
    return deletedCount;
  }
}
