import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSupportedSchema } from './reference-schema.mjs';
import { verifyPublishedFormatReleases } from './format-releases.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const semanticVersion = /^\d+\.\d+\.\d+$/;

export async function readReleases() {
  return JSON.parse(await readFile(path.join(repositoryRoot, 'releases.json'), 'utf8'));
}

export async function loadFormatRelease(requestedVersion, manifest = undefined) {
  manifest ??= await readReleases();
  const version = requestedVersion ?? manifest.currentVersion;
  const release = manifest.releases?.[version];
  if (!semanticVersion.test(version ?? '') || !release) {
    throw Object.assign(new Error('Unsupported format release: ' + String(version)), { code: 'unsupported_format_version' });
  }
  if (manifest.documentVersion !== 2 || !/^2\.\d+(?:\.\d+)?$/.test(release.directory)) throw new Error('Invalid format release metadata.');
  const readArtifact = async publicPath => {
    if (!/^(?:registry\/[a-z0-9.-]+\.json|schemas\/[0-9.]+\/[a-z]+\.schema\.json)$/.test(publicPath)) throw new Error('Unsafe format artifact path: ' + publicPath);
    const bytes = await readFile(path.join(repositoryRoot, publicPath));
    if (!/^[a-f0-9]{64}$/.test(release.artifacts?.[publicPath] ?? '') || sha256(bytes) !== release.artifacts[publicPath]) throw new Error('Published artifact hash mismatch: ' + publicPath);
    return JSON.parse(bytes);
  };
  const registry = await readArtifact('registry/' + release.directory + '.json');
  if (registry.formatVersion !== version || registry.documentVersion !== 2) throw new Error('Registry identity mismatch.');
  const schemas = {};
  for (const kind of ['app', 'version', 'page']) {
    const publicPath = 'schemas/' + release.directory + '/' + kind + '.schema.json';
    schemas[kind] = await readArtifact(publicPath);
    if (schemas[kind].$id !== 'https://www.appmost.ai/format/' + publicPath) throw new Error('Schema identity mismatch: ' + publicPath);
    assertSupportedSchema(schemas[kind]);
  }
  await readArtifact('registry/chart-properties-' + release.directory + '.json');
  return { version, release, registry, schemas };
}

export async function verifyPublishedArtifacts(manifest = undefined) {
  manifest ??= await readReleases();
  if (manifest.manifestVersion !== 1 || !Object.hasOwn(manifest.releases ?? {}, manifest.currentVersion)) throw new Error('Invalid release manifest.');
  const directories = new Set();
  for (const [version, release] of Object.entries(manifest.releases)) {
    if (directories.has(release.directory)) throw new Error('Published artifact directories must be unique.');
    directories.add(release.directory);
    await loadFormatRelease(version, manifest);
  }
  await verifyPublishedFormatReleases(manifest);
  return manifest;
}
