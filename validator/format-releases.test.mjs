import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import {
  artifactPaths, currentFormatRelease, formatRepositoryRoot, readFormatArtifact,
  readFormatReleases, sha256, verifyPublishedFormatReleases,
} from './format-releases.mjs';

async function modifiedArtifact(publicPath, change, {rebindCorrection = true} = {}) {
  const manifest = await readFormatReleases();
  const paths = artifactPaths(publicPath);
  const value = JSON.parse(await readFormatArtifact(paths[0]));
  change(value);
  const bytes = Buffer.from(JSON.stringify(value));
  const release = Object.values(manifest.releases).find(entry => Object.hasOwn(entry.artifacts, publicPath));
  release.artifacts[publicPath] = sha256(bytes);
  const replacements = new Map(paths.map(name => [name, bytes]));
  if (publicPath === 'registry/2.1.1.json' && rebindCorrection) {
    const errata = JSON.parse(await readFormatArtifact('appmostapp-format/publication-errata.json'));
    errata.correctedRegistrySHA256 = sha256(bytes);
    const errataBytes = Buffer.from(JSON.stringify(errata));
    manifest.publicationErrata.sha256 = sha256(errataBytes);
    for (const name of ['appmostapp-format/publication-errata.json', 'firebase/appmost.ai/format/publication-errata.json']) {
      replacements.set(name, errataBytes);
    }
  }
  return {manifest, read: name => replacements.get(name) ?? readFormatArtifact(name)};
}

async function modifiedErrata(change) {
  const manifest = await readFormatReleases();
  const errata = JSON.parse(await readFormatArtifact('appmostapp-format/publication-errata.json'));
  change(errata);
  const bytes = Buffer.from(JSON.stringify(errata));
  manifest.publicationErrata.sha256 = sha256(bytes);
  return {manifest, read: name => name.endsWith('/publication-errata.json') ? bytes : readFormatArtifact(name)};
}

test('canonical Git 2.0, frozen website 2.1 and editorial 2.1.1 artifacts agree', async () => {
  const manifest = await readFormatReleases();
  const current = await verifyPublishedFormatReleases(manifest);
  assert.equal(current.version, '2.1.1');
  assert.equal(current.documentVersion, 2);
  assert.equal(manifest.releases['2.0.0'].artifacts['registry/2.0.json'],
    '2d64b69aeb52ab27037636f345e82719fece2bd5092e913149913a499e091747');
  assert.equal(manifest.releases['2.1.0'].artifacts['registry/2.1.json'],
    'ed671760336431af77860efe4312c5233dc2fbc469954edfbaa3a7d64040bf01');

});

test('adding a schema property under any published URL fails without changing its checksum', async () => {
  const manifest = await readFormatReleases();
  for (const directory of ['2.0', '2.1', '2.1.1']) {
    const target = `schemas/${directory}/page.schema.json`;
    const schema = JSON.parse(await readFormatArtifact(target));
    schema.properties.futureOptionalField = {type: 'boolean'};
    const read = name => name === target ? Buffer.from(JSON.stringify(schema)) : readFormatArtifact(name);
    await assert.rejects(verifyPublishedFormatReleases(manifest, read), /immutable.*Create a new format release/);
  }
});

test('a new release may not reuse a previous directory or skip an adjacent predecessor', async () => {
  const manifest = await readFormatReleases();
  manifest.releases['2.1.0'].directory = '2.0';
  await assert.rejects(verifyPublishedFormatReleases(manifest), /unique version and artifact directory/);
  manifest.releases['2.1.0'].directory = '2.1';
  manifest.releases['2.1.1'].previousVersion = '2.0.0';
  await assert.rejects(verifyPublishedFormatReleases(manifest), /adjacent predecessor/);
});

test('an already introduced type cannot be backdated in a patch', async () => {
  const {manifest, read} = await modifiedArtifact('registry/2.1.1.json', registry => {
    registry.actionTypes.find(entry => entry.type === 'transcribeSpeech').introducedIn = '2.0.0';
  });
  await assert.rejects(verifyPublishedFormatReleases(manifest, read), /transcribeSpeech.*removed or changed/);
});

