export interface Repository {
  id: string;
  name: string;
  status: 'pending' | 'analyzing' | 'completed' | 'failed';
  language?: string;
  file_count: number;
  created_at: string;
  updated_at: string;
}

export interface GraphNode {
  id: string;
  node_id: string;
  label: string;
  type: 'file' | 'service' | 'api' | 'database' | 'event' | 'external';
  data: Record<string, any>;
  position?: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  label?: string;
}

export interface FileItem {
  path: string;
  language: string;
  symbols: SymbolItem[];
}

export interface SymbolItem {
  name: string;
  type: 'function' | 'class' | 'import' | 'export';
  line: number;
}

export interface EvidenceItem {
  node_id: string;
  display_name: string;
  type: 'source' | 'inference' | 'dependency';
  reason: string;
  relevance: number;
}

export interface SubGraphNode {
  id: string;
  label: string;
  type: string;
  x?: number;
  y?: number;
}

export interface SubGraphEdge {
  source: string;
  target: string;
  label?: string;
}

export interface SubGraph {
  type: string;
  title: string;
  nodes: SubGraphNode[];
  edges: SubGraphEdge[];
}

export interface HighlightNodesAction {
  type: 'highlight_nodes';
  nodes: string[];
}

export interface HighlightEdgesAction {
  type: 'highlight_edges';
  edges: string[];
}

export interface ShowSubGraphAction {
  type: 'show_subgraph';
  graph: SubGraph;
}

export type GraphAction = HighlightNodesAction | HighlightEdgesAction | ShowSubGraphAction;

export interface SubGraphRequest {
  anchor_node_ids: string[];
  depth?: number;
  title?: string;
}

export interface QuestionResponse {
  schema_version: number;
  answer: string;
  confidence: number;
  degraded_mode: boolean;
  warnings: string[];
  evidence: EvidenceItem[];
  graph_actions: GraphAction[];
}

export interface ReadingOrderItem {
  node_id: string;
  reason: string;
  tags: string[];
  estimated_minutes: number;
}



export interface OnboardingData {
  overview: string;
  reading_order: ReadingOrderItem[];
  core_concepts: string[];
  estimated_hours: number;
}

export interface FunctionCall {
  name: string;
  line: number;
}

export interface FunctionSymbol {
  name: string;
  line: number;
  calls: FunctionCall[];
  called_by: { caller: string; line: number }[];
}

export interface ClassSymbol {
  name: string;
  line: number;
  methods: { name: string; line: number; calls: FunctionCall[] }[];
}

export interface SymbolResponse {
  node_id: string;
  label: string;
  type: string;
  functions: FunctionSymbol[];
  classes: ClassSymbol[];
}

export interface CallChainItem {
  caller_func: string;
  callee_func: string;
  callee_node_id: string | null;
  callee_label: string;
  callee_line: number | null;
  call_line: number;
}

export interface CallChainResponse {
  function_name: string;
  source_node_id: string;
  source_label: string;
  chain: CallChainItem[];
  highlighted_node_ids: string[];
}

export interface ImpactResult {
  risk: string;
  affected_files: { node_id: string; label: string; type: string }[];
  affected_features: string[];
  dependency_depth: number;
  confidence: number;
  total_affected: number;
}

export interface QAItem {
  question: string;
  answer: string;
  mode?: 'explain' | 'show';
  confidence?: number;
  relevant_files?: string[];
  evidence?: EvidenceItem[];
  graph_actions?: GraphAction[];
  degraded_mode?: boolean;
  warnings?: string[];
}

export interface AnalysisStatus {
  status: string;
  progress?: number;
  step?: number;
  stats?: {
    files_found?: number;
    languages?: Record<string, number>;
    nodes_built?: number;
  };
}
