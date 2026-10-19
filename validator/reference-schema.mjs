import { isDeepStrictEqual } from 'node:util';

// A closed subset for the assertions used in the published reference schemas.
// Unknown keywords and external references fail, rather than reducing validation.
const annotations = new Set(['$schema', '$id', '$comment', 'title', 'description', 'default']);
const assertions = new Set([
  '$ref', '$defs', 'type', 'enum', 'const', 'properties', 'required',
  'additionalProperties', 'propertyNames', 'items', 'minItems', 'uniqueItems',
  'minLength', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum',
  'allOf', 'anyOf', 'if', 'then', 'else', 'not',
]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function assertSupportedSchema(schema) {
  if (typeof schema === 'boolean') return;
  if (!object(schema)) throw new Error('Invalid reference schema.');
  for (const key of Object.keys(schema)) {
    if (!annotations.has(key) && !assertions.has(key)) throw new Error('Unsupported reference schema keyword: ' + key);
  }
  if (schema.$ref !== undefined && !schema.$ref.startsWith('#/')) throw new Error('Reference schemas must use local references.');
  for (const key of ['properties', '$defs']) {
    for (const child of Object.values(schema[key] ?? {})) assertSupportedSchema(child);
  }
  for (const key of ['items', 'propertyNames', 'if', 'then', 'else', 'not', 'additionalProperties']) {
    if (schema[key] !== undefined) assertSupportedSchema(schema[key]);
  }
  for (const key of ['allOf', 'anyOf']) {
    for (const child of schema[key] ?? []) assertSupportedSchema(child);
  }
}

export function validateReferenceSchema(value, schema, root = schema, jsonPath = '$') {
  const invalid = message => { throw Object.assign(new Error(message), { jsonPath }); };
  if (schema === true) return;
  if (schema === false) invalid('Value is not permitted.');
  if (schema.$ref !== undefined) {
    const target = schema.$ref.slice(2).split('/').reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], root);
    if (target === undefined) throw new Error('Unresolved reference schema pointer: ' + schema.$ref);
    validateReferenceSchema(value, target, root, jsonPath);
  }
  const matches = candidate => {
    try { validateReferenceSchema(value, candidate, root, jsonPath); return true; }
    catch (error) { if (!error.jsonPath) throw error; return false; }
  };
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const typed = type => ({
      object: object(value), array: Array.isArray(value), null: value === null,
      string: typeof value === 'string', boolean: typeof value === 'boolean',
      number: typeof value === 'number' && Number.isFinite(value), integer: Number.isInteger(value),
    })[type] === true;
    if (!types.some(typed)) invalid('Expected ' + types.join(' or ') + '.');
  }
  if (schema.const !== undefined && !isDeepStrictEqual(value, schema.const)) invalid('Unexpected constant value.');
  if (schema.enum !== undefined && !schema.enum.some(entry => isDeepStrictEqual(value, entry))) invalid('Value is not in the allowed enum.');
  for (const child of schema.allOf ?? []) validateReferenceSchema(value, child, root, jsonPath);
  if (schema.anyOf !== undefined && !schema.anyOf.some(matches)) invalid('No permitted schema alternative matches.');
  if (schema.not !== undefined && matches(schema.not)) invalid('Value matches a forbidden shape.');
  if (schema.if !== undefined) {
    const branch = matches(schema.if) ? schema.then : schema.else;
    if (branch !== undefined) validateReferenceSchema(value, branch, root, jsonPath);
  }
  if (object(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) invalid('Missing required property ' + key + '.');
    }
    for (const [key, child] of Object.entries(value)) {
      const childPath = jsonPath + '[' + JSON.stringify(key) + ']';
      if (schema.propertyNames !== undefined) validateReferenceSchema(key, schema.propertyNames, root, childPath);
      if (Object.hasOwn(schema.properties ?? {}, key)) validateReferenceSchema(child, schema.properties[key], root, childPath);
      else if (schema.additionalProperties !== undefined) validateReferenceSchema(child, schema.additionalProperties, root, childPath);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) invalid('Too few array items.');
    if (schema.uniqueItems && value.some((entry, index) => value.slice(0, index).some(previous => isDeepStrictEqual(entry, previous)))) invalid('Array items must be unique.');
    if (schema.items !== undefined) value.forEach((child, index) => validateReferenceSchema(child, schema.items, root, jsonPath + '[' + index + ']'));
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) invalid('String is too short.');
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) invalid('String does not match the required pattern.');
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) invalid('Number is below the minimum.');
    if (schema.maximum !== undefined && value > schema.maximum) invalid('Number is above the maximum.');
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) invalid('Number must exceed the minimum.');
  }
}
