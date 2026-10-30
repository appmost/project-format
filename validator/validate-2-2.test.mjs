import assert from 'node:assert/strict';
import {cp, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {validateProject, FormatValidationError} from './validate.mjs';
import {loadFormatRelease} from './releases.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = path.join(root, 'examples/responsive-row-width.appmostapp');

async function projectWithWidth(t, width, nested = false) {
  const scratch = await mkdtemp(path.join(tmpdir(), 'appmost-format-2-2-'));
  t.after(() => rm(scratch, {recursive: true, force: true}));
  const project = path.join(scratch, 'Project.appmostapp');
  await cp(example, project, {recursive: true});
  const pagePath = path.join(project, 'versions/1/pages/home.json');
  const page = JSON.parse(await readFile(pagePath, 'utf8'));
  if (nested) page.rows[0].childProperties = {
    children: [{id: 'nested', type: 'singleLabel', labelModels: [{text: 'Nested content'}]}],
  };
  const row = nested ? page.rows[0].childProperties.children[0] : page.rows[0];
  if (width === undefined) delete row.maxCellWidth;
  else row.maxCellWidth = width;
  await writeFile(pagePath, JSON.stringify(page, null, 2) + '\n');
  return project;
}

test('the 2.2 example validates a capped ordinary row', async () => {
  const result = await validateProject(example, {formatVersion: '2.2.0'});
  assert.equal(result.rowCount, 1);
});

test('the normative maximum-width example validates as a real project row', async t => {
  const specification = await readFile(path.join(root, 'spec/2.2.0.md'), 'utf8');
  const rows = [...specification.matchAll(/```json\s*([\s\S]*?)```/g)]
    .filter((match) => match[1].includes('"maxCellWidth"'))
    .map((match) => JSON.parse(match[1]));
  assert.equal(rows.length, 1);
  const project = await projectWithWidth(t, 720);
  const pagePath = path.join(project, 'versions/1/pages/home.json');
  const page = JSON.parse(await readFile(pagePath, 'utf8'));
  page.rows = rows;
  await writeFile(pagePath, JSON.stringify(page, null, 2) + '\n');
  assert.equal((await validateProject(project, {formatVersion: '2.2.0'})).rowCount, 1);
});

for (const nested of [false, true]) {
  for (const width of [undefined, null, 1, 480]) {
    test(`2.2 accepts ${String(width)} maxCellWidth on a ${nested ? 'nested' : 'top-level'} row`, async t => {
      await validateProject(await projectWithWidth(t, width, nested), {formatVersion: '2.2.0'});
    });
  }
  for (const width of [0, -1, 0.5, '480', false]) {
    test(`2.2 rejects ${JSON.stringify(width)} maxCellWidth on a ${nested ? 'nested' : 'top-level'} row`, async t => {
      await assert.rejects(
        validateProject(await projectWithWidth(t, width, nested), {formatVersion: '2.2.0'}),
        error => error instanceof FormatValidationError && error.code === 'invalid_typed_value',
      );
    });
  }
}

test('row width is a new optional capability without new types or decoder major', async () => {
  const before = await loadFormatRelease('2.1.1');
  const current = await loadFormatRelease('2.2.0');
  assert.equal(current.registry.documentVersion, 2);
  for (const group of ['rowTypes', 'actionTypes', 'valueTypes', 'webAppearances']) {
    assert.deepEqual(
      current.registry[group].map(({type, introducedIn}) => ({type, introducedIn})),
      before.registry[group].map(({type, introducedIn}) => ({type, introducedIn})),
    );
  }
  assert.equal(before.schemas.page.$defs.row.properties.maxCellWidth, undefined);
  assert.deepEqual(current.schemas.page.$defs.row.properties.maxCellWidth.type, ['integer', 'null']);
  assert.equal(current.schemas.page.$defs.row.properties.maxCellWidth.minimum, 1);
});
