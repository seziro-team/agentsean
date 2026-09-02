export function connectPageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Connect Google — Agent Sean</title>
  <style>
    :root { color-scheme: light dark; --fg: #111; --muted: #555; --acc: #0b57d0; --bg: #f6f7f9; --card: #fff; --bd: #d0d7de; }
    @media (prefers-color-scheme: dark) {
      :root { --fg: #eef; --muted: #9aa; --acc: #8ab4f8; --bg: #0f1115; --card: #171a21; --bd: #2c313a; }
    }
    body { font: 16px/1.45 system-ui, sans-serif; margin: 0; background: var(--bg); color: var(--fg); }
    main { max-width: 720px; margin: 2rem auto; padding: 0 1.25rem 3rem; }
    h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
    p.lead { color: var(--muted); margin-top: 0; }
    .card { background: var(--card); border: 1px solid var(--bd); border-radius: 12px; padding: 1.25rem; margin: 1rem 0; }
    button, .btn { background: var(--acc); color: #fff; border: 0; border-radius: 8px; padding: .6rem 1rem; font: inherit; cursor: pointer; }
    button.secondary { background: transparent; color: var(--acc); border: 1px solid var(--acc); }
    label { display: block; margin: .75rem 0 .25rem; font-weight: 600; }
    input, select { width: 100%; box-sizing: border-box; padding: .5rem .6rem; border-radius: 8px; border: 1px solid var(--bd); font: inherit; background: var(--card); color: var(--fg); }
    .muted { color: var(--muted); font-size: .9rem; }
    .err { color: #c00; }
    pre { overflow: auto; background: var(--bg); padding: .75rem; border-radius: 8px; font-size: .8rem; }
    .row { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
  </style>
</head>
<body>
<main>
  <h1>Connect Google</h1>
  <p class="lead">Search Console, Analytics, CrUX. Under two minutes. The hosted broker never talks to this machine — this page does.</p>
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

async function main() {
  const authed = await session();
  if (!authed) {
    render(el("<div class='card'><p>Open this page from <code>sean connect google</code> so the local session cookie can be set. The CLI prints a loopback URL — do not paste tokens into a hosted page.</p></div>"));
    return;
  }
  const q = new URLSearchParams(location.search);
  if (q.get("error")) {
    render(el("<div class='card'><p class='err'>" + q.get("error") + "</p><button id='retry'>Try again</button></div>"));
    document.getElementById("retry").onclick = () => { location.search = ""; };
    return;
  }
  const status = await api("/api/google/status");
  if (q.get("connected") === "1" && !status.gscSiteUrl) {
    await pick(status);
    return;
  }
  if (status.connected && status.gscSiteUrl) {
    await showConnected(status);
    return;
  }
  await showStart(status);
}

async function showStart(status) {
  const n = el("<div class='card'>"
    + "<p>Sean will request Search Console (including sitemap submit), Analytics read-only, and Site Verification. Business Profile waits until you need local SEO.</p>"
    + "<label>Site origin</label><input id='origin' placeholder='https://example.com' value='" + (status.origin || "") + "'/>"
    + "<p class='muted'>Default path uses the first-party broker on agentsean.dev (no client secret in this repo). Advanced users can paste a Desktop-app client instead — Publish the Cloud project to Production or refresh tokens die in 7 days.</p>"
    + "<div class='row'><button id='go'>Connect Google</button><button class='secondary' id='byo'>I have my own Cloud project</button></div>"
    + "<div id='byobox' hidden><label>client_secret.json</label><textarea id='creds' rows='6' style='width:100%'></textarea><button id='gobyo'>Connect with my client</button></div>"
    + "</div>");
  render(n);
  n.querySelector("#go").onclick = async () => {
    const origin = n.querySelector("#origin").value.trim();
    const body = await api("/api/google/connect/start", { method: "POST", body: JSON.stringify({ origin, mode: "broker" }) });
    location.href = body.authorizationUrl;
  };
  n.querySelector("#byo").onclick = () => { n.querySelector("#byobox").hidden = false; };
  n.querySelector("#gobyo").onclick = async () => {
    const origin = n.querySelector("#origin").value.trim();
    const body = await api("/api/google/connect/start", { method: "POST", body: JSON.stringify({ origin, mode: "byo", credentialsJson: n.querySelector("#creds").value }) });
    location.href = body.authorizationUrl;
  };
}

async function pick(status) {
  const disc = await api("/api/google/discover", { method: "POST", body: "{}" });
  const gscOpts = (disc.gscSites || []).map(s => "<option value='" + s.siteUrl + "'" + (s.siteUrl === disc.suggestedGsc ? " selected" : "") + ">" + s.siteUrl + " (" + s.permissionLevel + ")</option>").join("");
  const ga4Opts = (disc.ga4Properties || []).map(p => "<option value='" + p.propertyId + "'>" + p.displayName + " — " + p.propertyId + "</option>").join("");
  const warn = disc.testingModeSuspected ? "<p class='err'>This Google Cloud project looks like Testing mode. Refresh tokens expire after 7 days and silently kill a 24/7 agent. Publish the app to Production (the unverified warning is expected for a personal client).</p>" : "";
  const n = el("<div class='card'>" + warn
    + "<p>Signed in as " + (disc.email || "unknown") + "</p>"
    + "<label>Search Console property</label><select id='gsc'><option value=''>Skip</option>" + gscOpts + "</select>"
    + "<p class='muted'>If the property is missing, Sean can verify it via the Site Verification API — you never open a Google console.</p>"
    + "<label>Verify missing property with</label><select id='method'><option value=''>Don't verify now</option><option value='META'>HTML meta tag</option><option value='FILE'>HTML file</option><option value='DNS_TXT'>DNS TXT</option><option value='ANALYTICS'>Google Analytics</option><option value='TAG_MANAGER'>Tag Manager</option></select>"
    + "<label>GA4 property</label><select id='ga4'><option value=''>Skip</option>" + ga4Opts + "</select>"
    + "<label>PageSpeed / CrUX API key (optional, not OAuth)</label><input id='apikey' placeholder='AIza…'/>"
    + "<p><button id='save'>Save and sync</button></p></div>");
  render(n);
  n.querySelector("#save").onclick = async () => {
    const gsc = n.querySelector("#gsc").value;
    const ga4 = n.querySelector("#ga4").value;
    const method = n.querySelector("#method").value;
    const apikey = n.querySelector("#apikey").value.trim();
    await api("/api/google/properties", { method: "POST", body: JSON.stringify({ gscSiteUrl: gsc || null, ga4PropertyId: ga4 || null, origin: status.origin }) });
    if (method) {
      const v = await api("/api/google/verify", { method: "POST", body: JSON.stringify({ method, origin: status.origin }) });
      if (v.token && !v.verified) {
        render(el("<div class='card'><p>Add this verification token to the site, then click continue.</p><pre>" + JSON.stringify(v, null, 2) + "</pre><button id='cont'>Continue sync</button></div>"));
        document.getElementById("cont").onclick = () => doSync(apikey);
        return;
      }
    }
    await doSync(apikey);
  };
}

async function doSync(apikey) {
  if (apikey) await api("/api/google/api-key", { method: "POST", body: JSON.stringify({ apiKey: apikey }) });
  render(el("<div class='card'><p>Syncing GSC, GA4, CrUX, and Google update timestamps…</p></div>"));
  const result = await api("/api/google/sync", { method: "POST", body: "{}" });
  await showConnected(await api("/api/google/status"), result);
}

async function showConnected(status, sync) {
  const rec = await api("/api/google/reconciliation");
  const inc = await api("/api/google/incidents");
  const residual = (rec.rows || []).slice(-7);
  const n = el("<div>"
    + "<div class='card'><p><strong>Connected.</strong> GSC " + (status.gscSiteUrl || "—") + " · GA4 " + (status.ga4PropertyId || "—") + "</p>"
    + (status.testingModeSuspected ? "<p class='err'>Testing-mode refresh token suspected. Publish the Cloud project to Production.</p>" : "")
    + "<p class='muted'>Default metric is <strong>clicks</strong>. Impressions from 2025-05-13 to 2026-04-27 are contaminated. The &num=100 removal (2025-09-10–14) is annotated so YoY impression charts cannot page you with false decay.</p>"
    + "<div class='row'><button id='resync'>Sync now</button></div></div>"
    + "<div class='card'><h2>GSC vs GA4 residual (last 7 stored days)</h2><pre>" + JSON.stringify(residual, null, 2) + "</pre></div>"
    + "<div class='card'><h2>Google updates on file</h2><pre>" + JSON.stringify((inc.changepoints || []).slice(0, 12), null, 2) + "</pre></div>"
    + (sync ? "<div class='card'><h2>Last sync</h2><pre>" + JSON.stringify(sync, null, 2) + "</pre></div>" : "")
    + "</div>");
  render(n);
  n.querySelector("#resync").onclick = () => doSync("");
}

main().catch((e) => {
  render(el("<div class='card'><p class='err'>" + e.message + "</p></div>"));
});
</script>
</body>
</html>`;
}
