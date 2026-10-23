import * as vscode from "vscode";
import { ASTAnalyzerTreeNode, MatchState } from "../types";

// Pro v2: unseen/uninteresting match tracking.
// State is persisted per workspace so it survives restarts.
export class MatchStateService {
  private static instance: MatchStateService | undefined;
  private states: Map<string, MatchState> = new Map();

  private constructor(private ctx: vscode.ExtensionContext) {
    const stored = ctx.workspaceState.get<Record<string, MatchState>>(
      "jxscout.matchStates",
      {}
    );
    this.states = new Map(Object.entries(stored));
  }

  static getInstance(ctx?: vscode.ExtensionContext): MatchStateService {
    if (!MatchStateService.instance) {
      if (!ctx) {
        throw new Error("MatchStateService not initialized");
      }
      MatchStateService.instance = new MatchStateService(ctx);
    }
    return MatchStateService.instance;
  }

  // Stable key: file + analyzer + value + start position
  keyFor(filePath: string, data: any): string {
    return [
      filePath,
      data?.analyzerName || "",
      data?.value || "",
      data?.start?.line ?? "",
      data?.start?.column ?? "",
    ].join(" ");
  }

  get(key: string): MatchState {
    return this.states.get(key) || { seen: false, interesting: false };
  }

  markSeen(key: string): void {
    const cur = this.get(key);
    if (cur.seen) {
      return;
    }
    this.states.set(key, { ...cur, seen: true });
    this.persist();
  }

  setInteresting(key: string, interesting: boolean): void {
    const cur = this.get(key);
    this.states.set(key, { ...cur, interesting });
    this.persist();
  }

  resetAll(): void {
    this.states.clear();
    this.persist();
  }

  private persist(): void {
    const obj = Object.fromEntries(this.states);
    this.ctx.workspaceState.update("jxscout.matchStates", obj);
  }

  // Collect all match nodes in a tree with their file path for state lookup
  walkMatches(
    nodes: ASTAnalyzerTreeNode[],
    filePath: string,
    visit: (key: string, node: ASTAnalyzerTreeNode) => void
  ): void {
    for (const node of nodes || []) {
      if (node.type === "match" && node.data) {
        visit(this.keyFor(filePath, node.data), node);
      }
      if (node.children?.length) {
        this.walkMatches(node.children, filePath, visit);
      }
    }
  }
}
