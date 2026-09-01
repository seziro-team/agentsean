import { promisify } from "node:util";
import zlib from "node:zlib";

const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const inflateRaw = promisify(zlib.inflateRaw);
const brotli = promisify(zlib.brotliDecompress);
const zstd =
  "zstdDecompress" in zlib && typeof zlib.zstdDecompress === "function"
    ? promisify(zlib.zstdDecompress)
    : null;

/**
 * Decode Content-Encoding. undici.request() does not decompress; we must.
 * Apply chained encodings right-to-left.
 */
export async function decodeBody(
  buf: Buffer,
  contentEncoding: string | undefined,
): Promise<Buffer> {
  if (!contentEncoding) return buf;
  const encodings = contentEncoding
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && s !== "identity");
  let out: Buffer = buf;
  for (let i = encodings.length - 1; i >= 0; i--) {
    const enc = encodings[i];
    if (enc === "gzip" || enc === "x-gzip") {
      out = Buffer.from(await gunzip(out));
    } else if (enc === "deflate") {
      try {
        out = Buffer.from(await inflate(out));
      } catch {
        out = Buffer.from(await inflateRaw(out));
      }
    } else if (enc === "br") {
      out = Buffer.from(await brotli(out));
    } else if (enc === "zstd" || enc === "zst") {
      if (!zstd) {
        throw new Error("zstd Content-Encoding requires Node >= 22.15");
      }
      out = Buffer.from(await zstd(out));
    }
  }
  return out;
}

export function acceptEncodingHeader(): string {
  const parts = ["gzip", "deflate", "br"];
  if (zstd) parts.push("zstd");
  return parts.join(", ");
}
