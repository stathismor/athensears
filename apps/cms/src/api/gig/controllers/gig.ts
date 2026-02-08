import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::gig.gig', ({ strapi }) => ({
  async deleteAll(ctx) {
    try {
      // Fetch all gigs (only id for efficiency)
      const entities = await strapi.entityService.findMany('api::gig.gig', {
        fields: ['id'],
        pagination: { limit: -1 }, // No limit
      });

      // Delete all gigs in parallel using id (entity service uses id, not documentId)
      const deletePromises = entities.map((entity: any) =>
        strapi.entityService.delete('api::gig.gig', entity.id)
      );
      await Promise.all(deletePromises);

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
