# Appmost Project Format

Appmost Project Format is the open specification for `.appmostapp` project
packages. This repository documents document version 2 and includes JSON
Schemas, the canonical type registry, a minimal example, and a small validator.

Appmost and Pixelmost are reference implementations. Their editor and renderer
source code are not part of this repository.

## Package layout

```text
MyProject.appmostapp/
├── app.json
├── versions/
│   └── 1/
│       ├── version.json
│       ├── localizations.json
│       └── pages/
│           └── home.json
└── resources/
```

`app.json` selects the active version and lists every stored version. Each
numbered directory contains that version's settings, pages, and optional
localizations. Shared resources live at the package root.

See [the 2.0 specification](spec/2.0.md) for the normative requirements and
[appmost.ai/format](https://www.appmost.ai/format/) for the searchable row
catalog and visual reference.

## Repository contents

- `spec/2.0.md` — the format specification
- `schemas/2.0/` — schemas for app, version, and page documents
- `registry/2.0.json` — canonical type names and renderer support
- `examples/minimal.appmostapp/` — a small valid project
- `validator/` — the dependency-free reference validator and its tests

## Validate a project

Node.js 20 or newer is required.

```sh
npm run validate -- examples/minimal.appmostapp
```

Run the validator tests with:

```sh
npm test
```

The validator checks package structure, document versions, version and page
references, safe relative paths, semantic row types, action types, value types,
and namespaced extensions.

## Renderer support

A structurally valid project may use a feature that is not available in every
renderer. `registry/2.0.json` publishes row support for iOS with SwiftUI and
Android with Compose. Unsupported required content must fail clearly.

## License

Licensed under the Apache License 2.0. Appmost names and logos remain protected
trademarks. Format support does not imply Appmost endorsement.
