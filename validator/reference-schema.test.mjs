import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSupportedSchema, validateReferenceSchema } from './reference-schema.mjs';

test('unsupported schema keywords and remote references fail explicitly', () => {
  assert.throws(() => assertSupportedSchema({ maxLength: 2 }), /Unsupported/);
  assert.throws(() => assertSupportedSchema({ $ref: 'https://example.test/schema' }), /local references/);
});
test('schema conditionals distinguish required, absent and forbidden layout fields', () => {
  const schema = {
    if: { required: ['kind'], properties: { kind: { const: 'adaptive' } } },
    then: { required: ['layout'] },
    else: { not: { required: ['layout'] } },
  };
  validateReferenceSchema({ kind: 'normal' }, schema);
  validateReferenceSchema({ kind: 'adaptive', layout: {} }, schema);
  assert.throws(() => validateReferenceSchema({ kind: 'adaptive' }, schema), /Missing required/);
  assert.throws(() => validateReferenceSchema({ kind: 'normal', layout: {} }, schema), /forbidden/);
});
test('schema constraints operate structurally, including local refs and opaque additional properties', () => {
  const schema = { $defs: { token: { type: 'string', minLength: 1 } }, type: 'array', uniqueItems: true, items: { $ref: '#/$defs/token' } };
  assertSupportedSchema(schema); validateReferenceSchema(['a', 'b'], schema);
  assert.throws(() => validateReferenceSchema(['a', 'a'], schema), /unique/);
  assert.throws(() => validateReferenceSchema([''], schema), /too short/);
});
