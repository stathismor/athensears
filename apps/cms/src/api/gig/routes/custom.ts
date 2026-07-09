export default {
  routes: [
    {
      method: 'POST',
      path: '/gigs/deleteAll',
      handler: 'gig.deleteAll',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Disable auth for internal bulk delete
      },
    },
    {
      method: 'POST',
      path: '/gigs/markSeen',
      handler: 'gig.markSeen',
      config: {
        policies: [],
        middlewares: [],
        auth: false, // Internal crawl heartbeat
      },
    },
  ],
};
