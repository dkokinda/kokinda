export function extensionFor(url) {
  const clean = url.split('?')[0];
  const match = clean.match(/\.[a-zA-Z0-9]+$/);
  return match ? match[0] : '';
}

/** Builds an Adobe InDesign API asset descriptor for an externally-hosted file. */
export function assetEntry(url, name) {
  return {
    source: { url, storageType: 'EXTERNAL' },
    destination: `${name}${extensionFor(url)}`,
  };
}
