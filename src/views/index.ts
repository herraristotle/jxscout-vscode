import * as vscode from "vscode";
import { AstAnalysisTreeProvider } from "../providers/ast-analysis-tree-provider";
import { FileExplorerTreeProvider } from "../providers/file-explorer-tree-provider";
import { WebSocketClient } from "../services/websocket-client";
import { MatchStateService } from "../services/match-state";

export function createViews(
  context: vscode.ExtensionContext,
  workspaceRoot: string | undefined,
  wsClient: WebSocketClient
) {
  const analysisTreeProvider = new AstAnalysisTreeProvider();
  const explorerTreeProvider = new FileExplorerTreeProvider(workspaceRoot);

  // Pro v2: seen/uninteresting match tracking
  const matchStates = MatchStateService.getInstance(context);
  analysisTreeProvider.setMatchStates(matchStates);

  // Register the views
  const astView = vscode.window.createTreeView("jxscoutAstView", {
    treeDataProvider: analysisTreeProvider,
    showCollapseAll: true,
    canSelectMany: true,
  });

  // Register File Explorer view
  const fileExplorerView = vscode.window.createTreeView("jxscoutFileView", {
    treeDataProvider: explorerTreeProvider,
    showCollapseAll: true,
  });

  // Initial titles
  astView.title = "Descriptors (File)";
  fileExplorerView.title = "File Explorer (File)";

  // Check for active editor during initialization after WebSocket is ready
  wsClient.onReady().then(() => {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      updateASTAnalysis(activeEditor, analysisTreeProvider, wsClient);
    }
  });

  // Register active editor change handler
  const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(
    async (editor) => {
      await updateASTAnalysis(editor, analysisTreeProvider, wsClient);
    }
  );

  context.subscriptions.push(astView, fileExplorerView, editorChangeDisposable);

  return {
    astView,
    fileExplorerView,
    analysisTreeProvider,
    explorerTreeProvider,
  };
}

async function updateASTAnalysis(
  editor: vscode.TextEditor | undefined,
  analysisTreeProvider: AstAnalysisTreeProvider,
  wsClient: WebSocketClient
) {
  if (!editor) {
    analysisTreeProvider.setState("empty");
    return;
  }

  const document = editor.document;
  if (!document) {
    analysisTreeProvider.setState("empty");
    return;
  }

  analysisTreeProvider.setState("loading");

  try {
    const analysis = await wsClient.getAnalysis(document.uri.fsPath);
    analysisTreeProvider.setAnalysisData(analysis.results);
    analysisTreeProvider.setState("success");
  } catch (error: any) {
    if (error?.message?.includes("asset not found")) {
      analysisTreeProvider.setState("asset-not-found");
    } else {
      vscode.window.showErrorMessage(
        `Failed to get descriptors: ${error.message}`
      );
      analysisTreeProvider.setState("empty");
    }
  }
}

// Pro v2: fetch project-wide analysis for the project scope view
export async function updateProjectAnalysis(
  analysisTreeProvider: AstAnalysisTreeProvider,
  wsClient: WebSocketClient
) {
  analysisTreeProvider.setState("loading");
  try {
    const result = await wsClient.getProjectAnalysis();
    const files = (result.files || []).map((f) => ({
      type: "file" as const,
      label: f.filePath,
      data: { filePath: f.filePath, results: f.results },
      children: f.results,
      description: `${countMatches(f.results)} matches`,
    }));
    analysisTreeProvider.setProjectData(files as any);
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Failed to load project analysis: ${error.message}`
    );
    analysisTreeProvider.setState("empty");
  }
}

function countMatches(nodes: any[]): number {
  let count = 0;
  for (const node of nodes || []) {
    if (node.type === "match") {
      count++;
    }
    if (node.children?.length) {
      count += countMatches(node.children);
    }
  }
  return count;
}
