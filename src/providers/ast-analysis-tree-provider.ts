import * as vscode from "vscode";
import {
  ASTAnalyzerTreeNode,
  TreeItemOptions,
  TreeState,
  ViewScope,
  SortMode,
} from "../types";
import { MatchStateService } from "../services/match-state";
import { filterMatches, MatchFilter } from "../core/match-filter";
import * as path from "path";


export class AstAnalysisTreeItem extends vscode.TreeItem {
  public readonly node: ASTAnalyzerTreeNode;

  constructor({
    label,
    collapsibleState,
    iconName,
    node,
    description,
    tooltip,
  }: TreeItemOptions) {
    super(label, collapsibleState);
    this.description = description || "";
    this.tooltip = tooltip;
    this.node = node;

    if (node.type === "match") {
      this.command = {
        command: "jxscout.navigateToMatch",
        title: "Navigate to match",
        arguments: [node.data],
      };
      this.contextValue = "match";
    }

    if (node.type === "file") {
      this.contextValue = "fileNode";
    }

    if (iconName) {
      if (iconName.startsWith("resources:")) {
        const iconPath = iconName.replace("resources:", "");

        const iconUri = path.join(
          __filename,
          "..",
          "..",
          "resources",
          "icons",
          `${iconPath}.svg`
        );
        this.iconPath = {
          light: vscode.Uri.file(iconUri),
          dark: vscode.Uri.file(iconUri),
        };
      } else {
        this.iconPath = new vscode.ThemeIcon(iconName);
      }
    }
  }
}

// Pro v2: project scope node data holds filePath + analysis results
interface ProjectFileNode extends ASTAnalyzerTreeNode {
  type: "file";
  data: { filePath: string; results: ASTAnalyzerTreeNode[] };
}

