/**
 * Auto-lock hand edits. Any create/update that originates from a human in the admin
 * (the Content Manager or admin API) marks the gig `manual: true`, so the crawler's
 * upsert and prune leave it alone from then on - the editor never has to remember a
 * flag. The crawler authenticates with an API token and carries no admin user in the
 * request context, so its own writes never trip this. Operations with no request
 * context at all (bootstrap, seeds, direct queries) are treated as non-admin.
 */
function markManualIfAdminEdit(event: { params: { data?: Record<string, unknown> } }) {
  const ctx = strapi.requestContext.get();
  const isAdminEdit = Boolean(ctx?.state?.user);
  if (isAdminEdit && event.params.data) {
    event.params.data.manual = true;
  }
}

export default {
  beforeCreate(event) {
    markManualIfAdminEdit(event);
  },
  beforeUpdate(event) {
    markManualIfAdminEdit(event);
  },
};