test('all adjacent releases are checked, including immutable historical 2.1', async () => {
  const {manifest, read} = await modifiedArtifact('registry/2.1.json', registry => {
    registry.actionTypes.find(entry => entry.type === 'transcribeSpeech').introducedIn = '2.0.0';
  });
  await assert.rejects(verifyPublishedFormatReleases(manifest, read), /Historical publication errata.*immutable releases/);
});

test('a minor release retains published names and their original introduction versions', async () => {
  const {manifest, read} = await modifiedArtifact('registry/2.1.1.json', registry => {
    registry.actionTypes = registry.actionTypes.filter(entry => entry.type !== 'appendToFirebaseDatabase');
  });
  await assert.rejects(verifyPublishedFormatReleases(manifest, read), /appendToFirebaseDatabase.*removed or changed/);
});

test('an editorial patch cannot introduce a type even when its new artifact checksums are rebound', async () => {
  const {manifest, read} = await modifiedArtifact('registry/2.1.1.json', registry => {
    registry.rowTypes.push({...registry.rowTypes[0], type: 'futureRow', introducedIn: '2.1.1'});
  });
  await assert.rejects(verifyPublishedFormatReleases(manifest, read), /futureRow requires a new minor release/);
});

test('an editorial patch cannot add schema fields or change chart semantics with rebound checksums', async () => {
  const schema = await modifiedArtifact('schemas/2.1.1/page.schema.json', value => {
    value.properties.futureOptionalField = {type: 'boolean'};
  });
  await assert.rejects(verifyPublishedFormatReleases(schema.manifest, schema.read), /editorial patch may not add or change page schema/);
  const chart = await modifiedArtifact('registry/chart-properties-2.1.1.json', value => {
    value.properties[0].description = 'A changed property meaning.';
  });
  await assert.rejects(verifyPublishedFormatReleases(chart.manifest, chart.read), /editorial patch may not add or change chart/);
});

test('historical errata are exact and cannot authorize an extra type or a different release', async () => {
  for (const change of [
    value => value.corrections.push({...value.corrections[0], type: 'futureRow'}),
    value => value.historicalRelease = '2.2.0',
    value => value.historicalRegistrySHA256 = '0'.repeat(64),
    value => value.corrections[0].canonicalIntroducedIn = '2.0.0',
  ]) {
    const {manifest, read} = await modifiedErrata(change);
    await assert.rejects(verifyPublishedFormatReleases(manifest, read), /Historical publication errata.*exactly the five known/);
  }
});

test('errata checksums are required and a corrected registry may not ignore the erratum', async () => {
  const manifest = await readFormatReleases();
  manifest.publicationErrata.sha256 = '0'.repeat(64);
  await assert.rejects(verifyPublishedFormatReleases(manifest), /errata checksum mismatch/);
  const {manifest: corrected, read} = await modifiedArtifact('registry/2.1.1.json', registry => {
    registry.webAppearances.find(entry => entry.type === 'glass').introducedIn = '2.0.0';
  });
  await assert.rejects(verifyPublishedFormatReleases(corrected, read), /stale or unused for glass/);
});

test('the five corrected introductions do not rewrite raw historical reference bytes', async () => {
  const old = JSON.parse(await readFormatArtifact('appmostapp-format/registry/2.1.json'));
  const current = JSON.parse(await readFormatArtifact('appmostapp-format/registry/2.1.1.json'));
  assert.equal(old.rowTypes.find(entry => entry.type === 'donutChart').introducedIn, '2.0.0');
  assert.equal(current.rowTypes.find(entry => entry.type === 'donutChart').introducedIn, '2.1.0');
  assert.ok(old.webAppearances.every(entry => entry.introducedIn === '2.0.0'));
  assert.ok(current.webAppearances.every(entry => entry.introducedIn === '2.1.0'));
  assert.equal(sha256(await readFormatArtifact('appmostapp-format/registry/2.1.json')),
    'ed671760336431af77860efe4312c5233dc2fbc469954edfbaa3a7d64040bf01');
});

