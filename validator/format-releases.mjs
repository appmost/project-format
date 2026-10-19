// Publication rules shared with the reference implementation; only repository paths differ.
// This standalone repository has one public artifact tree, not a second website mirror.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const formatRepositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function readFormatReleases() {
  return JSON.parse(await readFile(path.join(formatRepositoryRoot, 'releases.json'), 'utf8'));
}

export function currentFormatRelease(manifest) {
  if (manifest.manifestVersion !== 1 || !/^\d+\.\d+\.\d+$/.test(manifest.currentVersion)) {
    throw new Error('Invalid format release manifest or currentVersion.');
  }
  const release = manifest.releases[manifest.currentVersion];
  if (!release || !/^\d+\.\d+(?:\.\d+)?$/.test(release.directory) ||
      Number(manifest.currentVersion.split('.')[0]) !== manifest.documentVersion) {
    throw new Error('The current format release must have its own directory and matching documentVersion.');
  }
  return {...release, version: manifest.currentVersion, documentVersion: manifest.documentVersion};
}

export function artifactPaths(publicPath) {
  if (!/^(?:registry\/[a-z0-9.-]+\.json|schemas\/\d+\.\d+(?:\.\d+)?\/(?:app|page|version)\.schema\.json)$/.test(publicPath)) {
    throw new Error(`Invalid published format artifact path: ${publicPath}`);
  }
  return [publicPath];
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function readFormatArtifact(relativePath) {
  const prefix = ['appmostapp-format/', 'firebase/appmost.ai/format/'].find(value => relativePath.startsWith(value));
  const localPath = prefix ? relativePath.slice(prefix.length) : relativePath;
  const publicPath = localPath === 'spec/2.1.1/README.md' ? 'spec/2.1.1.md' : localPath;
  return readFile(path.join(formatRepositoryRoot, publicPath));
}

const typeGroups = ['rowTypes', 'actionTypes', 'valueTypes', 'webAppearances'];
const historicalCorrections = [
  {group: 'rowTypes', type: 'donutChart', publishedIntroducedIn: '2.0.0', canonicalIntroducedIn: '2.1.0'},
  ...['standard', 'glass', 'brand', 'material'].map(type => ({
    group: 'webAppearances', type, publishedIntroducedIn: '2.0.0', canonicalIntroducedIn: '2.1.0',
  })),
];
const canonicalRegistrySHA256 = '2d64b69aeb52ab27037636f345e82719fece2bd5092e913149913a499e091747';
const historicalRegistrySHA256 = 'ed671760336431af77860efe4312c5233dc2fbc469954edfbaa3a7d64040bf01';
const canonicalArtifacts = {
  "registry/2.0.json": "2d64b69aeb52ab27037636f345e82719fece2bd5092e913149913a499e091747",
  "registry/chart-properties-2.0.json": "93310b0d2bb8ff5983c7f743335e4b552e766b62eb6772616fa9d31814efcf4b",
  "schemas/2.0/app.schema.json": "515cfb108bc3f800c91c3f0dcef6da5bfe9566e649ccdfa9a41548a1517cce61",
  "schemas/2.0/page.schema.json": "6f9d61350474cd6a58c1570339637edaa94be975da49e202a92381a3c207c4e1",
  "schemas/2.0/version.schema.json": "676267709d419a04dced086ecd1ab52a56bbb343728561ccc85a6a6ba80931ce"
};
const historicalArtifacts = {
  "registry/2.1.json": "ed671760336431af77860efe4312c5233dc2fbc469954edfbaa3a7d64040bf01",
  "registry/chart-properties-2.1.json": "ae6cd130d20012da65addb76c2c8b05a73f0b51312049230600168b7106bb235",
  "schemas/2.1/app.schema.json": "cee24de2e73aa936c10f09202de6f6b52ad582ab53029af00e8b577fec4653b9",
  "schemas/2.1/page.schema.json": "14bf9e8438fdbad35d92a3ec9e84953ae13cf415e409f1f6e0787e2cdb2949d9",
  "schemas/2.1/version.schema.json": "cc0588964c611dbdf7b3d069945b11442367e9a40645ab4be8248e615cdf738f"
};
const observedWebsiteArtifacts = {
  "registry/2.0.json": "bd464c6e83443af36282981cc2c3398748426031d1364cad40456f20783a34a8",
  "registry/chart-properties-2.0.json": "5d1fbc2ebc0068ca896ac2344c375389964cdcb0c504b25eac696263ebb2e6c0",
  "schemas/2.0/app.schema.json": "515cfb108bc3f800c91c3f0dcef6da5bfe9566e649ccdfa9a41548a1517cce61",
  "schemas/2.0/page.schema.json": "b3d339160bb635eb492ca9117627e6ab9792f92bb0f7c58fa8538a9def5b6170",
  "schemas/2.0/version.schema.json": "4f34c6c1f939b7e6a6ffdbc437d25438ee24eb421a9afad0ac86db319dc019fd"
};
const observedManifestSHA256 = "5170b7dbb9ecb4cae47bd4fe6afd0c04d8deae19ec4463f3b2a3cd9bc5a44921";
const compareVersions = (a, b) => {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
};
const isMinorAddition = (before, after) => {
  const a = before.split('.').map(Number);
  const b = after.split('.').map(Number);
  return a[0] === b[0] && b[1] > a[1];
};

function correctionFor(group, type) {
  return historicalCorrections.find(entry => entry.group === group && entry.type === type);
}

async function verifyHistoricalErrata(manifest, releases, readArtifact) {
  const reference = manifest.publicationErrata;
  if (reference?.path !== 'publication-errata.json' || !/^[a-f0-9]{64}$/.test(reference.sha256 ?? '')) {
    throw new Error('The exact historical publication errata and its checksum are required.');
  }
  const bytes = await readArtifact('appmostapp-format/publication-errata.json');
  if (sha256(bytes) !== reference.sha256) {
    throw new Error('Historical publication errata checksum mismatch.');
  }
  const errata = JSON.parse(bytes);
  const baseline = releases.get('2.0.0');
  const historical = releases.get('2.1.0');
  const corrected = releases.get('2.1.1');
  if (!baseline || !historical || !corrected ||
      errata.errataVersion !== 1 || errata.id !== 'canonical-2.0-and-2.1-introduction-metadata' ||
      errata.canonicalBaseline?.version !== '2.0.0' ||
      errata.canonicalBaseline?.commit !== '753ad8ae3dcb0369ab3bfb0b09d144d2ade71104' ||
      errata.canonicalBaseline?.repository !== 'https://github.com/appmost/project-format' ||
      errata.historicalRelease !== '2.1.0' || errata.correctedRelease !== '2.1.1' ||
      errata.historicalRegistrySHA256 !== historicalRegistrySHA256 ||
      baseline.release.artifacts['registry/2.0.json'] !== canonicalRegistrySHA256 ||
      historical.release.artifacts['registry/2.1.json'] !== historicalRegistrySHA256 ||
      errata.correctedRegistrySHA256 !== corrected.release.artifacts['registry/2.1.1.json'] ||
      !isDeepStrictEqual(errata.canonicalBaseline.artifacts, canonicalArtifacts) ||
      !isDeepStrictEqual(baseline.release.artifacts, canonicalArtifacts) ||
      !isDeepStrictEqual(errata.historicalArtifacts, historicalArtifacts) ||
      !isDeepStrictEqual(historical.release.artifacts, historicalArtifacts) ||
      !isDeepStrictEqual(errata.corrections, historicalCorrections)) {
    throw new Error('Historical publication errata must bind exactly the five known introduction errors and their immutable releases.');
  }
  for (const correction of historicalCorrections) {
    const original = baseline.registry[correction.group]?.find(entry => entry.type === correction.type);
    const incorrect = historical.registry[correction.group]?.find(entry => entry.type === correction.type);
    const fixed = corrected.registry[correction.group]?.find(entry => entry.type === correction.type);
    if (original || incorrect?.introducedIn !== correction.publishedIntroducedIn ||
        fixed?.introducedIn !== correction.canonicalIntroducedIn) {
      throw new Error(`Historical introduction erratum is stale or unused for ${correction.type}.`);
    }
  }
  const observed = errata.observedMislabeledWebsite;
  if (observed?.versionLabel !== '2.0.0' || observed.firstGlobalWebsitePublication !== 'unknown' ||
      observed.archivedDirectory !== 'publication-history/observed-web-2.0' ||
      Object.keys(observed.artifacts ?? {}).sort().join() !== Object.keys(baseline.release.artifacts).sort().join()) {
    throw new Error('The observed mislabeled website publication must remain separately identified.');
  }
  if (!isDeepStrictEqual(observed.artifacts, observedWebsiteArtifacts) ||
      observed.hostingVersion !== 'sites/appmost-ai/versions/561515fb7eb65b25' ||
      observed.evidencePath !== 'docs/verification/format-version-20261018/deployment-receipt.json' ||
      !isDeepStrictEqual(observed.manifest, {path: 'observed-releases.json', sha256: observedManifestSHA256,
        sourceCommit: '64015f8ded5e0443690fbe560071136c2fd16df7'})) {
    throw new Error('Historical website evidence must bind the exact five observed artifacts and original publication manifest.');
  }
  const historicalFiles = {...observed.artifacts, [observed.manifest.path]: observed.manifest.sha256};
  for (const [file, expected] of Object.entries(historicalFiles)) {
    for (const prefix of ['appmostapp-format']) {
      if (sha256(await readArtifact(`${prefix}/${observed.archivedDirectory}/${file}`)) !== expected) {
        throw new Error(`Observed historical website artifact changed: ${file}.`);
      }
    }
  }
}

function verifyEditorialPatch(before, after) {
  const oldVersion = before.version.split('.').map(Number);
  const newVersion = after.version.split('.').map(Number);
  if (oldVersion[0] !== newVersion[0] || oldVersion[1] !== newVersion[1]) return;
  const expectedRegistry = structuredClone(before.registry);
  expectedRegistry.formatVersion = after.version;
  if (before.version === '2.1.0' && after.version === '2.1.1') {
    // Comparison-only declaration of the five raw historical errors. No reader/runtime normalizes them.
    for (const correction of historicalCorrections) {
      expectedRegistry[correction.group].find(entry => entry.type === correction.type).introducedIn =
        correction.canonicalIntroducedIn;
    }
  }
  if (!isDeepStrictEqual(expectedRegistry, after.registry)) {
    throw new Error('An editorial patch may change only version metadata and its exact declared historical corrections; new semantics require a minor release.');
  }
  const expectedChart = structuredClone(before.chart);
  expectedChart.formatVersion = after.version;
  if (!isDeepStrictEqual(expectedChart, after.chart)) {
    throw new Error('An editorial patch may not add or change chart semantics.');
  }
  for (const name of ['app', 'page', 'version']) {
    const expectedSchema = structuredClone(before.schemas[name]);
    expectedSchema.$id = after.schemas[name].$id;
    if (!isDeepStrictEqual(expectedSchema, after.schemas[name])) {
      throw new Error(`An editorial patch may not add or change ${name} schema semantics.`);
    }
  }
}

function verifyEditorialDocumentation(before, after) {
  for (const correction of after.release.editorialCorrections ?? []) {
    const evidence = correction.evidence;
    const raw = before.artifacts.get(evidence?.artifact);
    if (correction.introducedIn !== before.version || !raw || sha256(raw) !== evidence.sha256) {
      throw new Error('Editorial documentation must identify the exact preceding published capability.');
    }
    const document = JSON.parse(raw);
    if (evidence.pointers) {
      if (!evidence.pointers.length) throw new Error('Editorial documentation needs concrete property evidence.');
      for (const pointer of evidence.pointers) {
        let value = document;
        for (const key of pointer.split('/').slice(1).map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))) {
          if (!value || !Object.hasOwn(value, key)) throw new Error(`Missing published editorial evidence: ${pointer}.`);
          value = value[key];
        }
      }
    } else {
      const action = document.actionTypes?.find(entry => entry.type === evidence.type);
      if (!action || !isDeepStrictEqual(evidence.support, {android: action.support.android})) {
        throw new Error('Editorial support documentation does not match the published action.');
      }
    }
  }
}

