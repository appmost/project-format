const paneIds = new Set(['primary', 'secondary']);

function fail(code, message, jsonPath) {
  throw Object.assign(new Error(message), { code, jsonPath });
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pageReference(value, pages, jsonPath) {
  if (typeof value !== 'string' || !value.trim() || !pages.has(value)) {
    fail('broken_reference', `Missing adaptive pane page '${String(value)}'.`, jsonPath);
  }
  if (pages.get(value).type !== 'normal') {
    fail('invalid_typed_value', 'Adaptive panes currently require normal pages.', jsonPath);
  }
}

function exactKeys(value, allowed, path) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) {
    fail('invalid_typed_value', 'Unsupported adaptive layout field.', path);
  }
}

export function validateAdaptivePages(pages) {
  const byId = new Map(pages.map(page => [page.id, page]));
  for (const page of pages) {
    const path = `$.pages[${JSON.stringify(page.id)}]`;
    if (page.type !== 'adaptive') {
      if (page.layout !== undefined) fail('invalid_typed_value', 'Only adaptive pages may declare layout.', `${path}.layout`);
      continue;
    }
    const layout = page.layout;
    if (!object(layout) || !['navigationSplit', 'split'].includes(layout.kind)) {
      fail('invalid_typed_value', 'Adaptive pages require a supported layout kind.', `${path}.layout`);
    }
    exactKeys(layout, ['kind', 'panes', 'compact', 'expanded'], `${path}.layout`);
    exactKeys(layout.panes, ['primary', 'secondary'], `${path}.layout.panes`);
    if ((page.rows?.length ?? 0) || (page.tabbars?.length ?? 0)) {
      fail('invalid_typed_value', 'Adaptive containers cannot also contain rows or tabs.', path);
    }
    for (const id of paneIds) {
      const pane = layout.panes?.[id];
      if (!object(pane)) fail('invalid_typed_value', `Missing ${id} pane.`, `${path}.layout.panes`);
      exactKeys(pane, ['pageId', 'emptyPageId'], `${path}.layout.panes.${id}`);
      pageReference(pane.pageId, byId, `${path}.layout.panes.${id}.pageId`);
      if (pane.emptyPageId !== undefined) {
        if (id !== 'secondary') fail('invalid_typed_value', 'Only secondary supports an empty page.', `${path}.layout.panes.${id}`);
        pageReference(pane.emptyPageId, byId, `${path}.layout.panes.${id}.emptyPageId`);
      }
      const initial = byId.get(id === 'secondary' ? pane.emptyPageId ?? pane.pageId : pane.pageId);
      if (initial.standalone === true && initial.params?.some(parameter => parameter.mand === true)) {
        fail('invalid_typed_value', 'Initial pane pages cannot require navigation parameters; provide an empty detail page.', `${path}.layout.panes.${id}`);
      }
    }
    if (layout.panes.primary.pageId === layout.panes.secondary.pageId) {
      fail('invalid_typed_value', 'Adaptive pane references must be distinct.', `${path}.layout.panes`);
    }
    if (layout.compact !== undefined) exactKeys(layout.compact, ['behavior', 'initialPane'], `${path}.layout.compact`);
    if (layout.expanded !== undefined) exactKeys(layout.expanded, ['sizing'], `${path}.layout.expanded`);
    if (layout.compact !== undefined && (!object(layout.compact) || layout.compact.behavior !== 'stack' || !paneIds.has(layout.compact.initialPane))) {
      fail('invalid_typed_value', 'Unsupported compact adaptive behavior.', `${path}.layout.compact`);
    }
    if (layout.expanded !== undefined && (!object(layout.expanded) || layout.expanded.sizing !== 'automatic')) {
      fail('invalid_typed_value', 'Unsupported expanded adaptive sizing.', `${path}.layout.expanded`);
    }
  }
  for (const page of pages) validatePaneActions(page, byId, '$');
}

function validatePaneActions(value, pages, path) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => validatePaneActions(child, pages, `${path}[${index}]`));
  } else if (object(value)) {
    const configuration = value.configuration ?? value.cp;
    if (object(configuration) && ['containerId', 'paneId', 'operation'].some(key => Object.hasOwn(configuration, key))) {
      if (!['openAnotherPage', 'pa'].includes(value.type)) {
        fail('invalid_typed_value', 'Panel destinations are only valid on Open page actions.', `${path}.type`);
      }
      const container = pages.get(configuration?.containerId);
      if (container?.type !== 'adaptive') fail('broken_reference', 'Pane action requires an adaptive container.', `${path}.configuration.containerId`);
      if (!paneIds.has(configuration?.paneId) || configuration?.operation !== 'replace') {
        fail('invalid_typed_value', 'Pane action requires primary/secondary and replace.', `${path}.configuration`);
      }
      pageReference(value.targetId, pages, `${path}.targetId`);
      const openPage = configuration.openPage;
      if (value.openWithSheetProperties != null || value.openIndirect === true || openPage?.openIndirect === true ||
          (openPage?.awaitRes != null && openPage.awaitRes !== 'none')) {
        fail('invalid_typed_value', 'Panel navigation cannot use indirect navigation, a sheet or await a page result.', path);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'extensions' && key !== 'localizations') validatePaneActions(child, pages, `${path}.${key}`);
    }
  }
}
