import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::gig.gig', ({ strapi }) => ({
  async deleteAll(ctx) {
    try {
      // Fetch all non-manual gigs (only id for efficiency). "Not manual" means manual
      // is false OR null - a bare `$ne: true` misses NULL rows (SQL: NULL != true is
      // unknown), leaving legacy null-manual gigs undeletable.
      const entities = await strapi.db.query('api::gig.gig').findMany({
        select: ['id'],
        where: { $or: [{ manual: false }, { manual: null }] },
      });

      // Delete all gigs individually
      for (const entity of entities) {
        await strapi.db.query('api::gig.gig').delete({ where: { id: entity.id } });
      }

      return ctx.send({
        data: {
          deleted: entities.length,
          message: `Successfully deleted ${entities.length} gigs`,
        },
      });
    } catch (error) {
      ctx.throw(500, `Failed to delete gigs: ${error.message}`);
    }
  },

  /**
   * Heartbeat: mark a batch of gigs as seen by the current crawl. Refreshes lastSeenAt
   * (provenance) and re-activates any gig that was previously removed. Deliberately writes
   * the columns directly so it does NOT bump `updatedAt` - that timestamp is reserved for
   * real content changes, so the admin can trust it. Body: { documentIds: [] }.
   */
  async markSeen(ctx) {
    const documentIds: unknown = ctx.request.body?.documentIds;
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return ctx.send({ data: { updated: 0 } });
    }
    try {
      const ids = documentIds.map(String);
      const updated = await strapi.db
        .connection('gigs')
        .whereIn('document_id', ids)
        .update({ last_seen_at: new Date(), status: 'active' });
      return ctx.send({ data: { updated } });
    } catch (error) {
      ctx.throw(500, `Failed to mark gigs seen: ${error.message}`);
    }
  },
}));
