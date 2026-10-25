// Pure helpers for stepping through a request path over the (prefixed) diagram ids.

const bare = (id) => String(id).replace(/^n-/, '');

// Edge ids drop the "n-" prefix (n-ui -> n-config is e-ui-config); prepareSvg then adds `${prefix}-`.
export function edgeId(a, b, has, prefix) {
  const x = bare(a), y = bare(b);
  for (const id of [`${prefix}-e-${x}-${y}`, `${prefix}-e-${y}-${x}`]) if (has(id)) return id;
  return null;
}

// current is a 0-based index into entry.steps. nodes covers every step of the entry (values are
// 1-based step numbers); edges are the transitions already travelled, up to and including the
// one arriving at `current`. `has` filters to edge ids that exist in the diagram.
export function stepView(entry, current, prefix, has = () => true) {
  const nodes = new Map();
  entry.steps.forEach((s, i) => {
    const id = `${prefix}-${s.node}`;
    nodes.set(id, [...(nodes.get(id) || []), i + 1]);
  });
  const edges = [];
  for (let i = 1; i <= current && i < entry.steps.length; i++) {
    const a = entry.steps[i - 1].node, b = entry.steps[i].node;
    if (a === b) continue;
    const e = edgeId(a, b, has, prefix);
    if (e && !edges.includes(e)) edges.push(e);
  }
  return { nodes, edges, currentNode: `${prefix}-${entry.steps[current].node}` };
}

export function sourceUrl(fullName, sha, src) {
  const path = String(src.path).split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${fullName}/blob/${sha}/${path}#L${src.line}`;
}

const str = (v) => typeof v === 'string';
const stepOk = (s) => s && str(s.node) && str(s.text) && s.source && str(s.source.path) && Number.isInteger(s.source.line);
const entryOk = (e) => e && str(e.id) && str(e.label) && str(e.trigger) && Array.isArray(e.steps) && e.steps.length > 0 && e.steps.every(stepOk);

export function isPathsDoc(x) {
  return !!x && typeof x === 'object' && str(x.full_name) && str(x.sha) && Array.isArray(x.entries) && x.entries.every(entryOk);
}

// Which screen to show. repoStatus is only meaningful (and only fetched) when indexStatus is 404:
// a 404 on the private repo itself means the token cannot see it, which is an auth problem.
export function pageState(cfg, indexStatus, repoStatus) {
  if (!cfg) return 'setup';
  if (indexStatus >= 200 && indexStatus < 300) return 'ok';
  if (indexStatus === 401 || indexStatus === 403) return 'auth';
  if (indexStatus === 404) {
    if (repoStatus === 200) return 'empty';
    if (repoStatus === 404 || repoStatus === 401 || repoStatus === 403) return 'auth';
  }
  return 'error';
}
