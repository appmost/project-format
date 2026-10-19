#!/usr/bin/env node
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFormatRelease } from './releases.mjs';
import { validateReferenceSchema } from './reference-schema.mjs';
import { validateAdaptivePages } from './adaptive-layout.mjs';
import { validateBackgroundOverlays } from './background-overlays.mjs';

const MAX_VERSION = 2147483647;
const EXTENSION_NAME = /^[a-z0-9.-]+\/[a-zA-Z0-9._-]+$/;
const PAGE_FILE_NAME = /^[^./\\][^/\\]*\.json$/;

export class FormatValidationError extends Error {
  constructor(code, message, jsonPath) {
    super(message);
    this.name = 'FormatValidationError';
    this.code = code;
    this.path = jsonPath;
  }
}

function fail(code, message, jsonPath) {
  throw new FormatValidationError(code, message, jsonPath);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(filePath, displayPath) {
  let source;
  try {
    const bytes = await readFile(filePath);
    try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { fail('invalid_json', displayPath + ' must contain valid UTF-8 JSON.'); }
  } catch (error) {
    if (error?.code === 'ENOENT') fail('invalid_package', `Missing ${displayPath}.`);
    throw error;
  }

  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    fail('invalid_json', `${displayPath}: ${error.message}`);
  }
  if (!isObject(value)) fail('invalid_package', `${displayPath} must contain an object.`);
  return value;
}

async function visibleEntries(directory, displayPath) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => !entry.name.startsWith('.'));
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      fail('invalid_package', `${displayPath} is missing or is not a directory.`);
    }
    throw error;
  }
}

function positiveInteger(value, jsonPath) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_VERSION) {
    fail('invalid_typed_value', `${jsonPath} must be a positive 32-bit integer.`, jsonPath);
  }
  return value;
}

function documentVersion(value, sourceName) {
  if (!Object.hasOwn(value, 'documentVersion')) {
    fail('missing_document_version', `${sourceName} must declare documentVersion 2.`, '$.documentVersion');
  }
  if (value.documentVersion !== 2) {
    fail('unsupported_document_version', `${sourceName} uses documentVersion ${String(value.documentVersion)}.`, '$.documentVersion');
  }
}

function extensions(value, jsonPath = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => extensions(entry, `${jsonPath}[${index}]`));
    return;
  }
  if (!isObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (key === 'extensions') {
      if (!isObject(child)) fail('invalid_package', `${jsonPath}.extensions must be an object.`, `${jsonPath}.extensions`);
      for (const name of Object.keys(child)) {
        if (!EXTENSION_NAME.test(name)) fail('invalid_package', `Extension '${name}' is not namespaced.`, `${jsonPath}.extensions`);
      }
    } else if (key !== 'localizations') {
      extensions(child, `${jsonPath}.${key}`);
    }
  }
}

function uniqueStrings(values, jsonPath) {
  if (!Array.isArray(values) || values.length === 0) {
    fail('invalid_package', `${jsonPath} must be a non-empty array.`, jsonPath);
  }
  if (values.some((value) => typeof value !== 'string')) {
    fail('invalid_typed_value', `${jsonPath} must contain strings.`, jsonPath);
  }
  if (new Set(values).size !== values.length) fail('duplicate_id', `${jsonPath} contains duplicates.`, jsonPath);
  return values;
}

function validateRows(rows, registry, pagePath) {
  if (rows === undefined) return 0;
  if (!Array.isArray(rows)) fail('invalid_package', `${pagePath}.rows must be an array.`, `${pagePath}.rows`);

  const rowTypes = new Set(registry.rowTypes.map((entry) => entry.type));
  const actionTypes = new Set(registry.actionTypes.map((entry) => entry.type));
  const ids = new Set();
  let count = 0;

  function visit(row, rowPath) {
    if (!isObject(row)) fail('invalid_package', `${rowPath} must be an object.`, rowPath);
    if (typeof row.id !== 'string' || row.id.length === 0) fail('invalid_package', `${rowPath}.id must be a non-empty string.`, `${rowPath}.id`);
    if (ids.has(row.id)) fail('duplicate_id', `Duplicate row id '${row.id}'.`, `${rowPath}.id`);
    ids.add(row.id);
    if (typeof row.type !== 'string' || !rowTypes.has(row.type)) {
      fail('unknown_row_type', `Unknown row type '${String(row.type)}'.`, `${rowPath}.type`);
    }
    count += 1;

    if (row.appActions !== undefined) {
      if (!Array.isArray(row.appActions)) fail('invalid_package', `${rowPath}.appActions must be an array.`, `${rowPath}.appActions`);
      row.appActions.forEach((action, index) => {
        if (!isObject(action) || typeof action.type !== 'string' || !actionTypes.has(action.type)) {
          fail('unknown_action_type', `Unknown action type '${String(action?.type)}'.`, `${rowPath}.appActions[${index}].type`);
        }
      });
    }

    const children = row.childProperties?.children;
    if (children !== undefined) {
      if (!Array.isArray(children)) fail('invalid_package', `${rowPath}.childProperties.children must be an array.`, `${rowPath}.childProperties.children`);
      children.forEach((child, index) => visit(child, `${rowPath}.childProperties.children[${index}]`));
    }
  }

  rows.forEach((row, index) => visit(row, `${pagePath}.rows[${index}]`));
  return count;
}

