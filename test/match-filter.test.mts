import { test } from "node:test";
import assert from "node:assert/strict";
import { filterMatches } from "../src/core/match-filter.ts";
import type { ASTAnalyzerTreeNode, MatchState } from "../src/types/index.ts";

const match = (name: string): ASTAnalyzerTreeNode => ({
  type: "match",
  label: name,
  data: { analyzerName: name },
});

const group = (
  name: string,
  children: ASTAnalyzerTreeNode[]
): ASTAnalyzerTreeNode => ({
  type: "navigation",
  label: name,
  children,
});

const states: Record<string, MatchState> = {
  seen: { seen: true, interesting: false },
  interesting: { seen: false, interesting: true },
  both: { seen: true, interesting: true },
};

const lookup = (_filePath: string, data: any): MatchState =>
  states[data.analyzerName] ?? { seen: false, interesting: false };

const tree: ASTAnalyzerTreeNode[] = [
  group("g1", [match("seen"), match("interesting"), match("both")]),
  group("g2", [match("seen")]),
  group("empty", [match("seen")]),
  { type: "navigation", label: "no children" },
];

const labels = (nodes: ASTAnalyzerTreeNode[]): string[] =>
  nodes.flatMap((n) =>
    n.children ? [n.label!, ...labels(n.children).map((l) => `  ${l}`)] : [n.label!]
  );

test("all filter returns the tree untouched", () => {
  assert.deepEqual(filterMatches(tree, "f", "all", lookup), tree);
});

test("no lookup returns the tree untouched", () => {
  assert.deepEqual(filterMatches(tree, "f", "unseen", undefined), tree);
});

test("unseen drops seen matches", () => {
  const out = labels(filterMatches(tree, "f", "unseen", lookup));
  assert.ok(!out.includes("  seen"));
  assert.ok(out.includes("  interesting"));
  assert.ok(!out.includes("  both"), "seen wins even when interesting");
});

test("unseen drops groups whose children are all filtered out", () => {
  const out = labels(filterMatches(tree, "f", "unseen", lookup));
  assert.ok(!out.includes("g2"));
  assert.ok(!out.includes("empty"));
});

test("unseen keeps childless navigation nodes", () => {
  const out = labels(filterMatches(tree, "f", "unseen", lookup));
  assert.ok(out.includes("no children"));
});

test("interesting keeps only interesting matches", () => {
  const out = labels(filterMatches(tree, "f", "interesting", lookup));
  assert.ok(!out.includes("  seen"));
  assert.ok(out.includes("  interesting"));
  assert.ok(out.includes("  both"), "interesting filter ignores seen");
  assert.ok(!out.includes("g2"));
});
