export function validateBackgroundOverlays(page) {
  const overlays = page.appearance?.backgroundOverlays;
  if (overlays === undefined) return;
  const fail = (message) => { throw new Error(`Page '${page.id}' backgroundOverlays: ${message}`); };
  if (!Array.isArray(overlays)) fail('expected an array');
  const rows = new Set((page.rows ?? []).filter((row) => !row.stickyType || row.stickyType === 'none').map((row) => row.id));
  const fraction = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  const hex = (value) => typeof value === 'string' && /^[0-9a-f]{6}$/i.test(value);
  const overlayIds = new Set();
  for (const overlay of overlays) {
    if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) fail('expected an overlay object');
    if (overlay.id !== undefined) {
      if (typeof overlay.id !== 'string' || !overlay.id || overlayIds.has(overlay.id)) fail('overlay IDs must be nonempty and unique');
      overlayIds.add(overlay.id);
    }
    const {direction = 'topToBottom', start = 0, end = 1, offset = -80, length = 180} = overlay;
    if (!['topToBottom','bottomToTop','leftToRight','rightToLeft'].includes(direction)
      || !fraction(start) || !fraction(end) || start >= end || !Number.isFinite(offset) || !Number.isFinite(length) || length <= 0) fail('invalid direction or extent');
    if (overlay.anchorRowId !== undefined && (direction !== 'topToBottom' || !rows.has(overlay.anchorRowId))) fail('anchor must reference a scrolling row and run top to bottom');
    if (!Array.isArray(overlay.stops) || overlay.stops.length < 2) fail('at least two ordered stops required');
    let previous = -1;
    const stopIds = new Set();
    for (const stop of overlay.stops) {
      if (!stop || !fraction(stop.location) || stop.location < previous || !fraction(stop.opacity) || !hex(stop.color)
        || (stop.darkColor !== undefined && !hex(stop.darkColor))) fail('invalid stop position, color or opacity');
      if (stop.id !== undefined) {
        if (typeof stop.id !== 'string' || !stop.id || stopIds.has(stop.id)) fail('stop IDs must be nonempty and unique');
        stopIds.add(stop.id);
      }
      previous = stop.location;
    }
  }
}
