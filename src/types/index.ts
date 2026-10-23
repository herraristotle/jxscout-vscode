import * as vscode from "vscode";

export interface Position {
  column: number;
  line: number;
}

export interface AnalyzerMatch {
  filePath: string;
  analyzerName: string;
  value: string;
  start: Position;
  end: Position;
  tags?: Record<string, boolean>;
  extra?: Record<string, any>;
}

type ASTAnalyzerTreeNodeType = "navigation" | "match" | "file";

export interface ASTAnalyzerTreeNode {
  id?: string;
  type: ASTAnalyzerTreeNodeType;
  data?: any;
  label?: string;
  description?: string;
  iconName?: string;
  tooltip?: string;
  children?: ASTAnalyzerTreeNode[];
}

export interface AnalysisResult {
  filePath: string;
  results: ASTAnalyzerTreeNode[];
}

export interface ProjectAnalysisResult {
  files: AnalysisResult[];
}

// Pro v2: structured findings
export interface Finding {
  id: number;
  kind: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  dedup_key?: string;
  metadata?: any;
  created_at?: string;
}

// Pro v2: bookmarks
export interface Bookmark {
  id: number;
  asset_id?: number;
  asset_url?: string;
  label: string;
  description?: string;
  code_snippet?: string;
  start_line?: number;
  end_line?: number;
  tags?: string[];
  created_at?: string;
}

// Relationship graph node from /api/asset-graph
export interface AssetGraphNode {
  url: string;
  content_type: string;
  path?: string;
  relation:
    | "loader"
    | "loaded"
    | "chunk"
    | "sourcemap_owner"
    | "sourcemap_source"
    | "optimized"
    | "unpacked";
}

export interface AssetGraph {
  url: string;
  nodes: AssetGraphNode[];
}

// Pro v2: seen/uninteresting match tracking state
export interface MatchState {
  seen: boolean;
  interesting: boolean;
}

export type ViewScope = "project" | "file";
export type SortMode = "alphabetical" | "occurrence";
export type TreeState = "loading" | "asset-not-found" | "success" | "empty";

export interface TreeItemOptions {
  label: string;
  collapsibleState: vscode.TreeItemCollapsibleState;
  iconName?: string;
  node: ASTAnalyzerTreeNode;
  description?: string;
  tooltip?: string;
}
