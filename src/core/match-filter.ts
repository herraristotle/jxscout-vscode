import type { ASTAnalyzerTreeNode, MatchState } from "../types";

export type MatchFilter = "all" | "unseen" | "interesting";

export type MatchStateLookup = (
  filePath: string,
  data: any
) => MatchState;

// Filter match nodes by seen/interesting state, keeping ancestor navigation
// nodes that still have visible children. Pure so it can be tested without
// the VS Code host.
export function filterMatches(
  nodes: ASTAnalyzerTreeNode[],
  filePath: string,
  filter: MatchFilter,
  lookup: MatchStateLookup | undefined
): ASTAnalyzerTreeNode[] {
  if (filter === "all" || !lookup) {
    return nodes;
  }

  const out: ASTAnalyzerTreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "match" && node.data) {
      const state = lookup(filePath, node.data);
      if (filter === "unseen" && state.seen) {
        continue;
      }
      if (filter === "interesting" && !state.interesting) {
        continue;
      }
      out.push(node);
      continue;
    }

    if (!node.children) {
      out.push(node);
      continue;
    }

    const children = filterMatches(node.children, filePath, filter, lookup);
    if (children.length > 0) {
      out.push({ ...node, children });
    }
  }
  return out;
}