function validateVariables(page, registry, pagePath) {
  if (page.variables === undefined) return;
  if (!Array.isArray(page.variables)) fail('invalid_package', `${pagePath}.variables must be an array.`, `${pagePath}.variables`);
  const valueTypes = new Set(registry.valueTypes.map((entry) => entry.type));
  const ids = new Set();
  page.variables.forEach((variable, index) => {
    const variablePath = `${pagePath}.variables[${index}]`;
    if (!isObject(variable) || typeof variable.id !== 'string' || variable.id.length === 0) {
      fail('invalid_package', `${variablePath}.id must be a non-empty string.`, `${variablePath}.id`);
    }
    if (ids.has(variable.id)) fail('duplicate_id', `Duplicate variable id '${variable.id}'.`, `${variablePath}.id`);
    ids.add(variable.id);
    if (!isObject(variable.valueType) || !valueTypes.has(variable.valueType.baseType)) {
      fail('unknown_value_type', `Unknown value type '${String(variable.valueType?.baseType)}'.`, `${variablePath}.valueType.baseType`);
    }
  });
}

function actionCollections(value, registry, jsonPath) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => actionCollections(child, registry, jsonPath + '[' + index + ']'));
    return;
  }
  if (!isObject(value)) return;
  const types = new Set(registry.actionTypes.map(entry => entry.type));
  for (const [key, child] of Object.entries(value)) {
    if (key === 'extensions' || key === 'localizations') continue;
    const childPath = jsonPath + '.' + key;
    if (key === 'appActions' || key === 'clickActions') {
      if (!Array.isArray(child)) fail('invalid_package', childPath + ' must be an array.', childPath);
      child.forEach((action, index) => {
        if (!isObject(action) || !types.has(action.type)) {
          fail('unknown_action_type', 'Unknown action type: ' + String(action?.type), childPath + '[' + index + '].type');
        }
      });
    }
    actionCollections(child, registry, childPath);
  }
}

function referenceSchema(value, schema, sourceName) {
  try { validateReferenceSchema(value, schema); }
  catch (error) {
    if (!error.jsonPath) throw error;
    fail('invalid_typed_value', sourceName + ': ' + error.message, error.jsonPath);
  }
}

async function packagePath(root, filePath, displayPath) {
  const resolved = await realpath(filePath).catch(() => fail('invalid_package', 'Missing ' + displayPath + '.'));
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    fail('unsafe_path', displayPath + ' escapes the package.');
  }
  return resolved;
}

async function packageJson(root, filePath, displayPath) {
  return readJson(await packagePath(root, filePath, displayPath), displayPath);
}

