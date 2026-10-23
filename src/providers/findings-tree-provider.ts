import * as vscode from "vscode";
import { Finding } from "../types";
import { HttpClient } from "../services/http-client";

const severityIcons: Record<string, string> = {
  critical: "error",
  high: "warning",
  medium: "info",
  low: "circle-outline",
};

export class FindingTreeItem extends vscode.TreeItem {
  constructor(public readonly finding: Finding) {
    super(
      finding.description || finding.kind,
      vscode.TreeItemCollapsibleState.None
    );
    this.description = `${finding.severity} · ${finding.kind}`;
    this.iconPath = new vscode.ThemeIcon(
      severityIcons[finding.severity] || "circle-outline"
    );
    this.tooltip = `[${finding.severity}] ${finding.kind}: ${finding.description}`;
    this.contextValue = "finding";
    this.id = `finding-${finding.id}`;
    this.command = {
      command: "jxscout.copyFindingDescription",
      title: "Copy finding description",
      arguments: [finding],
    };
  }
}

// Pro v2: findings view — lists structured security findings from the server
export class FindingsTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    FindingTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private findings: Finding[] = [];
  private severityFilter?: string;
  private loading = false;

  constructor(private http: HttpClient) {}

  setSeverityFilter(severity?: string) {
    this.severityFilter = severity;
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this._onDidChangeTreeData.fire();
    try {
      this.findings = await this.http.listFindings({
        severity: this.severityFilter,
      });
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Failed to load findings: ${err.message}`
      );
      this.findings = [];
    } finally {
      this.loading = false;
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<vscode.TreeItem[]> {
    if (this.loading) {
      return Promise.resolve([]);
    }
    if (this.findings.length === 0) {
      const empty = new vscode.TreeItem(
        this.severityFilter
          ? `No ${this.severityFilter} findings`
          : "No findings yet",
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon("info");
      empty.contextValue = "emptyMessage";
      return Promise.resolve([empty]);
    }
    return Promise.resolve(this.findings.map((f) => new FindingTreeItem(f)));
  }
}
