import * as vscode from "vscode";
import { WebSocketClient } from "./services/websocket-client";
import { HttpClient } from "./services/http-client";
import { MatchStateService } from "./services/match-state";
import { createViews } from "./views";
import { registerCommands, CommandDeps } from "./commands";
import { FindingsTreeProvider } from "./providers/findings-tree-provider";
import { BookmarksTreeProvider } from "./providers/bookmarks-tree-provider";
import { VersionCheckService } from "./services/versionCheck";

export function activate(context: vscode.ExtensionContext) {
  // Initialize version check service
  const versionCheckService = VersionCheckService.getInstance();
  versionCheckService.start();
  context.subscriptions.push({
    dispose: () => {
      versionCheckService.stop();
    },
  });

  // Pro v2: match state service (seen/uninteresting) — must init before views
  const matchStates = MatchStateService.getInstance(context);

  // Initialize WebSocket client
  const config = vscode.workspace.getConfiguration("jxscout");
  const host = config.get<string>("serverHost") || "localhost";
  const port = config.get<number>("serverPort") || 3333;
  const wsClient = new WebSocketClient(`ws://${host}:${port}/ws`);

  // Pro v2: REST client for findings/bookmarks
  const http = new HttpClient();

  const connectionStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right
  );
  connectionStatusBarItem.text = "jxscout $(sync~spin)";
  connectionStatusBarItem.tooltip = "Connecting to jxscout server...";
  connectionStatusBarItem.show();

  // Create views and get providers
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const { astView, fileExplorerView, analysisTreeProvider, explorerTreeProvider } = createViews(
    context,
    workspaceRoot,
    wsClient
  );

  // Connect FileExplorerTreeProvider to the analysis + graph services
  explorerTreeProvider.setWebSocketClient(wsClient);
  explorerTreeProvider.setHttpClient(http);

  // Pro v2: findings + bookmarks tree views
  const findingsProvider = new FindingsTreeProvider(http);
  const bookmarksProvider = new BookmarksTreeProvider(http);
  const findingsView = vscode.window.createTreeView("jxscoutFindingsView", {
    treeDataProvider: findingsProvider,
    showCollapseAll: false,
  });
  const bookmarksView = vscode.window.createTreeView("jxscoutBookmarksView", {
    treeDataProvider: bookmarksProvider,
    showCollapseAll: false,
  });
  findingsView.title = "Findings";
  bookmarksView.title = "Bookmarks";
  context.subscriptions.push(findingsView, bookmarksView);

  // Connect to WebSocket server
  wsClient
    .connect()
    .then(() => {
      connectionStatusBarItem.text = "jxscout $(check)";
      connectionStatusBarItem.tooltip = "Connected to jxscout server";
      // Pro v2: initial data loads once connected
      findingsProvider.refresh();
      bookmarksProvider.refresh();
    })
    .catch((error) => {
      connectionStatusBarItem.text = "jxscout $(error)";
      connectionStatusBarItem.tooltip = `Failed to connect: ${error.message}`;
      vscode.window.showErrorMessage(
        `Failed to connect to jxscout server: ${error.message}`
      );
    });

  // Register commands
  const deps: CommandDeps = {
    analysisTreeProvider,
    explorerTreeProvider,
    fileExplorerView,
    findingsProvider,
    bookmarksProvider,
    astView,
    wsClient,
    http,
    matchStates,
  };
  registerCommands(context, deps);

  // Add status bar items to subscriptions
  context.subscriptions.push(connectionStatusBarItem);

  // Clean up WebSocket connection and providers on deactivation
  context.subscriptions.push({
    dispose: () => {
      wsClient.disconnect();
    },
  });
}

export function deactivate() {}
