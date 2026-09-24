import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  adobe: {
    clientId: process.env.ADOBE_CLIENT_ID ?? '',
    clientSecret: process.env.ADOBE_CLIENT_SECRET ?? '',
    orgId: process.env.ADOBE_ORG_ID ?? '',
    tokenUrl: process.env.ADOBE_IMS_TOKEN_URL ?? 'https://ims-na1.adobelogin.com/ims/token/v3',
    scopes: process.env.ADOBE_IMS_SCOPES ?? 'openid,AdobeID,indesign_services,creative_sdk',
    apiBaseUrl: process.env.ADOBE_INDESIGN_API_BASE_URL ?? 'https://indesign.adobe.io',
    // Adobe's InDesign API (Firefly Services) exposes capability-bundle-scoped
    // routes that can vary by Developer Console project/API version. Defaults
    // below match the published API reference at the time this was written —
    // verify against https://developer.adobe.com/firefly-services/docs/indesign-apis/
    // for your project and override here if they differ.
    operations: {
      createRendition: process.env.ADOBE_OP_CREATE_RENDITION ?? '/v3/create-rendition',
      mergeDataTags: process.env.ADOBE_OP_MERGE_DATA_TAGS ?? '/v3/merge-data-tags',
      mergeData: process.env.ADOBE_OP_MERGE_DATA ?? '/v3/merge-data',
      convertPdfToIndd: process.env.ADOBE_OP_CONVERT_PDF_TO_INDD ?? '/v3/convert-pdf-to-indd',
      status: process.env.ADOBE_OP_STATUS ?? '/v3/status',
    },
  },
  jobPoll: {
    intervalMs: Number(process.env.JOB_POLL_INTERVAL_MS ?? 2000),
    timeoutMs: Number(process.env.JOB_POLL_TIMEOUT_MS ?? 120000),
  },
};
