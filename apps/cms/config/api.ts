export default {
  rest: {
    defaultLimit: 25,
    // The web listing requests up to 300 upcoming gigs in one page (see apps/web
    // fetchGigs). maxLimit caps pagination[limit], so it must be >= that or gigs
    // past the cap silently vanish from the site.
    maxLimit: 500,
    withCount: true,
  },
};
