# Appmost Project Format

Appmost Project Format is the open specification for `.appmostapp` project
packages. This repository documents document version 2 and includes JSON
Schemas, the canonical type registry, a minimal example, and a small validator.

Appmost is the reference implementation. Appmost Design can open and preview
the format, with a deliberately smaller authoring surface described below. The
product source code is not part of this repository.

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
- `examples/compose-row-catalog.appmostapp/` — every row type in a renderable test project
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

## Implementation support

A structurally valid project may use a feature that is not available in every
renderer. `registry/2.0.json` publishes row support for iOS with SwiftUI and
Android with Compose, together with the narrower Appmost Design capabilities.

| Format surface | iOS (SwiftUI) | Android (Compose) | Appmost Design |
| --- | ---: | ---: | ---: |
| Row types | 116/116 | 116/116 | 116/116 in the SwiftUI preview |
| Action types | 74/75 | 52/75 | 15/75 in the editor and interactive preview |
| Value types | 19/19 | 19/19 | 19/19 readable; 16/19 directly selectable |

The Appmost Design row count describes preview compatibility. It does not mean
that every row property has a dedicated control in the editor.

Appmost Design supports these action types:

`delay`, `dismiss`, `dismissTabBar`, `doNothing`, `multipleActions`,
`openAnotherPage`, `openWebPage`, `playSound`, `popPage`, `resetNavigation`,
`scrollPage`, `shareLink`, `showActionSheet`, `showDialog`, and `showInfoPopup`.

The three value types that are readable but not directly selectable in Appmost
Design are `element`, `longInteger`, and `unknown`.

The registry exposes this distinction per type:

- rows: `iosSwiftUI`, `androidCompose`, and `appmostDesignPreview`;
- actions: `ios`, `android`, and `appmostDesign`;
- values: `ios`, `android`, `appmostDesignReadable`, and
  `appmostDesignSelectable`.

These product capability flags do not affect whether a package is structurally
valid.

## Renderable row catalog

[`examples/compose-row-catalog.appmostapp`](examples/compose-row-catalog.appmostapp)
contains all 116 row types and focused pages for Action, Content, Input, Layout,
Media, Data, and Location examples. It is the fixture used for the Android
Compose screenshots on [appmost.ai/format](https://www.appmost.ai/format/).

Validate it with:

```sh
npm run validate -- examples/compose-row-catalog.appmostapp
```

## License

Licensed under the Apache License 2.0. Appmost names and logos remain protected
trademarks. Format support does not imply Appmost endorsement.