export async function validateProject(source, { formatVersion } = {}) {
  const root = await realpath(source).catch(() => fail('invalid_package', `${source} does not exist.`));
  if (!root.endsWith('.appmostapp')) fail('invalid_package', 'The package directory must end in .appmostapp.');

  const { registry, schemas } = await loadFormatRelease(formatVersion);
  const app = await packageJson(root, path.join(root, 'app.json'), 'app.json');
  documentVersion(app, 'app.json');
  extensions(app);
  referenceSchema(app, schemas.app, 'app.json');

  if (typeof app.name !== 'string') fail('invalid_typed_value', '$.name must be a string.', '$.name');
  const currentVersion = positiveInteger(app.currentVersion, '$.currentVersion');
  if (!Array.isArray(app.versionNumbers) || app.versionNumbers.length === 0) {
    fail('invalid_package', '$.versionNumbers must be a non-empty array.', '$.versionNumbers');
  }
  const versionNumbers = app.versionNumbers.map((value, index) => positiveInteger(value, `$.versionNumbers[${index}]`));
  if (new Set(versionNumbers).size !== versionNumbers.length) fail('duplicate_id', '$.versionNumbers contains duplicates.', '$.versionNumbers');
  if (!versionNumbers.includes(currentVersion)) fail('broken_reference', '$.currentVersion is not listed in $.versionNumbers.', '$.currentVersion');
  if (app.highestVersion !== undefined && positiveInteger(app.highestVersion, '$.highestVersion') < Math.max(...versionNumbers)) {
    fail('invalid_package', '$.highestVersion is lower than a stored version.', '$.highestVersion');
  }

  const versionsRoot = await packagePath(root, path.join(root, 'versions'), 'versions/');
  const versionEntries = await visibleEntries(versionsRoot, 'versions/');
  if (versionEntries.some((entry) => !entry.isDirectory() || !/^[1-9]\d*$/.test(entry.name))) {
    fail('unsafe_path', 'versions/ may contain only positive-integer directories.');
  }
  const storedVersions = versionEntries.map((entry) => Number(entry.name));
  if (storedVersions.length !== versionNumbers.length || storedVersions.some((value) => !versionNumbers.includes(value))) {
    fail('broken_reference', 'versions/ directories do not match $.versionNumbers.');
  }

  let pageCount = 0;
  let rowCount = 0;
  for (const number of [...versionNumbers].sort((left, right) => left - right)) {
    const versionRoot = path.join(versionsRoot, String(number));
    const versionPath = `versions/${number}/version.json`;
    const version = await packageJson(root, path.join(versionRoot, 'version.json'), versionPath);
    documentVersion(version, versionPath);
    extensions(version);
    if (positiveInteger(version.version, `${versionPath}.version`) !== number) {
      fail('broken_reference', `${versionPath}.version does not match its directory.`, `${versionPath}.version`);
    }
    if (version.releaseState !== undefined && version.releaseState !== 'locked') {
      fail('invalid_typed_value', `${versionPath}.releaseState must be 'locked' when present.`, `${versionPath}.releaseState`);
    }
    if (typeof version.startPageId !== 'string' || version.startPageId.length === 0) {
      fail('broken_reference', `${versionPath}.startPageId must be a non-empty string.`, `${versionPath}.startPageId`);
    }

    const pageFileNames = uniqueStrings(version.pageFileNames, `${versionPath}.pageFileNames`);
    if (pageFileNames.some((name) => !PAGE_FILE_NAME.test(name))) {
      fail('unsafe_path', `${versionPath}.pageFileNames contains an unsafe filename.`, `${versionPath}.pageFileNames`);
    }
    referenceSchema(version, schemas.version, versionPath);
    const pagesRoot = await packagePath(root, path.join(versionRoot, 'pages'), 'pages/');
    const pageEntries = await visibleEntries(pagesRoot, `versions/${number}/pages/`);
    if (pageEntries.some((entry) => !entry.isFile())) fail('unsafe_path', `versions/${number}/pages/ may contain only files.`);
    const actualPages = pageEntries.map((entry) => entry.name);
    if (actualPages.length !== pageFileNames.length || actualPages.some((name) => !pageFileNames.includes(name))) {
      fail('broken_reference', `${versionPath}.pageFileNames does not match its pages directory.`, `${versionPath}.pageFileNames`);
    }

    const pageIds = new Set();
    const pages = [];
    for (const fileName of pageFileNames) {
      const pagePath = `versions/${number}/pages/${fileName}`;
      const page = await packageJson(root, path.join(pagesRoot, fileName), pagePath);
      extensions(page);
      referenceSchema(page, schemas.page, pagePath);
      actionCollections(page, registry, pagePath);
      if (typeof page.id !== 'string' || page.id.length === 0) fail('broken_reference', `${pagePath}.id must be a non-empty string.`, `${pagePath}.id`);
      if (pageIds.has(page.id)) fail('duplicate_id', `Duplicate page id '${page.id}'.`, `${pagePath}.id`);
      pageIds.add(page.id);
      pages.push(page);
      rowCount += validateRows(page.rows, registry, pagePath);
      validateVariables(page, registry, pagePath);
      pageCount += 1;
    }
    try { validateAdaptivePages(pages); }
    catch (error) { fail(error.code ?? 'invalid_typed_value', error.message, error.jsonPath); }
    pages.forEach((page, index) => {
      try { validateBackgroundOverlays(page); }
      catch (error) { fail('invalid_typed_value', error.message, 'pages[' + index + '].appearance.backgroundOverlays'); }
    });
    if (!pageIds.has(version.startPageId)) {
      fail('broken_reference', `${versionPath}.startPageId does not reference a stored page.`, `${versionPath}.startPageId`);
    }

    const versionEntries = await visibleEntries(versionRoot, `versions/${number}/`);
    const localizationEntry = versionEntries.find((entry) => entry.name === 'localizations.json');
    if (localizationEntry) await packageJson(root, path.join(versionRoot, 'localizations.json'), `versions/${number}/localizations.json`);
  }

  return { currentVersion, versionNumbers, pageCount, rowCount };
}

async function main() {
  const args = process.argv.slice(2);
  const option = args.find(argument => argument.startsWith('--format-version='));
  const formatVersion = option?.slice('--format-version='.length);
  const positional = args.filter(argument => argument !== option);
  const source = positional[0];
  if (!source || positional.length !== 1 || source.startsWith('--')) {
    console.error('Usage: npm run validate -- <project.appmostapp> [--format-version=2.1.1]');
    process.exitCode = 2;
    return;
  }
  try {
    const release = await loadFormatRelease(formatVersion);
    const result = await validateProject(path.resolve(source), { formatVersion: release.version });
    console.log(`valid Appmost Project Format ${release.version} / documentVersion 2 package (${result.versionNumbers.length} version(s), ${result.pageCount} page(s), ${result.rowCount} row(s))`);
  } catch (error) {
    console.error(`${error.code ?? 'validation_failed'}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
