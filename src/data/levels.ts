/* =========================================================
   Data: curated vocabulary loosely following the Singapore
   Chinese curriculum progression (P1 to JC), plus stroke data
   from hanzi-writer-data (Make Me a Hanzi, Arphic licence).
   ========================================================= */
import type { Level } from "../types";

export const LEVELS: Level[] = [
  { id: "p1", name: "P1", sub: "小一" }, { id: "p2", name: "P2", sub: "小二" }, { id: "p3", name: "P3", sub: "小三" },
  { id: "p4", name: "P4", sub: "小四" }, { id: "p5", name: "P5", sub: "小五" }, { id: "p6", name: "P6", sub: "小六" },
  { id: "sec1", name: "Sec 1", sub: "中一" }, { id: "sec2", name: "Sec 2", sub: "中二" },
  { id: "sec3", name: "Sec 3", sub: "中三" }, { id: "sec4", name: "Sec 4", sub: "中四" },
  { id: "biz", name: "Business", sub: "商务华文" },
];

// Old level ids from the first version, mapped to the new ones.
export const LEVEL_MIGRATION: Record<string, string[]> = {
  p12: ["p1", "p2"], p34: ["p3", "p4"], p56: ["p5", "p6"], sec: ["sec1", "sec2", "sec3", "sec4"], jc: ["biz"],
  sec12: ["sec1", "sec2"], sec34: ["sec3", "sec4"],
};

export const LIB_INTRO: Record<string, string> = {
  p: "Characters first taught in this year, following the 欢乐伙伴 primary character lists.",
  sec1: "The most common quarter of China's 3,500 everyday characters not taught in primary school.",
  sec2: "The second most common quarter of China's 3,500 everyday characters not taught in primary school.",
  sec3: "The third most common quarter of China's 3,500 everyday characters not taught in primary school.",
  sec4: "The least common quarter of China's 3,500 everyday characters not taught in primary school.",
  biz: "Everyday office and business words: meetings, money, contracts, email, plus a few Singapore ones like CPF and GST.",
};

export const SOURCE_NOTE = "Word choices and English meanings are picked automatically from CC-CEDICT (CC BY-SA 4.0) and HSK word lists, so a few may read oddly. Stroke data from Make Me a Hanzi via Hanzi Writer.";