test('published deprecation metadata is not reintroduced as new in an editorial patch', async () => {
  const {manifest, read} = await modifiedArtifact('registry/2.1.1.json', registry => {
    registry.actionTypes.find(entry => entry.type === 'appendToFirebaseDatabase').deprecatedIn = '2.1.1';
  });
  await assert.rejects(verifyPublishedFormatReleases(manifest, read), /Published deprecation/);
});

test('Open page keeps its type introduction and versions its pane capability separately', async () => {
  const current = currentFormatRelease(await readFormatReleases());
  const registry = JSON.parse(await readFormatArtifact(`appmostapp-format/registry/${current.directory}.json`));
  assert.equal(registry.actionTypes.find(entry => entry.type === 'openAnotherPage').introducedIn, '2.0.0');
  assert.deepEqual(registry.features.find(entry => entry.id === 'openPagePaneDestination').properties,
    ['configuration.containerId', 'configuration.paneId', 'configuration.operation']);
  assert.ok(registry.features.every(feature => feature.introducedIn === '2.1.0'));
  const retired = registry.actionTypes.find(entry => entry.type === 'appendToFirebaseDatabase');
  assert.equal(retired.deprecatedIn, '2.1.0');
  assert.ok(Object.values(retired.support).every(value => value === false));
  assert.equal(registry.actionTypes.some(entry => entry.type === 'openPageInPane'), false);
});

test('editorial capability documentation requires an exact existing published property', async () => {
  const manifest = await readFormatReleases();
  manifest.releases['2.1.1'].editorialCorrections[0].evidence.pointers = ['/properties/notPublished'];
  await assert.rejects(verifyPublishedFormatReleases(manifest), /Missing published editorial evidence/);
});

test('a versioned normative specification cannot change without failing its frozen identity', async () => {
  const manifest = await readFormatReleases();
  const target = 'appmostapp-format/spec/2.1.1/README.md';
  const read = name => name === target ? Buffer.from('Changed normative text.') : readFormatArtifact(name);
  await assert.rejects(verifyPublishedFormatReleases(manifest, read), /Published specification.*immutable/);
});

test('historical nonregistry artifacts cannot be repinned to evade publication evidence', async () => {
  for (const directory of ['2.0', '2.1']) {
    const {manifest, read} = await modifiedArtifact(`schemas/${directory}/page.schema.json`, schema => {
      schema.properties.historicalRewrite = {type: 'string'};
    });
    await assert.rejects(verifyPublishedFormatReleases(manifest, read),
      /Historical publication errata.*immutable releases/);
  }
});

test('observed website evidence cannot be rewritten even when its archive and all manifest pins are rebound', async () => {
  const artifact = 'schemas/2.0/page.schema.json';
  const target = 'publication-history/observed-web-2.0/' + artifact;
  const document = JSON.parse(await readFormatArtifact('appmostapp-format/' + target));
  document.properties.rewrittenHistory = {type: 'boolean'};
  const bytes = Buffer.from(JSON.stringify(document));
  const {manifest, read} = await modifiedErrata(errata => {
    errata.observedMislabeledWebsite.artifacts[artifact] = sha256(bytes);
  });
  const rebound = name => name.endsWith('/' + target) ? bytes : read(name);
  await assert.rejects(verifyPublishedFormatReleases(manifest, rebound),
    /Historical website evidence must bind the exact five/);
});

test('observed old manifest origin and exact bytes cannot be repinned or changed in its archive', async () => {
  const changed = await modifiedErrata(errata => {
    errata.observedMislabeledWebsite.manifest.sha256 = sha256(Buffer.from('{}'));
  });
  await assert.rejects(verifyPublishedFormatReleases(changed.manifest, changed.read),
    /Historical website evidence must bind/);
  const manifest = await readFormatReleases();
  const read = name => name === 'appmostapp-format/publication-history/observed-web-2.0/observed-releases.json'
    ? Buffer.from('{}') : readFormatArtifact(name);
  await assert.rejects(verifyPublishedFormatReleases(manifest, read), /historical website artifact changed/);
});