/** A published candidate is just as immutable as a final specification. All adjacent releases are checked. */
export async function verifyPublishedFormatReleases(manifest, readArtifact = readFormatArtifact) {
  const current = currentFormatRelease(manifest);
  const directories = new Set();
  const releases = new Map();
  const versions = Object.keys(manifest.releases).sort(compareVersions);
  if (versions.at(-1) !== current.version) throw new Error('The current format release must be the newest published release.');
  for (const [index, version] of versions.entries()) {
    const release = manifest.releases[version];
    if (!/^\d+\.\d+\.\d+$/.test(version) || !/^\d+\.\d+(?:\.\d+)?$/.test(release.directory) ||
        directories.has(release.directory)) {
      throw new Error('Every published format release needs a unique version and artifact directory.');
    }
    if ((index === 0 && release.previousVersion) || (index > 0 && release.previousVersion !== versions[index - 1])) {
      throw new Error('Each format release must identify its actual adjacent predecessor.');
    }
    directories.add(release.directory);
    const required = [`registry/${release.directory}.json`, `registry/chart-properties-${release.directory}.json`,
      ...['app', 'page', 'version'].map(name => `schemas/${release.directory}/${name}.schema.json`)];
    const artifacts = new Map();
    for (const file of required) {
      const expected = release.artifacts[file];
      if (!/^[a-f0-9]{64}$/.test(expected ?? '')) throw new Error(`Missing published checksum for ${file}.`);
      for (const relativePath of artifactPaths(file)) {
        const bytes = await readArtifact(relativePath);
        if (sha256(bytes) !== expected) {
          throw new Error(`Published format ${version} is immutable: ${relativePath} changed. Create a new format release and URL; do not update its checksum.`);
        }
        artifacts.set(file, bytes);
      }
    }
    const registry = JSON.parse(artifacts.get(`registry/${release.directory}.json`));
    const chart = JSON.parse(artifacts.get(`registry/chart-properties-${release.directory}.json`));
    if (registry.formatVersion !== version || registry.documentVersion !== Number(version.split('.')[0]) ||
        chart.formatVersion !== version || chart.documentVersion !== registry.documentVersion) {
      throw new Error(`Registry version does not match format release ${version}.`);
    }
    for (const group of typeGroups) {
      const entries = registry[group] ?? [];
      if (new Set(entries.map(entry => entry.type)).size !== entries.length) throw new Error(`Duplicate published type in ${group}.`);
    }
    const schemas = {};
    for (const name of ['app', 'page', 'version']) {
      schemas[name] = JSON.parse(artifacts.get(`schemas/${release.directory}/${name}.schema.json`));
      if (schemas[name].$id !== `https://www.appmost.ai/format/schemas/${release.directory}/${name}.schema.json`) {
        throw new Error(`Schema identity does not match format release ${version}.`);
      }
    }
    if (release.specification) {
      const specification = release.specification;
      if (specification.path !== `spec/${version}.md` || !/^[a-f0-9]{64}$/.test(specification.sha256 ?? '')) {
        throw new Error('A versioned specification needs its own path and checksum.');
      }
      for (const file of [`appmostapp-format/spec/${version}/README.md`,
        `firebase/appmost.ai/format/${specification.path}`]) {
        if (sha256(await readArtifact(file)) !== specification.sha256) {
          throw new Error(`Published specification ${version} is immutable: ${file} changed.`);
        }
      }
    }
    releases.set(version, {version, release, registry, chart, schemas, artifacts});
  }
  await verifyHistoricalErrata(manifest, releases, readArtifact);
  for (let index = 1; index < versions.length; index += 1) {
    const before = releases.get(versions[index - 1]);
    const after = releases.get(versions[index]);
    if (before.registry.documentVersion !== after.registry.documentVersion) continue;
    for (const group of typeGroups) {
      const old = new Map((before.registry[group] ?? []).map(entry => [entry.type, entry]));
      const next = new Map((after.registry[group] ?? []).map(entry => [entry.type, entry]));
      for (const entry of old.values()) {
        const replacement = next.get(entry.type);
        const correction = correctionFor(group, entry.type);
        const declaredCorrection = before.version === '2.1.0' && after.version === '2.1.1' && correction &&
          entry.introducedIn === correction.publishedIntroducedIn &&
          replacement?.introducedIn === correction.canonicalIntroducedIn;
        if (!replacement || (replacement.introducedIn !== entry.introducedIn && !declaredCorrection)) {
          throw new Error(`Published type ${entry.type} or its introduction release was removed or changed.`);
        }
        if (entry.deprecatedIn && replacement.deprecatedIn !== entry.deprecatedIn) {
          throw new Error(`Published deprecation for ${entry.type} was changed.`);
        }
      }
      for (const entry of next.values()) {
        const correction = correctionFor(group, entry.type);
        const declaredHistoricalError = before.version === '2.0.0' && after.version === '2.1.0' && correction &&
          entry.introducedIn === correction.publishedIntroducedIn;
        if (!old.has(entry.type) && !declaredHistoricalError &&
            (entry.introducedIn !== after.version || !isMinorAddition(before.version, after.version))) {
          throw new Error(`New type ${entry.type} requires a new minor release and its actual introducedIn version.`);
        }
      }
    }
    for (const feature of before.registry.features ?? []) {
      if (!(after.registry.features ?? []).some(entry => entry.id === feature.id && entry.introducedIn === feature.introducedIn)) {
        throw new Error(`Published feature ${feature.id} or its introduction release was removed or changed.`);
      }
    }
    for (const feature of after.registry.features ?? []) {
      if (!(before.registry.features ?? []).some(entry => entry.id === feature.id) &&
          (feature.introducedIn !== after.version || !isMinorAddition(before.version, after.version))) {
        throw new Error(`New feature ${feature.id} requires a new minor release and its actual introducedIn version.`);
      }
    }
    verifyEditorialPatch(before, after);
    verifyEditorialDocumentation(before, after);
  }
  return current;
}
