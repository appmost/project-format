import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { FormatValidationError, validateProject } from './validate.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = path.join(repositoryRoot, 'examples/minimal.appmostapp');

async function temporaryExample() {
  const directory = await mkdtemp(path.join(tmpdir(), 'appmost-format-'));
  const copy = path.join(directory, 'Project.appmostapp');
  await cp(example, copy, { recursive: true });
  return { directory, copy };
}

test('the minimal example is a valid format 2.0 package', async () => {
  const result = await validateProject(example);
  assert.deepEqual(result, {
    currentVersion: 1,
    versionNumbers: [1],
    pageCount: 1,
    rowCount: 1,
  });
});

test('an unknown semantic row type fails clearly', async () => {
  const { directory, copy } = await temporaryExample();
  try {
    const pagePath = path.join(copy, 'versions/1/pages/home.json');
    const page = JSON.parse(await readFile(pagePath, 'utf8'));
    page.rows[0].type = 'notARegisteredRow';
    await writeFile(pagePath, `${JSON.stringify(page, null, 2)}\n`);
    await assert.rejects(
      validateProject(copy),
      (error) => error instanceof FormatValidationError && error.code === 'unknown_row_type',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an unsafe page filename fails clearly', async () => {
  const { directory, copy } = await temporaryExample();
  try {
    const versionPath = path.join(copy, 'versions/1/version.json');
    const version = JSON.parse(await readFile(versionPath, 'utf8'));
    version.pageFileNames = ['../home.json'];
    await writeFile(versionPath, `${JSON.stringify(version, null, 2)}\n`);
    await assert.rejects(
      validateProject(copy),
      (error) => error instanceof FormatValidationError && error.code === 'unsafe_path',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
