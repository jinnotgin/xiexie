import { charData } from "../../../lib/chardata";
import { type CharMedians, makeChecker } from "./relaxed";

let checker: ReturnType<typeof makeChecker> | null = null;
let builtFor: unknown = null;

/** The relaxed-mode checker over every loaded character, built on first use (after loadCharData). */
export function relaxedChecker() {
  const data = charData();
  if (!checker || builtFor !== data) {
    checker = makeChecker(data as Record<string, CharMedians>);
    builtFor = data;
  }
  return checker;
}
