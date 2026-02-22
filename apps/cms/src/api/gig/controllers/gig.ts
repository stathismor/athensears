import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::gig.gig', ({ strapi }) => ({
  async deleteAll(ctx) {
    try {
      // Fetch all non-manual gigs (only id for efficiency)
      const entities = await strapi.db.query('api::gig.gig').findMany({
        select: ['id'],
        where: { manual: { $ne: true } },
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
}));
