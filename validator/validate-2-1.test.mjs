import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile, symlink, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateProject, FormatValidationError } from './validate.mjs';
import { readReleases, loadFormatRelease, verifyPublishedArtifacts } from './releases.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const write = async (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const valid = async (t, mutate = async () => {}) => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'appmost-format-2-1-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const project = path.join(scratch, 'Project.appmostapp');
  await cp(path.join(root, 'examples/minimal.appmostapp'), project, { recursive: true });
  await mutate(project, scratch);
  return project;
};
const pagePath = project => path.join(project, 'versions/1/pages/home.json');
const versionPath = project => path.join(project, 'versions/1/version.json');
const changedPage = async (project, mutate) => {
  const page = await json(pagePath(project)); mutate(page); await write(pagePath(project), page);
};
const errorCode = code => error => error instanceof FormatValidationError && error.code === code;
const overlay = () => ({
  id: 'fade', anchorRowId: 'welcome',
  stops: [{ location: 0, color: 'ffffff', opacity: 0 }, { location: 1, color: '102030', opacity: 1 }],
});
async function adaptive(project) {
  const version = await json(versionPath(project));
  version.pageFileNames.push('detail.json', 'layout.json'); version.startPageId = 'layout';
  await write(versionPath(project), version);
  await write(path.join(project, 'versions/1/pages/detail.json'), { id: 'detail', type: 'normal', rows: [] });
  await write(path.join(project, 'versions/1/pages/layout.json'), {
    id: 'layout', type: 'adaptive',
    layout: { kind: 'navigationSplit', panes: { primary: { pageId: 'home' }, secondary: { pageId: 'detail' } } },
  });
}

