import { config } from '../config.js';
import { pollForDeviceToken, requestDeviceCode } from '../graph/auth.js';

/**
 * One-time interactive sign-in. Stores the refresh token so the service can
 * mint access tokens unattended from then on.
 */
const device = await requestDeviceCode();

console.log(`\n${device.message}\n`);
console.log(`  URL:  ${device.verification_uri}`);
console.log(`  Code: ${device.user_code}\n`);
console.log('Waiting for sign-in...');

await pollForDeviceToken(device.device_code, {
  intervalMs: Number(device.interval ?? 5) * 1000,
  expiresInSec: Number(device.expires_in ?? 900),
});

console.log(`Signed in. Refresh token cached at ${config.graph.tokenCachePath}.`);
