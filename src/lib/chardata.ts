// Stroke data for ~3,500 characters (Make Me a Hanzi via hanzi-writer-data), shipped as one gzipped JSON file.
import chardataUrl from "../data/chardata.json.gz?url";

let CHARDATA: Record<string, unknown> = {};

export async function loadCharData(url: string = chardataUrl): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not fetch stroke data: " + res.status);
  const bin = new Uint8Array(await res.arrayBuffer());
  // Some static hosts serve .gz with Content-Encoding: gzip, in which case fetch has already inflated it.
  const gzipped = bin[0] === 0x1f && bin[1] === 0x8b;
  const text = gzipped
    ? await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
    : new TextDecoder().decode(bin);
  CHARDATA = JSON.parse(text);
}

/** HanziWriter charDataLoader backed by the in-memory table. */
export const loader = (c: string, onLoad: (d: unknown) => void, onErr: (e: Error) => void) => {
  const d = CHARDATA[c];
  d ? onLoad(d) : onErr(new Error("No stroke data for " + c));
};
