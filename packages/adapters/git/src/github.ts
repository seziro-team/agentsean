export type OpenPrInput = {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  token: string;
  apiBase?: string | undefined;
  fetch?: typeof fetch | undefined;
};

export async function openGithubPr(input: OpenPrInput): Promise<string> {
  const api = input.apiBase ?? "https://api.github.com";
  const fetchFn = input.fetch ?? fetch;
  const res = await fetchFn(`${api}/repos/${input.owner}/${input.repo}/pulls`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${input.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`github pr failed ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = JSON.parse(text) as { html_url?: string };
  if (!json.html_url) throw new Error("github pr response missing html_url");
  return json.html_url;
}
