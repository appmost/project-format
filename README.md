# Appmost Project Format

Appmost Project Format is the open specification for `.appmostapp` project
packages. The current reference release is **2.1.1**, with **documentVersion 2**.
The semantic reference release, decoder major and numbered stored project
versions are separate axes.

This patch corrects introduction metadata for the existing 2.1 feature set.
It adds no runtime type or schema field. The canonical public Git 2.0 files and
the already published website 2.1.0 files remain byte for byte unchanged.
See [the publication errata](publication-errata.json) for the exact five
historical introduction errors and the separately retained mislabeled website
2.0 evidence.

Appmost is the reference implementation. Appmost Design opens and previews the
format with a smaller authoring surface. Product source code, customer data
and private migration fixtures are not part of this repository. Renderer
availability and a complete product release remain separate from reference
publication.

## Specification and releases

- [Normative 2.1.1 specification](spec/2.1.1.md)
- [Release manifest and artifact checksums](releases.json)
- [Current type registry](registry/2.1.1.json)
- [Current app, page and version schemas](schemas/2.1.1/)
- [Chart properties and preset defaults](registry/chart-properties-2.1.1.json)
- [Original 2.0 specification](spec/2.0.md), [registry](registry/2.0.json)
  and [schemas](schemas/2.0/)
- [Frozen website 2.1.0 registry](registry/2.1.json) and [schemas](schemas/2.1/)
- [Observed mislabeled website 2.0 artifacts](publication-history/observed-web-2.0/)

Versioned published artifacts are immutable, including reference candidates.
Compatible additions need a new minor release; editorial corrections need a
new patch and URL; breaking semantics need a new major and decoder version.

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
numbered directory contains settings, pages and optional localizations.
Shared resources live at the package root. A format release such as 2.1.1 is
not a valid `versions/` directory name.

## Validate a project

Node.js 20 or newer is required. The validator has no package dependencies.

```sh
npm run validate -- examples/minimal.appmostapp
npm run validate -- examples/row-catalog.appmostapp --format-version=2.0.0
npm run check:releases
npm test
```

The default uses the release manifest's current reference. An unknown requested
release fails; it does not select a substitute. `documentVersion` remains 2
for every published 2.x reference.

The validator checks package and page indexes, document versions, page and
adaptive-pane references, row/action/value types, namespaced extensions,
published structural schema assertions, background overlays and pane actions.
It checks artifact hashes and exact historical introduction errata in the
release suite. It does not execute expressions, authenticate services or
establish that a renderer supports every valid feature.

The schema evaluator intentionally supports the closed assertion set used by
these reference schemas. Unsupported schema keywords or external references
fail explicitly. It is not a general-purpose JSON Schema implementation.

## Existing 2.1 capabilities

- Adaptive pages compose two existing normal pages with compact stack behavior
  and expanded content regions. Open page can replace a semantic pane.
- Background contrast overlays preserve content and page-graph semantics.
- Donut charts use ordered data points and an optional selected segment index.
- Navigation and toolbar items support dynamic icon expressions.
- Web appearance selects standard, glass, brand or material navigation styling.
- Speech transcription and remote row values retain explicit per-renderer
  support and runtime requirements.

These features were already represented in the 2.1.0 reference. The 2.1.1 patch
corrects documentation and five introduction literals; it does not backdate
arbitrary additions or normalize old project content.

## Implementation support

A valid project may require features unavailable in a particular renderer.
The [current registry](registry/2.1.1.json) declares support per type.

| Format surface | iOS (SwiftUI) | Android (Compose) | Appmost Design |
| --- | ---: | ---: | ---: |
| Row types | 94/94 | 94/94 | 94/94 in the SwiftUI preview |
| Action types | 74/76 | 54/76 | 17/76 in the editor and interactive preview |
| Value types | 20/20 | 20/20 | 19/20 readable; 16/20 directly selectable |

Row preview support does not mean every property has an editor control.
Appmost Design exposes `copyString`, `delay`, `dismiss`,
`dismissTabBar`, `doNothing`, `multipleActions`,
`openAnotherPage`, `openWebPage`, `playSound`, `popPage`,
`resetNavigation`, `scrollPage`, `shareLink`,
`showActionSheet`, `showDialog`, `showInfoPopup` and
`transcribeSpeech`. The registry remains authoritative for platform scope.

`element`, `longInteger` and `unknown` are readable but not directly
selectable in Appmost Design. `remoteRows` is neither readable nor selectable
there. Unsupported and retired names remain documented; they do not authorize
silent replacement behavior.

## Examples and chart reference

[The minimal example](examples/minimal.appmostapp/) is a small valid package.
[The historical row catalog](examples/row-catalog.appmostapp/) covers the 93
canonical 2.0 row types; it is not a claim to contain all 94 current types.

The current chart types are `barChart`, `lineBarChart`, `areaChart`,
`rangeChart` and `donutChart`. The
[chart registry](registry/chart-properties-2.1.1.json) specifies their properties.
The [visual row catalog](https://www.appmost.ai/format/rows/) and
[chart reference](https://www.appmost.ai/format/charts/) are explanatory, not
pixel-normative.

## License

Licensed under the Apache License 2.0. Appmost names and logos remain protected
trademarks. Format support does not imply Appmost endorsement.
