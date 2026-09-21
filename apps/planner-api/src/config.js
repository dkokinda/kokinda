import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3100),
  graph: {
    clientId: process.env.GRAPH_CLIENT_ID ?? '',
    clientSecret: process.env.GRAPH_CLIENT_SECRET ?? '',
    // "organizations" accepts any work/school tenant. Planner is a Microsoft 365
    // Groups feature and is not available to personal Microsoft accounts, so
    // "consumers" is never a valid value here.
    tenantId: process.env.GRAPH_TENANT_ID ?? 'organizations',
    // device_code = delegated (acts as a user), client_credentials = app-only.
    authMode: process.env.GRAPH_AUTH_MODE ?? 'device_code',
    scopes: process.env.GRAPH_SCOPES ?? 'offline_access User.Read Tasks.ReadWrite Group.Read.All',
    tokenCachePath: process.env.GRAPH_TOKEN_CACHE_PATH ?? '.tokens.json',
    baseUrl: process.env.GRAPH_BASE_URL ?? 'https://graph.microsoft.com/v1.0',
    // Roster-backed plans — what new Planner calls "Shared" plans — are only
    // discoverable through /me/planner/rosterPlans, which is beta-only.
    betaUrl: process.env.GRAPH_BETA_URL ?? 'https://graph.microsoft.com/beta',
    authorityHost: process.env.GRAPH_AUTHORITY_HOST ?? 'https://login.microsoftonline.com',
  },
};

export function tokenUrl() {
  return `${config.graph.authorityHost}/${config.graph.tenantId}/oauth2/v2.0/token`;
}

export function deviceCodeUrl() {
  return `${config.graph.authorityHost}/${config.graph.tenantId}/oauth2/v2.0/devicecode`;
}