export class AstAnalysisTreeProvider
  implements vscode.TreeDataProvider<AstAnalysisTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    AstAnalysisTreeItem | undefined | null | void
  > = new vscode.EventEmitter<AstAnalysisTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    AstAnalysisTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private _scope: ViewScope = "file";
  private _analysisData?: ASTAnalyzerTreeNode[];
  private _state: TreeState = "empty";
  private _sortMode: SortMode = "occurrence";

  // Pro v2: filter and project data
  private _filter: MatchFilter = "all";
  private _projectFiles?: ProjectFileNode[];
  private _matchStates?: MatchStateService;

  getScope(): ViewScope {
    return this._scope;
  }

  getSortMode(): SortMode {
    return this._sortMode;
  }

  setSortMode(mode: SortMode) {
    this._sortMode = mode;
    this.refresh();
  }

  getFilter(): MatchFilter {
    return this._filter;
  }

  setFilter(filter: MatchFilter) {
    this._filter = filter;
    this.refresh();
  }

  setMatchStates(service: MatchStateService) {
    this._matchStates = service;
  }

  setScope(scope: ViewScope) {
    this._scope = scope;
    this.refresh();
  }

  setState(state: TreeState) {
    this._state = state;
    if (state !== "success") {
      this._analysisData = undefined;
    }
    this.refresh();
  }

  setAnalysisData(data: ASTAnalyzerTreeNode[] | undefined) {
    this._analysisData = data;
    this.refresh();
  }

  setProjectData(files: ProjectFileNode[] | undefined) {
    this._projectFiles = files;
    this._state = files ? "success" : "empty";
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AstAnalysisTreeItem): vscode.TreeItem {
    return element;
  }

  // Pro v2: filter match nodes by filter mode using match state service
  private filterMatches(
    nodes: ASTAnalyzerTreeNode[],
    filePath: string
  ): ASTAnalyzerTreeNode[] {
    const states = this._matchStates;
    return filterMatches(
      nodes,
      filePath,
      this._filter,
      states
        ? (_fp, data) => states.get(states.keyFor(_fp, data))
        : undefined
    );
  }

  getChildren(element?: AstAnalysisTreeItem): Thenable<AstAnalysisTreeItem[]> {
    // Pro v2 project scope: show file list, expandable to per-file results
    if (this._scope === "project") {
      if (this._state === "loading") {
        return Promise.resolve([
          new AstAnalysisTreeItem({
            label: "Loading project analysis...",
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            iconName: "loading~spin",
            node: { type: "navigation", label: "Loading project analysis..." },
          }),
        ]);
      }
      if (!this._projectFiles?.length) {
        return Promise.resolve([
          new AstAnalysisTreeItem({
            label: "No analyzed files in project",
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            iconName: "info",
            node: { type: "navigation", label: "No analyzed files" },
          }),
        ]);
      }
      if (!element) {
        const sortedFiles = [...this._projectFiles].sort((a, b) =>
          (a.label || "").localeCompare(b.label || "")
        );
        return Promise.resolve(
          sortedFiles.map(
            (file) =>
              new AstAnalysisTreeItem({
                label: file.label || file.data.filePath,
                collapsibleState: file.children?.length
                  ? vscode.TreeItemCollapsibleState.Collapsed
                  : vscode.TreeItemCollapsibleState.None,
                iconName: "file-code",
                node: file,
                description: file.description,
              })
          )
        );
      }
      if (element.node.type === "file" && element.node.data?.results) {
        const filePath = element.node.data.filePath;
        const filtered = this.filterMatches(
          element.node.data.results,
          filePath
        );
        return Promise.resolve(
          filtered.map(
            (child) =>
              new AstAnalysisTreeItem({
                label: child.label || "Node",
                collapsibleState: child.children?.length
                  ? vscode.TreeItemCollapsibleState.Expanded
                  : vscode.TreeItemCollapsibleState.None,
                iconName: child.iconName,
                node: child,
                description: child.description,
              })
          )
        );
      }
      return Promise.resolve([]);
    }

    if (this._state === "empty") {
      return Promise.resolve([
        new AstAnalysisTreeItem({
          label: "Select a file tracked by jxscout.",
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          iconName: "info",
          node: {
            type: "navigation",
            label: "Select a file tracked by jxscout.",
          },
        }),
      ]);
    }

    if (this._state === "loading") {
      return Promise.resolve([
        new AstAnalysisTreeItem({
          label: "Loading analysis...",
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          iconName: "loading~spin",
          node: { type: "navigation", label: "Loading analysis..." },
        }),
      ]);
    }

    if (this._state === "asset-not-found") {
      return Promise.resolve([
        new AstAnalysisTreeItem({
          label:
            "This file is not tracked by the current project or is not supported by jxscout",
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          iconName: "info",
          node: {
            type: "navigation",
            label:
              "This file is not tracked by the current project or is not supported by jxscout",
          },
        }),
      ]);
    }

    if (!this._analysisData?.length) {
      return Promise.resolve([
        new AstAnalysisTreeItem({
          label: "No descriptors found",
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          iconName: "info",
          node: { type: "navigation", label: "No descriptors found" },
        }),
      ]);
    }

    if (!element) {
      const activePath =
        vscode.window.activeTextEditor?.document.uri.fsPath || "";
      const filtered = this.filterMatches(this._analysisData, activePath);
      const sortedNodes =
        this._sortMode === "alphabetical"
          ? [...filtered].sort(
              (a: ASTAnalyzerTreeNode, b: ASTAnalyzerTreeNode) =>
                (a.label || "").localeCompare(b.label || "")
            )
          : filtered;

      return Promise.resolve(
        sortedNodes.map(
          (node: ASTAnalyzerTreeNode) =>
            new AstAnalysisTreeItem({
              label: node.label || "Root",
              collapsibleState: node.children?.length
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None,
              iconName: node.iconName,
              node: node,
              description: node.description,
            })
        )
      );
    }

    if (element.node.children) {
      const activePath =
        vscode.window.activeTextEditor?.document.uri.fsPath || "";
      const filtered = this.filterMatches(element.node.children, activePath);
      const sortedChildren =
        this._sortMode === "alphabetical"
          ? [...filtered].sort(
              (a: ASTAnalyzerTreeNode, b: ASTAnalyzerTreeNode) =>
                (a.label || "").localeCompare(b.label || "")
            )
          : filtered;

      return Promise.resolve(
        sortedChildren.map(
          (child: ASTAnalyzerTreeNode) =>
            new AstAnalysisTreeItem({
              label: child.label || "Node",
              collapsibleState: child.children?.length
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None,
              iconName: child.iconName,
              node: child,
              description: child.description,
            })
        )
      );
    }

    return Promise.resolve([]);
  }
}
