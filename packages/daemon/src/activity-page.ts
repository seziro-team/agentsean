export function activityPageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Activity — Agent Sean</title>
  <style>
    :root { color-scheme: light dark; --fg: #111; --muted: #555; --acc: #0b57d0; --bg: #f6f7f9; --card: #fff; --bd: #d0d7de; --del: #c00; --ins: #0a0; }
    @media (prefers-color-scheme: dark) {
      :root { --fg: #eef; --muted: #9aa; --acc: #8ab4f8; --bg: #0f1115; --card: #171a21; --bd: #2c313a; --del: #f88; --ins: #8d8; }
    }
    body { font: 16px/1.45 system-ui, sans-serif; margin: 0; background: var(--bg); color: var(--fg); }
    main { max-width: 880px; margin: 2rem auto; padding: 0 1.25rem 3rem; }
    h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
    p.lead { color: var(--muted); margin-top: 0; }
    .card { background: var(--card); border: 1px solid var(--bd); border-radius: 12px; padding: 1.25rem; margin: 1rem 0; }
    button { background: var(--acc); color: #fff; border: 0; border-radius: 8px; padding: .5rem 1rem; font: inherit; cursor: pointer; }
    button.secondary { background: transparent; color: var(--acc); border: 1px solid var(--acc); }
    pre { overflow: auto; background: var(--bg); padding: .75rem; border-radius: 8px; font-size: .8rem; }
    .del { color: var(--del); }
    .ins { color: var(--ins); }
    .muted { color: var(--muted); font-size: .9rem; }
    .row { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
    a { color: var(--acc); }
  </style>
</head>
<body>
<main>
  <h1>Activity</h1>
  <p class="lead">Every write is a reversible diff. One click reverts it. The LLM never holds credentials.</p>
  <p class="muted"><a href="/connect">Connect Google</a></p>
  <div id="app"><p class="muted">Loading…</p></div>
</main>
<script>
const csrf = { "x-sean-csrf": "1" };
function tokenFromHash() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  return h.get("token");
}
async function session() {
  const t = tokenFromHash();
  const headers = t ? { "x-sean-token": t } : {};
  const r = await fetch("/api/session", { headers });
  if (t && r.ok) history.replaceState(null, "", location.pathname + location.search);
  return r.ok;
}
async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json", ...csrf, ...(opts.headers || {}) },
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!r.ok) throw new Error((json && (json.error || json.message)) || r.status + " " + path);
  return json;
}
function el(html) { const d = document.createElement("div"); d.innerHTML = html; return d; }
function render(node) { document.getElementById("app").replaceChildren(node); }
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function diffHtml(before, after) {
  const a = String(before || "").split("\\n");
  const b = String(after || "").split("\\n");
  const max = Math.max(a.length, b.length);
  const lines = [];
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) lines.push("<div class='del'>- " + esc(a[i]) + "</div>");
    if (b[i] !== undefined) lines.push("<div class='ins'>+ " + esc(b[i]) + "</div>");
  }
  return lines.join("") || "<div class='muted'>No line-level diff.</div>";
}
async function revert(id) {
  await api("/api/changes/" + id + "/revert", { method: "POST", body: "{}" });
  await show();
}
async function show() {
  const data = await api("/api/changes");
  const actions = await api("/api/actions");
  const wrap = document.createElement("div");
  if (!data.changes.length && !actions.actions.length) {
    wrap.appendChild(el("<div class='card'><p>No writes yet. Run <code>sean apply --repo ./site</code> after an audit. Sean fixes a title tag by opening a PR you can revert.</p></div>"));
    render(wrap);
    return;
  }
  for (const a of actions.actions) {
    wrap.appendChild(el("<div class='card'><p><strong>" + esc(a.kind) + "</strong> · T" + esc(a.tier) + " · " + esc(a.state) + "</p><p class='muted'>" + esc(a.targetRef) + "</p></div>"));
  }
  for (const c of data.changes) {
    const card = el("<div class='card' data-id='" + esc(c.id) + "'><p><strong>" + esc(c.summary) + "</strong></p><p class='muted'>" + esc(c.appliedAt) + (c.revertedAt ? " · reverted " + esc(c.revertedAt) : "") + (c.prUrl ? " · <a href='" + esc(c.prUrl) + "'>pull request</a>" : "") + "</p><pre>" + diffHtml(c.before, c.after) + "</pre></div>");
    if (c.revertible && !c.revertedAt) {
      const b = document.createElement("button");
      b.textContent = "Revert";
      b.onclick = () => revert(c.id);
      card.querySelector(".card")?.appendChild(b) || card.firstElementChild.appendChild(b);
    }
    wrap.appendChild(card);
  }
  render(wrap);
}
session().then((ok) => {
  if (!ok) {
    render(el("<div class='card'><p>Open this page from <code>sean apply</code> or <code>sean start</code> so the local session cookie can be set.</p></div>"));
    return;
  }
  return show();
}).catch((e) => render(el("<div class='card'><p class='err'>" + esc(e.message) + "</p></div>")));
</script>
</body>
</html>`;
}
