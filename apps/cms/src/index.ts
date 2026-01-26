import type { Core } from '@strapi/strapi';

export default {
  register() {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // Configure public permissions for API endpoints
    const publicRole = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'public' } });

    if (publicRole) {
      const permissions = await strapi
        .query('plugin::users-permissions.permission')
        .findMany({ where: { role: publicRole.id } });

      const existingActions = permissions.map((p: { action: string }) => p.action);

      const requiredPermissions = [
        'api::venue.venue.find',
        'api::venue.venue.findOne',
        'api::gig.gig.find',
        'api::gig.gig.findOne',
      ];

      for (const action of requiredPermissions) {
        if (!existingActions.includes(action)) {
          await strapi.query('plugin::users-permissions.permission').create({
            data: {
              action,
              role: publicRole.id,
            },
          });
        }
      }
    }

    // Seed sample data if no venues exist
    const existingVenues = await strapi.query('api::venue.venue').count();
    if (existingVenues === 0) {
      const venues = [
        {
          name: 'Six Dogs',
          address: 'Avramiotou 6-8, Monastiraki',
          website: 'https://sixdogs.gr',
          neighborhood: 'Monastiraki',
        },
        {
          name: 'Romantso',
          address: 'Anaxagora 3-5, Omonoia',
          website: 'https://romantso.gr',
          neighborhood: 'Omonoia',
        },
        {
          name: 'Death Disco',
          address: 'Ogigou 6, Gazi',
          website: 'https://deathdisco.gr',
          neighborhood: 'Gazi',
        },
        {
          name: 'Fuzz Club',
          address: 'Pireos 209, Tavros',
          website: 'https://fuzzclub.gr',
          neighborhood: 'Tavros',
        },
        {
          name: 'Gazarte',
          address: 'Voutadon 32-34, Gazi',
          website: 'https://gazarte.gr',
          neighborhood: 'Gazi',
        },
      ];

      const createdVenues: { id: number; name: string }[] = [];
      for (const venue of venues) {
        const created = await strapi.query('api::venue.venue').create({ data: venue });
        createdVenues.push(created);
      }

      // Create sample gigs for current and next month
      const now = new Date();
      const gigs = [
        {
          title: 'Jazz Night with The Athenians',
          date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 21, 0),
          time_display: '21:00',
          price: '€10',
          description: 'An evening of smooth jazz',
          venue: createdVenues[0].id,
        },
        {
          title: 'Punk Rock Showdown',
          date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5, 22, 0),
          time_display: '22:00',
          price: '€8',
          description: 'Local punk bands take the stage',
          venue: createdVenues[2].id,
        },
        {
          title: 'Electronic Dreams',
          date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 0),
          time_display: '23:00',
          price: '€15',
          description: 'Techno and house music night',
          venue: createdVenues[1].id,
        },
        {
          title: 'Acoustic Sessions',
          date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10, 20, 0),
          time_display: '20:00',
          price: 'Free',
          description: 'Intimate acoustic performances',
          venue: createdVenues[0].id,
        },
        {
          title: 'Metal Mayhem',
          date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 21, 30),
          time_display: '21:30',
          price: '€12',
          description: 'Heavy metal night',
          venue: createdVenues[3].id,
        },
        {
          title: 'Indie Showcase',
          date: new Date(now.getFullYear(), now.getMonth() + 1, 5, 21, 0),
          time_display: '21:00',
          price: '€10',
          description: 'Emerging indie artists',
          venue: createdVenues[4].id,
        },
        {
          title: 'Blues & Soul Evening',
          date: new Date(now.getFullYear(), now.getMonth() + 1, 10, 20, 30),
          time_display: '20:30',
          price: '€15',
          description: 'Classic blues and soul covers',
          venue: createdVenues[0].id,
        },
        {
          title: 'DJ Battle Royale',
          date: new Date(now.getFullYear(), now.getMonth() + 1, 15, 23, 0),
          time_display: '23:00',
          price: '€8',
          description: 'DJs compete for the crown',
          venue: createdVenues[1].id,
        },
        {
          title: 'Folk Festival',
          date: new Date(now.getFullYear(), now.getMonth() + 1, 20, 19, 0),
          time_display: '19:00',
          price: 'Free',
          description: 'Traditional and contemporary folk',
          venue: createdVenues[4].id,
        },
        {
          title: 'Rock Legends Tribute',
          date: new Date(now.getFullYear(), now.getMonth() + 1, 25, 21, 0),
          time_display: '21:00',
          price: '€20',
          description: 'Tribute to classic rock bands',
          venue: createdVenues[3].id,
        },
      ];

      for (const gig of gigs) {
        await strapi.query('api::gig.gig').create({ data: gig });
      }

      strapi.log.info('Sample venues and gigs seeded successfully');
    }
  },
};
