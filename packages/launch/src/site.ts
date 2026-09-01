import { RECIPES, type Recipe } from "./recipes.js";
import { VERSION } from "./version.js";

export const POSITIONING =
  "Every SEO tool tells you what's wrong. Agent Sean fixes it.";

export const OPENSEO_CREDIT =
  "OpenSEO proved an open-source SEO platform could work. Agent Sean is the execution layer that writes reversible diffs to your actual site — not a fork of OpenSEO, and not a report that stops at the finding.";

export function recipePage(recipe: Recipe): string {
  const steps = recipe.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(recipe.title)} — Agent Sean</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="description" content="${escapeHtml(recipe.summary)}"/>
  <link rel="stylesheet" href="../assets/style.css"/>
</head>
<body>
  <header>
    <a href="../index.html">Agent Sean</a>
    <nav>
      <a href="../install.html">Install</a>
      <a href="index.html">Recipes</a>
      <a href="../security.html">Security</a>
    </nav>
  </header>
  <main>
    <p class="kicker">${recipe.cms.join(" · ")}</p>
    <h1>${escapeHtml(recipe.title)}</h1>
    <p class="lead">${escapeHtml(recipe.summary)}</p>
    <ol>${steps}</ol>
    <p><a href="index.html">All recipes</a></p>
  </main>
</body>
</html>
`;
}

export function recipesIndex(): string {
  const items = RECIPES.map(
    (r) =>
      `<li id="${escapeHtml(r.id)}"><a href="${escapeHtml(r.id)}.html">${escapeHtml(r.title)}</a> — ${escapeHtml(r.summary)}</li>`,
  ).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>SEO recipes — Agent Sean</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <link rel="stylesheet" href="../assets/style.css"/>
</head>
<body>
  <header>
    <a href="../index.html">Agent Sean</a>
    <nav>
      <a href="../install.html">Install</a>
      <a href="index.html">Recipes</a>
      <a href="../security.html">Security</a>
    </nav>
  </header>
  <main>
    <h1>Recipes</h1>
    <p class="lead">First-party, reviewed by us. Not an open marketplace — plugins with write access to live sites do not get a public upload form.</p>
    <ul class="recipes">${items}</ul>
  </main>
</body>
</html>
`;
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export { VERSION };
