import * as vscode from "vscode";
import { AstAnalysisTreeProvider } from "../providers/ast-analysis-tree-provider";
import { FileExplorerTreeProvider } from "../providers/file-explorer-tree-provider";
import { FindingsTreeProvider } from "../providers/findings-tree-provider";
import { BookmarksTreeProvider } from "../providers/bookmarks-tree-provider";
import { updateProjectAnalysis } from "../views";
import { WebSocketClient } from "../services/websocket-client";
import { HttpClient } from "../services/http-client";
import { MatchStateService } from "../services/match-state";
import { ViewScope, Finding, Bookmark } from "../types";

export interface CommandDeps {
  analysisTreeProvider: AstAnalysisTreeProvider;
  explorerTreeProvider: FileExplorerTreeProvider;
  fileExplorerView: vscode.TreeView<any>;
  findingsProvider: FindingsTreeProvider;
  bookmarksProvider: BookmarksTreeProvider;
  astView: vscode.TreeView<any>;
  wsClient: WebSocketClient;
  http: HttpClient;
  matchStates: MatchStateService;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  deps: CommandDeps
) {
  const {
    analysisTreeProvider,
    explorerTreeProvider,
    fileExplorerView,
    findingsProvider,
    bookmarksProvider,
    astView,
    wsClient,
    http,
    matchStates,
  } = deps;

  // Set initial scope context
  vscode.commands.executeCommand("setContext", "scope", "file");
  vscode.commands.executeCommand("setContext", "jxscout.filter", "all");

  // Toggle scope command — project scope fetches project-wide analysis (Pro v2)
  const toggleScopeDisposable = vscode.commands.registerCommand(
    "jxscout.toggleScope",
    async () => {
      const newScope: ViewScope =
        analysisTreeProvider.getScope() === "project" ? "file" : "project";

      // Update the context key
      vscode.commands.executeCommand("setContext", "scope", newScope);

      analysisTreeProvider.setScope(newScope);
      explorerTreeProvider.setScope(newScope);
      updateViewTitles(newScope);
      if (newScope === "project") {
        await updateProjectAnalysis(analysisTreeProvider, wsClient);
      } else {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          const analysis = await wsClient
            .getAnalysis(activeEditor.document.uri.fsPath)
            .catch(() => undefined);
          if (analysis) {
            analysisTreeProvider.setAnalysisData(analysis.results);
            analysisTreeProvider.setState("success");
          } else {
            analysisTreeProvider.setState("empty");
          }
        } else {
          analysisTreeProvider.setState("empty");
        }
      }
      explorerTreeProvider.refresh();
      fileExplorerView.title = `File Explorer (${newScope})`;
    }
  );

  // Toggle sort mode command
  const toggleSortModeDisposable = vscode.commands.registerCommand(
    "jxscout.toggleSortMode",
    () => {
      const newSortMode =
        analysisTreeProvider.getSortMode() === "alphabetical"
          ? "occurrence"
          : "alphabetical";
      analysisTreeProvider.setSortMode(newSortMode);
      astView.title = `Descriptors (${analysisTreeProvider.getScope()}) - ${
        newSortMode === "alphabetical" ? "A-Z" : "By Occurrence"
      }`;
    }
  );

  // Pro v2: cycle match filter (all → unseen → interesting → all)
  const cycleFilterDisposable = vscode.commands.registerCommand(
    "jxscout.cycleMatchFilter",
    async () => {
      const order = ["all", "unseen", "interesting"] as const;
      const current = analysisTreeProvider.getFilter();
      const next = order[(order.indexOf(current) + 1) % order.length];
      analysisTreeProvider.setFilter(next);
      vscode.commands.executeCommand("setContext", "jxscout.filter", next);
      const labels = {
        all: "All matches",
        unseen: "Unseen matches",
        interesting: "Interesting matches",
      };
      vscode.window.setStatusBarMessage(
        `jxscout filter: ${labels[next]}`,
        3000
      );
    }
  );

  // Navigate to match command — marks match as seen (Pro v2)
  const navigateToMatchDisposable = vscode.commands.registerCommand(
    "jxscout.navigateToMatch",
    (data: any) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const startPosition = new vscode.Position(
        data.start.line - 1,
        data.start.column
      );
      const endPosition = new vscode.Position(
        data.end.line - 1,
        data.end.column
      );

      const range = new vscode.Range(startPosition, endPosition);
      editor.selection = new vscode.Selection(startPosition, endPosition);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

      // Pro v2: mark match as seen
      try {
        const key = matchStates.keyFor(
          editor.document.uri.fsPath,
          data
        );
        matchStates.markSeen(key);
        analysisTreeProvider.refresh();
      } catch {
        // MatchStateService not initialized yet — ignore
      }
    }
  );

  // Pro v2: mark selected matches as interesting / not interesting
  const markInterestingDisposable = vscode.commands.registerCommand(
    "jxscout.markInteresting",
    (interesting = true) => {
      const selectedItems = astView.selection;
      if (!selectedItems || selectedItems.length === 0) {
        vscode.window.showInformationMessage("No matches selected");
        return;
      }
      const activePath =
        vscode.window.activeTextEditor?.document.uri.fsPath || "";
      let count = 0;
      for (const item of selectedItems) {
        if (item.node?.type === "match" && item.node.data) {
          const key = matchStates.keyFor(activePath, item.node.data);
          matchStates.setInteresting(key, interesting);
          count++;
        }
      }
      analysisTreeProvider.refresh();
      vscode.window.setStatusBarMessage(
        `Marked ${count} match(es) as ${interesting ? "interesting" : "not interesting"}`,
        3000
      );
    }
  );

  // Pro v2: reset all seen/interesting state
  const resetMatchStateDisposable = vscode.commands.registerCommand(
    "jxscout.resetMatchStates",
    () => {
      matchStates.resetAll();
      analysisTreeProvider.refresh();
      vscode.window.showInformationMessage(
        "Reset all match seen/interesting states"
      );
    }
  );

  // Copy values command
  const copyValuesDisposable = vscode.commands.registerCommand(
    "jxscout.copyValues",
    async () => {
      const selectedItems = astView.selection;
      if (!selectedItems || selectedItems.length === 0) {
        return;
      }

      const values = selectedItems
        .filter((item) => item.node.type === "match")
        .map((item) => item.node.data.value);

      const uniqueValues = new Set(values);

      if (uniqueValues.size > 0) {
        await vscode.env.clipboard.writeText([...uniqueValues].join("\n"));
        vscode.window.showInformationMessage(
          `Copied ${uniqueValues.size} values to clipboard`
        );
      }
    }
  );

  // Copy paths for bruteforcing
  const copyPathsDisposable = vscode.commands.registerCommand(
    "jxscout.copyPaths",
    async () => {
      const selectedItems = astView.selection;
      if (!selectedItems || selectedItems.length === 0) {
        return;
      }

      const values = selectedItems
        .filter((item) => item.node.type === "match")
        .filter((item) => item.node.data.extra && item.node.data.extra.pathname)
        .map((item) => item.node.data.extra.pathname);

      const uniqueValues = new Set(values);

      if (uniqueValues.size > 0) {
        await vscode.env.clipboard.writeText([...uniqueValues].join("\n"));
        vscode.window.showInformationMessage(
          `Copied ${uniqueValues.size} values to clipboard`
        );
      } else {
        vscode.window.showInformationMessage("No paths found");
      }
    }
  );

  // Copy hostnames command
  const copyHostnamesDisposable = vscode.commands.registerCommand(
    "jxscout.copyHostnames",
    async () => {
      const selectedItems = astView.selection;
      if (!selectedItems || selectedItems.length === 0) {
        return;
      }

      const values = selectedItems
        .filter((item) => item.node.type === "match")
        .filter(
          (item) => item.node.data.extra && item.node.data.extra.hostname
        )
        .map((item) => item.node.data.extra.hostname);

      const uniqueValues = new Set(values);

      if (uniqueValues.size > 0) {
        await vscode.env.clipboard.writeText([...uniqueValues].join("\n"));
        vscode.window.showInformationMessage(
          `Copied ${uniqueValues.size} values to clipboard`
        );
      } else {
        vscode.window.showInformationMessage("No hostnames found");
      }
    }
  );

  // Copy query params command
  const copyQueryParamsDisposable = vscode.commands.registerCommand(
    "jxscout.copyQueryParams",
    async () => {
      const selectedItems = astView.selection;
      if (!selectedItems || selectedItems.length === 0) {
        return;
      }

      const allQueryParams = new Set<string>();

      selectedItems
        .filter((item) => item.node.type === "match")
        .filter(
          (item) => item.node.data.extra && item.node.data.extra["query-params"]
        )
        .map(
          (item) => new URLSearchParams(item.node.data.extra["query-params"])
        )
        .forEach((params) => {
          for (const [key] of params.entries()) {
            allQueryParams.add(key);
          }
        });

      if (allQueryParams.size > 0) {
        await vscode.env.clipboard.writeText([...allQueryParams].join("\n"));
        vscode.window.showInformationMessage(
          `Copied ${allQueryParams.size} values to clipboard`
        );
      } else {
        vscode.window.showInformationMessage("No query params found");
      }
    }
  );

  // Pro v2: create finding from selected matches (kind/severity picker)
  const createFindingDisposable = vscode.commands.registerCommand(
    "jxscout.createFindingFromMatches",
    async () => {
      const selectedItems = astView.selection?.filter(
        (item) => item.node?.type === "match"
      );
      if (!selectedItems || selectedItems.length === 0) {
        vscode.window.showInformationMessage(
          "Select one or more matches first"
        );
        return;
      }

      const severity = await vscode.window.showQuickPick(
        ["critical", "high", "medium", "low"],
        { placeHolder: "Select severity" }
      );
      if (!severity) {
        return;
      }

      const kind = await vscode.window.showInputBox({
        prompt: "Finding kind (e.g. secret, xss, idor, vulnerability)",
        value: "vulnerability",
      });
      if (!kind) {
        return;
      }

      const values = [
        ...new Set(
          selectedItems.map((item) => String(item.node.data?.value || ""))
        ),
      ].filter(Boolean);
      const description = values.join(", ");
      const dedupKey = values.sort().join("|");

      try {
        const result = await http.createFinding({
          kind,
          severity,
          description,
          dedup_key: dedupKey,
          metadata: {
            file_path:
              vscode.window.activeTextEditor?.document.uri.fsPath || "",
            match_count: values.length,
          },
        });
        if (result.success) {
          vscode.window.showInformationMessage(
            `Finding created (id: ${result.finding_id})`
          );
        } else {
          vscode.window.showInformationMessage(result.message);
        }
        findingsProvider.refresh();
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Failed to create finding: ${err.message}`
        );
      }
    }
  );

  // Pro v2: bookmark selected match (context menu)
  const bookmarkMatchDisposable = vscode.commands.registerCommand(
    "jxscout.bookmarkMatch",
    async (item?: any) => {
      const candidate = item?.node || item;
      const target =
        candidate?.type === "match"
          ? candidate
          : astView.selection?.find((i) => i.node?.type === "match")?.node;
      if (!target?.data) {
        vscode.window.showInformationMessage("Select a match to bookmark");
        return;
      }

      const label = await vscode.window.showInputBox({
        prompt: "Bookmark label",
        value: String(target.data.value || "match").slice(0, 80),
      });
      if (!label) {
        return;
      }

      try {
        await http.createBookmark({
          label,
          asset_url: target.data.filePath || "",
          description: target.data.analyzerName,
          code_snippet: String(target.data.value || ""),
          start_line: target.data.start?.line,
          end_line: target.data.end?.line,
        });
        vscode.window.showInformationMessage("Bookmark saved");
        bookmarksProvider.refresh();
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Failed to save bookmark: ${err.message}`
        );
      }
    }
  );

  // Pro v2: navigate to bookmark location
  const navigateToBookmarkDisposable = vscode.commands.registerCommand(
    "jxscout.navigateToBookmark",
    async (bookmark: Bookmark) => {
      if (!bookmark.asset_url || !bookmark.start_line) {
        return;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(
          bookmark.asset_url
        );
        const editor = await vscode.window.showTextDocument(doc);
        const pos = new vscode.Position(
          Math.max(0, bookmark.start_line - 1),
          0
        );
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(
          new vscode.Range(pos, pos),
          vscode.TextEditorRevealType.InCenter
        );
      } catch {
        vscode.window.showWarningMessage(
          "Could not open bookmark file (not in workspace?)"
        );
      }
    }
  );

  // Pro v2: copy finding description
  const copyFindingDisposable = vscode.commands.registerCommand(
    "jxscout.copyFindingDescription",
    async (finding: Finding) => {
      await vscode.env.clipboard.writeText(
        `[${finding.severity}] ${finding.kind}: ${finding.description}`
      );
      vscode.window.showInformationMessage("Finding copied to clipboard");
    }
  );

  // Pro v2: quick filter findings by severity
  const filterFindingsDisposable = vscode.commands.registerCommand(
    "jxscout.filterFindings",
    async () => {
      const severity = await vscode.window.showQuickPick(
        ["All", "critical", "high", "medium", "low"],
        { placeHolder: "Filter findings by severity" }
      );
      if (!severity) {
        return;
      }
      findingsProvider.setSeverityFilter(
        severity === "All" ? undefined : severity
      );
      await findingsProvider.refresh();
    }
  );

  // Pro v2: refresh findings view
  const refreshFindingsDisposable = vscode.commands.registerCommand(
    "jxscout.refreshFindings",
    () => findingsProvider.refresh()
  );

  // Pro v2: refresh bookmarks view
  const refreshBookmarksDisposable = vscode.commands.registerCommand(
    "jxscout.refreshBookmarks",
    () => bookmarksProvider.refresh()
  );

  // Pro v2: delete bookmark
  const deleteBookmarkDisposable = vscode.commands.registerCommand(
    "jxscout.deleteBookmark",
    async (item?: any) => {
      const bookmark: Bookmark | undefined = item?.bookmark;
      if (!bookmark?.id) {
        return;
      }
      try {
        await http.deleteBookmark(bookmark.id);
        bookmarksProvider.refresh();
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Failed to delete bookmark: ${err.message}`
        );
      }
    }
  );

  context.subscriptions.push(
    toggleScopeDisposable,
    toggleSortModeDisposable,
    cycleFilterDisposable,
    navigateToMatchDisposable,
    markInterestingDisposable,
    resetMatchStateDisposable,
    copyValuesDisposable,
    copyPathsDisposable,
    copyQueryParamsDisposable,
    copyHostnamesDisposable,
    createFindingDisposable,
    bookmarkMatchDisposable,
    navigateToBookmarkDisposable,
    copyFindingDisposable,
    filterFindingsDisposable,
    refreshFindingsDisposable,
    refreshBookmarksDisposable,
    deleteBookmarkDisposable
  );

  function updateViewTitles(scope: ViewScope) {
    astView.title = `Descriptors (${scope})`;
    fileExplorerView.title = `File Explorer (${scope})`;
  }
}
