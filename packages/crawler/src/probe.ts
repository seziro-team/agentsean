import tls from "node:tls";
import type { Agent } from "undici";
import { fetchUrl } from "./http.js";
import { contentHash } from "./hash.js";
import { originOf } from "./url.js";
import { randomBytes } from "node:crypto";
import type { OriginProbe } from "./types.js";

export async function probeOrigin(
  startUrl: string,
  agent: Agent,
): Promise<OriginProbe> {
  const origin = originOf(startUrl);
  const u = new URL(origin);
  const https = u.protocol === "https:";
  let httpRedirectsToHttps: boolean | null = null;
  let wwwSplit: boolean | null = null;
  let wwwPreferred: string | null = null;
  let trailingSlashSplit: boolean | null = null;
  let randomSoft404 = false;
  let randomSoft404Url: string | null = null;
  let randomSoft404Hash: string | null = null;
  let hsts: string | null = null;

  if (https) {
    try {
      const httpUrl = `http://${u.host}${u.pathname}`;
      const res = await fetchUrl(httpUrl, { agent, timeoutMs: 8_000, maxRedirects: 5 });
      httpRedirectsToHttps = res.finalUrl.startsWith("https:");
    } catch {
      httpRedirectsToHttps = false;
    }
  }

  try {
    const host = u.hostname;
    const alt = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    const altUrl = `${u.protocol}//${alt}/`;
    const a = await fetchUrl(`${origin}/`, { agent, timeoutMs: 8_000, maxRedirects: 0 });
    const b = await fetchUrl(altUrl, { agent, timeoutMs: 8_000, maxRedirects: 0 });
    const a200 = a.statusCode === 200;
    const b200 = b.statusCode === 200;
    wwwSplit = a200 && b200;
    if (!wwwSplit) {
      wwwPreferred = a200 ? origin : b200 ? `${u.protocol}//${alt}` : origin;
    }
    hsts = a.headers["strict-transport-security"] ?? null;
  } catch {
    wwwSplit = null;
  }

  try {
    const withSlash = `${origin}/probe-slash-test/`;
    const noSlash = `${origin}/probe-slash-test`;
    const a = await fetchUrl(withSlash, { agent, timeoutMs: 8_000, maxRedirects: 0 });
    const b = await fetchUrl(noSlash, { agent, timeoutMs: 8_000, maxRedirects: 0 });
    trailingSlashSplit = a.statusCode === 200 && b.statusCode === 200;
  } catch {
    trailingSlashSplit = null;
  }

  try {
    const slug = randomBytes(16).toString("hex");
    randomSoft404Url = `${origin}/${slug}`;
    const res = await fetchUrl(randomSoft404Url, { agent, timeoutMs: 8_000, maxRedirects: 0 });
    randomSoft404 = res.statusCode === 200;
    if (randomSoft404 && res.decoded.length) {
      randomSoft404Hash = contentHash(res.decoded);
    }
  } catch {
    randomSoft404 = false;
  }

  const cert = https ? await readCert(u.hostname, Number(u.port || 443)) : {
    certValidTo: null,
    certDaysRemaining: null,
    certError: null,
    alpn: null,
  };

  return {
    https,
    httpRedirectsToHttps,
    wwwSplit,
    wwwPreferred,
    trailingSlashSplit,
    randomSoft404,
    randomSoft404Url,
    randomSoft404Hash,
    hsts,
    ...cert,
  };
}

function readCert(
  host: string,
  port: number,
): Promise<{
  certValidTo: string | null;
  certDaysRemaining: number | null;
  certError: string | null;
  alpn: string | null;
}> {
  return new Promise((resolve) => {
    const sock = tls.connect(
      { host, port, servername: host, rejectUnauthorized: true },
      () => {
        const cert = sock.getPeerCertificate();
        const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
        const days = validTo
          ? Math.floor((validTo.getTime() - Date.now()) / 86_400_000)
          : null;
        const alpn = sock.alpnProtocol || sock.getProtocol() || null;
        sock.end();
        resolve({
          certValidTo: validTo?.toISOString() ?? null,
          certDaysRemaining: days,
          certError: null,
          alpn: typeof alpn === "string" ? alpn : null,
        });
      },
    );
    sock.setTimeout(5000, () => {
      sock.destroy();
      resolve({
        certValidTo: null,
        certDaysRemaining: null,
        certError: "timeout",
        alpn: null,
      });
    });
    sock.on("error", (e) => {
      resolve({
        certValidTo: null,
        certDaysRemaining: null,
        certError: e.message,
        alpn: null,
      });
    });
  });
}
