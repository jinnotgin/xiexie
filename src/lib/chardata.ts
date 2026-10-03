// Stroke data for ~3,500 characters (Make Me a Hanzi via hanzi-writer-data), shipped as one gzipped JSON file.
import chardataUrl from "../data/chardata.json.gz?url";

let CHARDATA: Record<string, unknown> = {};

/** onProgress gets the downloaded fraction, or null once the size can't be known (then: just unpacking). */
export async function loadCharData(url: string = chardataUrl, onProgress?: (f: number | null) => void): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not fetch stroke data: " + res.status);
  const bin = await readAll(res, onProgress);
  // Some static hosts serve .gz with Content-Encoding: gzip, in which case fetch has already inflated it.
  const gzipped = bin[0] === 0x1f && bin[1] === 0x8b;
  const text = gzipped
    ? await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
    : new TextDecoder().decode(bin);
  CHARDATA = JSON.parse(text);
}

async function readAll(res: Response, onProgress?: (f: number | null) => void): Promise<Uint8Array<ArrayBuffer>> {
  // Content-Length counts compressed bytes when the host gzips in transit, so it only measures a plain download.
  const total = res.headers.get("Content-Encoding") ? 0 : Number(res.headers.get("Content-Length")) || 0;
  if (!onProgress || !total || !res.body) {
    onProgress?.(null);
    return new Uint8Array(await res.arrayBuffer());
  }
  const out = new Uint8Array(total);
  const reader = res.body.getReader();
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value.subarray(0, total - got), got);
    got = Math.min(total, got + value.length);
    onProgress(got / total);
  }
  return out.subarray(0, got);
}

/** HanziWriter charDataLoader backed by the in-memory table. */
export const loader = (c: string, onLoad: (d: unknown) => void, onErr: (e: Error) => void) => {
  const d = CHARDATA[c];
  if (d) onLoad(d); else onErr(new Error("No stroke data for " + c));
};

/** Everything loadCharData loaded, keyed by character. A new object after every load. */
export const charData = () => CHARDATA;
