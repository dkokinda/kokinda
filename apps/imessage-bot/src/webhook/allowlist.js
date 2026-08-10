'use strict';

/**
 * Parses ALLOWED_CONTACTS-style env values into a normalized list of
 * handle addresses (phone numbers in E.164 form, or emails). Comma-
 * separated; entries are trimmed and lowercased for consistent matching.
 */
function parseAllowedContacts(rawValue) {
  if (!rawValue) return [];
  return rawValue
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * An empty/unset allowlist means "allow everyone" (backward compatible
 * default). Once any contacts are configured, only an exact (normalized)
 * match is allowed — an unknown or missing sender address is rejected.
 */
function isContactAllowed(address, allowedContacts) {
  if (!allowedContacts || allowedContacts.length === 0) {
    return true;
  }
  if (!address) return false;
  return allowedContacts.includes(address.trim().toLowerCase());
}

module.exports = { parseAllowedContacts, isContactAllowed };
