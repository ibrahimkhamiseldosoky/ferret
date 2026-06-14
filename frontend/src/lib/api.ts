import type { Repository, GraphNode, GraphEdge, FileItem, QuestionResponse, OnboardingData, AnalysisStatus, ImpactResult, SymbolResponse, CallChainResponse, GraphAction, SubGraphRequest } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function getAuthHeaders(): Record<string, string> {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('ferret_token');
    if (token) return { Authorization: `Bearer ${token}` };
  }
  return {};
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    ...options,
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ferret_token');
      window.location.href = '/login';
    }
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      if (body.detail) msg = body.detail;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  return res.json();
}

export async function listRepositories(): Promise<Repository[]> {
  return fetchApi<Repository[]>('/api/repositories');
}

export async function getRepository(id: string): Promise<Repository> {
  return fetchApi<Repository>(`/api/repositories/${id}`);
}

export async function getRepositoryStatus(id: string): Promise<AnalysisStatus> {
  return fetchApi<AnalysisStatus>(`/api/repositories/${id}/status`);
}

export async function getRepositoryGraph(id: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  return fetchApi<{ nodes: GraphNode[]; edges: GraphEdge[] }>(`/api/repositories/${id}/graph`);
}

export async function uploadRepository(file: File): Promise<Repository> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/repositories/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    let msg = `Upload failed: ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.detail) msg = body.detail;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  return res.json();
}

export async function askQuestion(
  id: string,
  question: string,
  type?: string
): Promise<QuestionResponse> {
  return fetchApi<QuestionResponse>(
    `/api/repositories/${id}/ask`,
    {
      method: 'POST',
      body: JSON.stringify({ question, type }),
    }
  );
}

export async function getNodeSymbols(id: string, nodeId: string): Promise<SymbolResponse> {
  return fetchApi<SymbolResponse>(
    `/api/repositories/${id}/symbols/${encodeURIComponent(nodeId)}`,
    { method: 'POST' }
  );
}

export async function getCallChain(id: string, nodeId: string, functionName: string): Promise<CallChainResponse> {
  return fetchApi<CallChainResponse>(
    `/api/repositories/${id}/call-chain/${encodeURIComponent(nodeId)}`,
    { method: 'POST', body: JSON.stringify({ function_name: functionName }) }
  );
}

export async function getImpactAnalysis(id: string, nodeId: string): Promise<ImpactResult> {
  return fetchApi<ImpactResult>(
    `/api/repositories/${id}/impact/${encodeURIComponent(nodeId)}`,
    { method: 'POST' }
  );
}

export async function getOnboarding(id: string): Promise<OnboardingData> {
  return fetchApi<OnboardingData>(
    `/api/repositories/${id}/onboarding`,
    { method: 'POST' }
  );
}

export async function getRepositoryFiles(id: string): Promise<FileItem[]> {
  return fetchApi<FileItem[]>(`/api/repositories/${id}/files`);
}

export async function getSubGraph(id: string, anchorNodeIds: string[], depth: number = 2, title?: string): Promise<GraphAction> {
  return fetchApi<GraphAction>(
    `/api/repositories/${id}/subgraph`,
    {
      method: 'POST',
      body: JSON.stringify({ anchor_node_ids: anchorNodeIds, depth, title } as SubGraphRequest),
    }
  );
}
