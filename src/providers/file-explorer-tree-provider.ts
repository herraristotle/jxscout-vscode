import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ViewScope } from "../types";
import { WebSocketClient } from "../services/websocket-client";
import { HttpClient } from "../services/http-client";

export class FileExplorerTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly iconName?: string,
    public readonly resourceUri?: vscode.Uri
  ) {
    super(label, collapsibleState);
    if (iconName) {
      this.iconPath = new vscode.ThemeIcon(iconName);
    }
    if (resourceUri) {
      this.resourceUri = resourceUri;
    }
  }
}

export class FileExplorerTreeProvider
  implements vscode.TreeDataProvider<FileExplorerTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    FileExplorerTreeItem | undefined | null | void
  > = new vscode.EventEmitter<FileExplorerTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    FileExplorerTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private _scope: ViewScope = "file";
  private _workspaceRoot?: string;
  private _wsClient?: WebSocketClient;
  private _httpClient?: HttpClient;

  constructor(
    workspaceRoot?: string,
    wsClient?: WebSocketClient,
    httpClient?: HttpClient
  ) {
    this._workspaceRoot = workspaceRoot;
    this._wsClient = wsClient;
    this._httpClient = httpClient;
  }

  setWebSocketClient(wsClient: WebSocketClient) {
    this._wsClient = wsClient;
  }

  setHttpClient(httpClient: HttpClient) {
    this._httpClient = httpClient;
  }

  getScope(): ViewScope {
    return this._scope;
  }

  setScope(scope: ViewScope) {
    this._scope = scope;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FileExplorerTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: FileExplorerTreeItem
  ): Thenable<FileExplorerTreeItem[]> {
    if (this._scope === "project") {
      if (!this._workspaceRoot) {
        return Promise.resolve([]);
      }

      if (!element) {
        return this.getProjectRootItems();
      }

      return this.getDirectoryItems(element.resourceUri?.fsPath);
    } else {
      // File scope - show current file structure
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return Promise.resolve([]);
      }

      if (!element) {
        return this.getGraphGroups(editor.document.uri.fsPath);
      }

      if (element.contextValue === "relationGroup") {
        return this.getGraphItems(editor.document.uri.fsPath, element.id);
      }

      return Promise.resolve([]);
    }
  }

  // Groups come from the asset graph: how HTML, JS, chunks, sourcemaps and
  // reversed sources relate to the focused file.
  private async getGraphGroups(
    filePath: string
  ): Promise<FileExplorerTreeItem[]> {
    if (!this._httpClient) {
      return [];
    }

    try {
      const graph = await this._httpClient.getAssetGraph(filePath);
      if (!graph.nodes?.length) {
        return [];
      }

      const counts = new Map<string, number>();
      for (const node of graph.nodes) {
        counts.set(node.relation, (counts.get(node.relation) || 0) + 1);
      }

      return [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([relation, count]) => {
          const item = new FileExplorerTreeItem(
            `${relationLabel(relation)} (${count})`,
            vscode.TreeItemCollapsibleState.Expanded,
            "relationGroup",
            relationIcon(relation)
          );
          item.id = relation;
          return item;
        });
    } catch {
      return [];
    }
  }

  private async getGraphItems(
    filePath: string,
    relation: string | undefined
  ): Promise<FileExplorerTreeItem[]> {
    if (!this._httpClient || !relation) {
      return [];
    }

    try {
      const graph = await this._httpClient.getAssetGraph(filePath);
      return (graph.nodes || [])
        .filter((node) => node.relation === relation)
        .map((node) => {
          const target = node.path || node.url;
          return new FileExplorerTreeItem(
            path.basename(node.path || node.url),
            vscode.TreeItemCollapsibleState.None,
            "file",
            this.getFileIcon(target),
            vscode.Uri.file(target)
          );
        });
    } catch {
      return [];
    }
  }

  private getProjectRootItems(): Thenable<FileExplorerTreeItem[]> {
    if (!this._workspaceRoot) {
      return Promise.resolve([]);
    }

    return Promise.resolve(
      fs
        .readdirSync(this._workspaceRoot)
        .filter((name) => !name.startsWith("."))
        .map((name) => {
          const fullPath = path.join(this._workspaceRoot!, name);
          const isDirectory = fs.statSync(fullPath).isDirectory();
          return new FileExplorerTreeItem(
            name,
            isDirectory
              ? vscode.TreeItemCollapsibleState.Collapsed
              : vscode.TreeItemCollapsibleState.None,
            isDirectory ? "directory" : "file",
            isDirectory ? "folder" : this.getFileIcon(name),
            vscode.Uri.file(fullPath)
          );
        })
    );
  }

  private getDirectoryItems(
    dirPath?: string
  ): Thenable<FileExplorerTreeItem[]> {
    if (!dirPath) {
      return Promise.resolve([]);
    }

    return Promise.resolve(
      fs
        .readdirSync(dirPath)
        .filter((name) => !name.startsWith("."))
        .map((name) => {
          const fullPath = path.join(dirPath, name);
          const isDirectory = fs.statSync(fullPath).isDirectory();
          return new FileExplorerTreeItem(
            name,
            isDirectory
              ? vscode.TreeItemCollapsibleState.Collapsed
              : vscode.TreeItemCollapsibleState.None,
            isDirectory ? "directory" : "file",
            isDirectory ? "folder" : this.getFileIcon(name),
            vscode.Uri.file(fullPath)
          );
        })
    );
  }

  private getFileIcon(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
      case ".js":
      case ".jsx":
        return "javascript";
      case ".ts":
      case ".tsx":
        return "typescript";
      case ".json":
        return "json";
      case ".html":
        return "html";
      case ".css":
        return "css";
      case ".md":
        return "markdown";
      default:
        return "file";
    }
  }
}

const relationLabels: Record<string, string> = {
  loader: "Loaded by",
  loaded: "Loads",
  chunk: "Chunks",
  sourcemap_owner: "Source map",
  sourcemap_source: "Reversed sources",
  optimized: "Optimized from",
  unpacked: "Unpacked from",
};

const relationIcons: Record<string, string> = {
  loader: "arrow-up",
  loaded: "arrow-down",
  chunk: "file-submodule",
  sourcemap_owner: "map",
  sourcemap_source: "file-code",
  optimized: "rocket",
  unpacked: "package",
};

function relationLabel(relation: string): string {
  return relationLabels[relation] || relation;
}

function relationIcon(relation: string): string {
  return relationIcons[relation] || "file";
}
