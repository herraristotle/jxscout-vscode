import * as vscode from "vscode";
import { Bookmark } from "../types";
import { HttpClient } from "../services/http-client";

// Pro v2: bookmarks view — saved code snippets/locations
export class BookmarkTreeItem extends vscode.TreeItem {
  constructor(public readonly bookmark: Bookmark) {
    super(bookmark.label, vscode.TreeItemCollapsibleState.None);
    this.description = bookmark.asset_url || "";
    this.iconPath = new vscode.ThemeIcon("bookmark");
    this.tooltip = bookmark.description || bookmark.code_snippet || bookmark.label;
    this.contextValue = "bookmark";
    this.id = `bookmark-${bookmark.id}`;
    if (bookmark.start_line && bookmark.asset_url) {
      this.command = {
        command: "jxscout.navigateToBookmark",
        title: "Navigate to bookmark",
        arguments: [bookmark],
      };
    }
  }
}

export class BookmarksTreeProvider
  implements vscode.TreeDataProvider<BookmarkTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    BookmarkTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private bookmarks: Bookmark[] = [];
  private loading = false;

  constructor(private http: HttpClient) {}

  async refresh(): Promise<void> {
    this.loading = true;
    this._onDidChangeTreeData.fire();
    try {
      this.bookmarks = await this.http.listBookmarks();
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Failed to load bookmarks: ${err.message}`
      );
      this.bookmarks = [];
    } finally {
      this.loading = false;
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(element: BookmarkTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<BookmarkTreeItem[]> {
    if (this.loading) {
      return Promise.resolve([]);
    }
    return Promise.resolve(this.bookmarks.map((b) => new BookmarkTreeItem(b)));
  }
}
