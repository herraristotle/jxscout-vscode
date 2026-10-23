import * as vscode from "vscode";
import { Finding, Bookmark, AssetGraph } from "../types";

// Pro v2: REST client for the jxscout HTTP server (findings, bookmarks).
export class HttpClient {
  private baseUrl!: string;
  private token?: string;

  constructor() {
    this.refreshConfig();
  }

  refreshConfig() {
    const config = vscode.workspace.getConfiguration("jxscout");
    const host = config.get<string>("serverHost") || "localhost";
    const port = config.get<number>("serverPort") || 3333;
    this.baseUrl = `http://${host}:${port}`;
    this.token = config.get<string>("apiToken") || undefined;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(init?.headers || {}),
      },
    });
    const body: any = await res.json().catch(() => undefined);
    if (!res.ok) {
      const message = body?.error || body?.message || `HTTP ${res.status}`;
      throw new Error(message);
    }
    // server wraps in { success, result } when using SendSuccessResponse
    if (body && typeof body === "object" && "result" in body) {
      return body.result as T;
    }
    return body as T;
  }

  async listFindings(opts?: { severity?: string; kind?: string; limit?: number }): Promise<Finding[]> {
    const params = new URLSearchParams();
    if (opts?.severity) {params.set("severity", opts.severity);}
    if (opts?.kind) {params.set("kind", opts.kind);}
    params.set("limit", String(opts?.limit ?? 200));
    const data = await this.request<any>(`/findings?${params.toString()}`);
    return (data.findings ?? data) as Finding[];
  }

  async createFinding(f: {
    kind: string;
    severity: string;
    description: string;
    dedup_key?: string;
    metadata?: any;
  }): Promise<{ success: boolean; finding_id: number | null; message: string }> {
    return this.request(`/findings`, {
      method: "POST",
      body: JSON.stringify(f),
    });
  }

  async listBookmarks(opts?: { asset_id?: number; limit?: number }): Promise<Bookmark[]> {
    const params = new URLSearchParams();
    if (opts?.asset_id) {params.set("asset_id", String(opts.asset_id));}
    params.set("limit", String(opts?.limit ?? 200));
    const data = await this.request<any>(`/bookmarks?${params.toString()}`);
    return (data.bookmarks ?? data) as Bookmark[];
  }

  async createBookmark(b: {
    asset_id?: number;
    asset_url?: string;
    label: string;
    description?: string;
    code_snippet?: string;
    start_line?: number;
    end_line?: number;
    tags?: string[];
  }): Promise<any> {
    return this.request(`/bookmarks`, {
      method: "POST",
      body: JSON.stringify(b),
    });
  }

  async deleteBookmark(id: number): Promise<void> {
    await this.request(`/bookmarks/${id}`, { method: "DELETE" });
  }

  // Relationship graph for one asset: loaders, loaded, chunks, derivatives,
  // sourcemap owner and reversed sources. Accepts either the asset URL or the
  // file path on disk.
  async getAssetGraph(target: string): Promise<AssetGraph> {
    const data = await this.request<AssetGraph>(
      `/api/asset-graph?path=${encodeURIComponent(target)}&url=${encodeURIComponent(target)}`
    );
    return data ?? { url: target, nodes: [] };
  }
}