test('manifest selects 2.1.1 with documentVersion 2 and all frozen artifacts verify', async () => {
  const manifest = await verifyPublishedArtifacts();
  assert.equal(manifest.currentVersion, '2.1.1');
  assert.equal(manifest.documentVersion, 2);
  assert.equal((await loadFormatRelease()).registry.rowTypes.find(row => row.type === 'donutChart').introducedIn, '2.1.0');
});
test('all original Git 2.0 and observed web 2.1 artifact hashes remain fixed', async () => {
  const frozen = {
    'spec/2.0.md': '8dd483b6fbc353342a132da4f546c37406956da9ba6dbc8721169643fd3e3467',
    'registry/2.0.json': '2d64b69aeb52ab27037636f345e82719fece2bd5092e913149913a499e091747',
    'registry/chart-properties-2.0.json': '93310b0d2bb8ff5983c7f743335e4b552e766b62eb6772616fa9d31814efcf4b',
    'schemas/2.0/app.schema.json': '515cfb108bc3f800c91c3f0dcef6da5bfe9566e649ccdfa9a41548a1517cce61',
    'schemas/2.0/page.schema.json': '6f9d61350474cd6a58c1570339637edaa94be975da49e202a92381a3c207c4e1',
    'schemas/2.0/version.schema.json': '676267709d419a04dced086ecd1ab52a56bbb343728561ccc85a6a6ba80931ce',
    'registry/2.1.json': 'ed671760336431af77860efe4312c5233dc2fbc469954edfbaa3a7d64040bf01',
    'registry/chart-properties-2.1.json': 'ae6cd130d20012da65addb76c2c8b05a73f0b51312049230600168b7106bb235',
    'schemas/2.1/app.schema.json': 'cee24de2e73aa936c10f09202de6f6b52ad582ab53029af00e8b577fec4653b9',
    'schemas/2.1/page.schema.json': '14bf9e8438fdbad35d92a3ec9e84953ae13cf415e409f1f6e0787e2cdb2949d9',
    'schemas/2.1/version.schema.json': 'cc0588964c611dbdf7b3d069945b11442367e9a40645ab4be8248e615cdf738f',
  };
  for (const [name, expected] of Object.entries(frozen)) {
    assert.equal(createHash('sha256').update(await readFile(path.join(root, name))).digest('hex'), expected, name);
  }
});
test('an artifact mismatch fails independently of package validity', async () => {
  const manifest = await readReleases();
  const current = manifest.releases[manifest.currentVersion];
  current.artifacts['registry/' + current.directory + '.json'] = '0'.repeat(64);
  await assert.rejects(loadFormatRelease(undefined, manifest), /artifact hash mismatch/);
});
test('an unknown semantic release fails without choosing another version', async () => {
  await assert.rejects(loadFormatRelease('2.9.9'), error => error.code === 'unsupported_format_version');
});
test('current package accepts donut data, dynamic navigation icons and web appearance', async t => {
  const project = await valid(t, async p => {
    await changedPage(p, page => {
      page.rows.push({ id: 'donut', type: 'donutChart', chartViewModels: [{ highlightedDataPointIndex: 0, dataPoints: [{ label: 'One', value: 1 }] }] });
      page.rightNavBarButtons = [{ imageNameVarExpVal: { type: 'iconName', value: 'heart' }, clickActions: [{ type: 'doNothing' }] }];
    });
    const version = await json(versionPath(p)); version.globalTheme = { webAppearance: 'glass' }; await write(versionPath(p), version);
  });
  assert.equal((await validateProject(project)).rowCount, 2);
  await assert.rejects(validateProject(project, { formatVersion: '2.0.0' }), errorCode('unknown_row_type'));
});
test('a valid adaptive container and pane action resolve actual pages', async t => {
  const project = await valid(t, async p => {
    await adaptive(p);
    await changedPage(p, page => {
      page.rows[0].appActions = [{ type: 'openAnotherPage', targetId: 'detail', configuration: { containerId: 'layout', paneId: 'secondary', operation: 'replace' } }];
    });
  });
  assert.equal((await validateProject(project)).pageCount, 3);
  await assert.rejects(validateProject(project, { formatVersion: '2.0.0' }), errorCode('invalid_typed_value'));
});
test('an adaptive missing pane page fails instead of treating it as a single page', async t => {
  const project = await valid(t, async p => {
    await adaptive(p);
    const file = path.join(p, 'versions/1/pages/layout.json');
    const page = await json(file); page.layout.panes.secondary.pageId = 'missing'; await write(file, page);
  });
  await assert.rejects(validateProject(project), errorCode('broken_reference'));
});
test('pane replacement cannot also request a sheet', async t => {
  const project = await valid(t, async p => {
    await adaptive(p);
    await changedPage(p, page => { page.rows[0].appActions = [{ type: 'openAnotherPage', targetId: 'detail', configuration: { containerId: 'layout', paneId: 'secondary', operation: 'replace' }, openWithSheetProperties: {} }]; });
  });
  await assert.rejects(validateProject(project), errorCode('invalid_typed_value'));
});
test('unknown navigation click actions fail as semantic types', async t => {
  const project = await valid(t, p => changedPage(p, page => { page.rightNavBarButtons = [{ clickActions: [{ type: 'inventedAction' }] }]; }));
  await assert.rejects(validateProject(project), errorCode('unknown_action_type'));
});
test('anchored overlays require a real scrolling row and ordered stops', async t => {
  const project = await valid(t, p => changedPage(p, page => { page.appearance = { backgroundOverlays: [overlay()] }; }));
  await validateProject(project);
  await changedPage(project, page => { page.appearance.backgroundOverlays[0].anchorRowId = 'missing'; });
  await assert.rejects(validateProject(project), errorCode('invalid_typed_value'));
  await changedPage(project, page => { page.appearance.backgroundOverlays[0] = overlay(); page.appearance.backgroundOverlays[0].stops.reverse(); });
  await assert.rejects(validateProject(project), errorCode('invalid_typed_value'));
});
test('invalid typed chart selection and unknown web appearance fail', async t => {
  const project = await valid(t, p => changedPage(p, page => { page.rows[0].chartViewModels = [{ highlightedDataPointIndex: -1 }]; }));
  await assert.rejects(validateProject(project), errorCode('invalid_typed_value'));
  await changedPage(project, page => { delete page.rows[0].chartViewModels; });
  const version = await json(versionPath(project)); version.globalTheme = { webAppearance: 'invented' }; await write(versionPath(project), version);
  await assert.rejects(validateProject(project), errorCode('invalid_typed_value'));
});
test('extension and localization content are opaque to layout/action checks', async t => {
  const project = await valid(t, p => changedPage(p, page => {
    const opaque = { type: 'adaptive', layout: { kind: 'unrelated' }, clickActions: [{ type: 'notACoreAction' }] };
    page.extensions = { 'example.test/data': opaque }; page.localizations = opaque;
  }));
  await validateProject(project);
});
test('an app.json symlink escaping the package fails before reading host content', async t => {
  const project = await valid(t, async (p, scratch) => {
    const outside = path.join(scratch, 'outside.json');
    await cp(path.join(p, 'app.json'), outside); await rm(path.join(p, 'app.json')); await symlink(outside, path.join(p, 'app.json'));
  });
  await assert.rejects(validateProject(project), errorCode('unsafe_path'));
});

test('a versions directory symlink escaping the package is rejected before listing it', async t => {
  const project = await valid(t, async (p, scratch) => {
    const outside = path.join(scratch, 'outside-versions');
    await rename(path.join(p, 'versions'), outside);
    await symlink(outside, path.join(p, 'versions'));
  });
  await assert.rejects(validateProject(project), errorCode('unsafe_path'));
});

test('invalid UTF-8 bytes cannot become a replacement character in valid JSON', async t => {
  const project = await valid(t, async p => {
    const bytes = Buffer.concat([
      Buffer.from('{"documentVersion":2,"name":"'), Buffer.from([0xff]),
      Buffer.from('","currentVersion":1,"versionNumbers":[1]}'),
    ]);
    await writeFile(path.join(p, 'app.json'), bytes);
  });
  await assert.rejects(validateProject(project), errorCode('invalid_json'));
});
test('well-formed non-ASCII UTF-8 project text remains valid', async t => {
  const project = await valid(t, async p => {
    const app = await json(path.join(p, 'app.json'));
    app.name = 'Café ✨'; await write(path.join(p, 'app.json'), app);
  });
  await validateProject(project);
});
