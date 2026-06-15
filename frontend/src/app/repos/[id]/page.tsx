'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { BookOpen, Search, Menu } from 'lucide-react';
import { getRepositoryGraph, getRepository, getRepositoryStatus, askQuestion, getOnboarding, getImpactAnalysis } from '@/lib/api';
import type { GraphNode, GraphEdge, QAItem, GraphAction, SubGraph, OnboardingData, ImpactResult } from '@/types';
import type { HeatMapMode } from '@/lib/graphMetrics';
import ArchitectureGraph from '@/components/ArchitectureGraph';
import InfoPanel from '@/components/InfoPanel';
import AIAssistant from '@/components/AIAssistant';
import SubGraphOverlay from '@/components/SubGraphOverlay';
import AnalysisProgress from '@/components/AnalysisProgress';
import GraphControls from '@/components/GraphControls';
import type { NodeTypeFilter } from '@/components/GraphControls';

const ANALYSIS_STEPS = [
  'Detecting languages',
  'Building AST',
  'Mapping dependencies',
  'Creating knowledge graph',
  'Generating architecture',
];

interface RepoData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function streamText(
  fullText: string,
  onChunk: (text: string) => void,
  onDone: () => void
): () => void {
  let idx = 0;
  const interval = setInterval(() => {
    idx += Math.max(1, Math.floor(fullText.length / 80));
    if (idx >= fullText.length) {
      onChunk(fullText);
      clearInterval(interval);
      onDone();
    } else {
      onChunk(fullText.slice(0, idx));
    }
  }, 16);
  return () => clearInterval(interval);
}

export default function RepoPage() {
  const params = useParams();
  const id = params.id as string;

  const [repo, setRepo] = useState<{ name: string } | null>(null);
  const [graphData, setGraphData] = useState<RepoData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<QAItem[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [aiGraphActions, setAiGraphActions] = useState<GraphAction[] | null>(null);
  const [walkthroughGraph, setWalkthroughGraph] = useState<SubGraph | null>(null);
  const [pulsingNodeIds, setPulsingNodeIds] = useState<string[] | null>(null);
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [heatMapMode, setHeatMapMode] = useState<HeatMapMode>('none');
  const [revealProgress, setRevealProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<NodeTypeFilter>('all');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [repoStatus, setRepoStatus] = useState<string>('pending');
  const [progressStep, setProgressStep] = useState(0);
  const [analysisStats, setAnalysisStats] = useState<{ filesFound?: number; languages?: Record<string, number>; nodesBuilt?: number }>({});
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  const loadGraph = useCallback(async () => {
    try {
      const [r, g] = await Promise.all([getRepository(id), getRepositoryGraph(id)]);
      setRepo(r);
      setGraphData(g);
      setLoading(false);
      setRevealProgress(0);
      return true;
    } catch {
      return false;
    }
  }, [id]);

  useEffect(() => {
    if (!graphData || revealProgress >= 1) return;
    const timer = setInterval(() => {
      setRevealProgress((p) => {
        const next = p + 0.04;
        return next >= 1 ? 1 : next;
      });
    }, 40);
    return () => clearInterval(timer);
  }, [graphData, revealProgress]);

  useEffect(() => {
    if (!id) return;

    loadGraph().then((ok) => {
      if (ok) return;

      getRepository(id).then((r) => {
        setRepo(r);
        setRepoStatus(r.status);
      });

      pollingRef.current = setInterval(async () => {
        try {
          const status = await getRepositoryStatus(id);
          setRepoStatus(status.status);
          if (status.step != null) setProgressStep(status.step);
          else if (status.progress != null) {
            setProgressStep(Math.min(Math.floor(status.progress * ANALYSIS_STEPS.length), ANALYSIS_STEPS.length - 1));
          }
          if (status.stats) {
            setAnalysisStats({
              filesFound: status.stats.files_found,
              languages: status.stats.languages,
              nodesBuilt: status.stats.nodes_built,
            });
          }
          if (status.status === 'completed') {
            const loaded = await loadGraph();
            if (loaded && pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          } else if (status.status === 'failed') {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            setError('Analysis failed. Please upload again.');
            setLoading(false);
          }
        } catch {
          // keep polling
        }
      }, 1500);
    });

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      streamCleanupRef.current?.();
    };
  }, [id, loadGraph]);

  

  const navigateToNode = useCallback(
    (nodeId: string) => {
      const node = graphData?.nodes.find((n) => n.node_id === nodeId);
      if (node) {
        setSelectedNode(node);
        setFocusNodeId(nodeId);
        setTimeout(() => setFocusNodeId(null), 100);
      }
    },
    [graphData]
  );

  const applyGraphActions = useCallback(
    (actions: GraphAction[]) => {
      setAiGraphActions(actions.length > 0 ? actions : null);

      const sgAction = actions.find((a) => a.type === 'show_subgraph');
      if (sgAction && sgAction.type === 'show_subgraph') {
        setWalkthroughGraph(sgAction.graph);
      }
    },
    []
  );

  const handleNodeClick = useCallback((node: GraphNode | null) => {
    setSelectedNode(node);
    if (node) {
      setFocusNodeId(node.node_id);
      setTimeout(() => setFocusNodeId(null), 100);
    }
    setAiGraphActions(null);
    setPulsingNodeIds(null);
    setImpactResult(null);
    if (!node) setFocusedNodeId(null);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedNode(null);
    setFocusedNodeId(null);
  }, []);

  const handleAsk = useCallback(
    async (question: string, mode: 'explain' | 'show' = 'explain') => {
      if (!id) return;
      streamCleanupRef.current?.();
      setAiLoading(true);
      setStreamingText('');
      setChatHistory((prev) => [
        ...prev,
        { question, answer: '', mode, confidence: 0, relevant_files: [], evidence: [], graph_actions: [] },
      ]);

      try {
        const res = await askQuestion(id, question);

        if (mode === 'show' && res.graph_actions?.length) {
          applyGraphActions(res.graph_actions);
        }

        setChatHistory((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            question,
            answer: res.answer,
            mode,
            confidence: res.confidence,
            relevant_files: res.evidence.map((e) => e.display_name),
            evidence: res.evidence,
            graph_actions: res.graph_actions,
            degraded_mode: res.degraded_mode,
            warnings: res.warnings,
          };
          return updated;
        });

        if (mode === 'explain' && res.graph_actions?.length) {
          applyGraphActions(res.graph_actions);
        }

        streamCleanupRef.current = streamText(
          res.answer,
          setStreamingText,
          () => {
            setStreamingText(null);
            setAiLoading(false);
          }
        );
      } catch {
        setChatHistory((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            question,
            answer: 'Sorry, I encountered an error processing your question.',
            mode,
            confidence: 0,
            relevant_files: [],
          };
          return updated;
        });
        setAiLoading(false);
        setStreamingText(null);
      }
    },
    [id, applyGraphActions]
  );

  const handleEvidenceClick = useCallback(
    (nodeId: string) => {
      navigateToNode(nodeId);
      setAiGraphActions([{ type: 'highlight_nodes', nodes: [nodeId] }]);
    },
    [navigateToNode]
  );

  const handleRunImpact = useCallback(async (nodeId: string) => {
    if (!id) return;
    setImpactLoading(true);
    setImpactResult(null);
    try {
      const result = await getImpactAnalysis(id, nodeId);
      setImpactResult(result);
      const ids = result.affected_files.map((f) => f.node_id);
      setAiGraphActions([{ type: 'highlight_nodes', nodes: ids }]);
    } catch {
      // silent
    } finally {
      setImpactLoading(false);
    }
  }, [id]);

  const handleClearImpact = useCallback(() => {
    setImpactResult(null);
    setAiGraphActions(null);
  }, []);

  const handleHighlightNodes = useCallback((nodeIds: string[]) => {
    setAiGraphActions([{ type: 'highlight_nodes', nodes: nodeIds }]);
  }, []);

  const handleClearHighlight = useCallback(() => {
    setAiGraphActions(null);
  }, []);

  const handleOpenOnboarding = useCallback(async () => {
    if (!id) return;
    setOnboardingLoading(true);
    try {
      const data = await getOnboarding(id);
      setOnboardingData(data);
    } catch {
      // silent
    } finally {
      setOnboardingLoading(false);
    }
  }, [id]);

  const handleAiReset = useCallback(() => {
    setAiGraphActions(null);
    setWalkthroughGraph(null);
    setPulsingNodeIds(null);
    setSelectedNode(null);
  }, []);

  const handleSubGraphViewInMain = useCallback((nodeIds: string[]) => {
    setPulsingNodeIds(null);
    setAiGraphActions([{ type: 'highlight_nodes', nodes: nodeIds }]);
  }, []);

  const aiHighlightNodes = useMemo(() => {
    const action = (aiGraphActions || []).find((a) => a.type === 'highlight_nodes');
    return action?.type === 'highlight_nodes' ? action.nodes : null;
  }, [aiGraphActions]);

  const aiHighlightEdges = useMemo(() => {
    const action = (aiGraphActions || []).find((a) => a.type === 'highlight_edges');
    return action?.type === 'highlight_edges' ? action.edges : null;
  }, [aiGraphActions]);

  const filteredNodeIds = useMemo(() => {
    if (!graphData) return null;
    const hasFilter = activeFilter !== 'all' || searchQuery.length > 0;
    if (!hasFilter) return null;

    const query = searchQuery.toLowerCase();
    const ids = new Set<string>();
    for (const node of graphData.nodes) {
      const matchesType = activeFilter === 'all' || node.type === activeFilter;
      const matchesSearch = !searchQuery || node.label.toLowerCase().includes(query);
      if (matchesType && matchesSearch) {
        ids.add(node.node_id);
      }
    }
    return ids;
  }, [graphData, searchQuery, activeFilter]);

  const directoryGroups = useMemo(() => {
    if (!graphData) return new Map<string, { dirId: string; label: string; childIds: string[] }>();
    const groups = new Map<string, { dirId: string; label: string; childIds: string[] }>();
    for (const node of graphData.nodes) {
      const filePath = (node.data as { filePath?: string })?.filePath;
      if (!filePath || (node.type as string) === 'directory') continue;
      const normalized = String(filePath).replace(/\\/g, '/');
      const parts = normalized.split('/');
      parts.pop();
      const dir = parts.join('/') || '/';
      if (!groups.has(dir)) {
        groups.set(dir, { dirId: `dir:${dir}`, label: dir.split('/').pop() || dir, childIds: [] });
      }
      groups.get(dir)!.childIds.push(node.node_id);
    }
    for (const [dir, group] of groups) {
      if (group.childIds.length < 2) groups.delete(dir);
    }
    return groups;
  }, [graphData]);

  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());

  const toggleDir = useCallback((dirId: string) => {
    setCollapsedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dirId)) next.delete(dirId);
      else next.add(dirId);
      return next;
    });
  }, []);

  const displayNodes = useMemo((): GraphNode[] => {
    if (!graphData) return [];
    if (collapsedDirs.size === 0) return graphData.nodes;

    const hiddenIds = new Set<string>();
    const dirGroupNodes: GraphNode[] = [];

    for (const dirId of collapsedDirs) {
      const group = directoryGroups.get(dirId.replace(/^dir:/, '') || dirId);
      if (!group) continue;
      let avgX = 0, avgY = 0, count = 0;
      for (const childId of group.childIds) {
        hiddenIds.add(childId);
        const child = graphData.nodes.find(n => n.node_id === childId);
        if (child?.position) {
          avgX += child.position.x;
          avgY += child.position.y;
          count++;
        }
      }
      if (count > 0) { avgX /= count; avgY /= count; }
      dirGroupNodes.push({
        id: group.dirId,
        node_id: group.dirId,
        label: group.label,
        type: 'directory',
        data: { childCount: group.childIds.length },
        position: { x: avgX, y: avgY },
      } as unknown as GraphNode);
    }

    const allNodes = graphData.nodes;
    return [...allNodes.filter(n => !hiddenIds.has(n.node_id)), ...dirGroupNodes];
  }, [graphData, collapsedDirs, directoryGroups]);

  const displayEdges = useMemo((): GraphEdge[] => {
    if (!graphData) return [];
    if (collapsedDirs.size === 0) return graphData.edges;

    const hiddenIds = new Set<string>();
    for (const dirId of collapsedDirs) {
      const dirKey = dirId.replace(/^dir:/, '') || dirId;
      const group = directoryGroups.get(dirKey);
      if (group) group.childIds.forEach(id => hiddenIds.add(id));
    }

    const seen = new Set<string>();
    return graphData.edges
      .filter(e => !hiddenIds.has(e.source_id) && !hiddenIds.has(e.target_id))
      .filter(e => {
        const key = `${e.source_id}->${e.target_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [graphData, collapsedDirs, directoryGroups]);

  if (loading && repoStatus !== 'completed') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white ferret-analysis-bg">
        <div className="max-w-md w-full px-6 text-center">
          <div className="mb-8 flex flex-col items-center">
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 animate-ping" />
              <div className="absolute inset-2 rounded-full border-2 border-indigo-400/30 animate-spin" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <Search className="w-7 h-7 text-indigo-500" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
              Ferret<span className="text-indigo-500">.</span>
            </h1>
            <p className="mt-1 text-sm text-zinc-500">Uncovering architecture</p>
          </div>
          <p className="text-sm text-zinc-500">
            {repo?.name ? `Mapping ${repo.name}` : 'Mapping your codebase'}
          </p>
          <div className="mt-8 ferret-skeleton-graph rounded-xl border border-zinc-200 bg-zinc-50 h-32 mb-6 overflow-hidden relative">
            <div className="absolute inset-0 flex items-center justify-center gap-4 px-6">
              {[...Array(Math.min(analysisStats.nodesBuilt || 3, 8))].map((_, i) => (
                <div
                  key={i}
                  className="w-16 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 animate-pulse"
                  style={{ animationDelay: `${i * 200}ms`, opacity: 0.3 + (i * 0.1) }}
                />
              ))}
            </div>
          </div>
          <div className="w-full h-1 bg-zinc-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((progressStep + 1) / ANALYSIS_STEPS.length) * 100}%` }}
            />
          </div>
          <div className="mt-8 text-left">
            <AnalysisProgress
              currentStep={progressStep}
              steps={ANALYSIS_STEPS}
              stats={{
                filesFound: analysisStats.filesFound,
                languages: analysisStats.languages,
                nodesBuilt: analysisStats.nodesBuilt,
              }}
              partialNodes={analysisStats.nodesBuilt}
            />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-50">
        <div className="text-center">
          <p className="text-red-600 text-sm font-medium">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <div className="flex flex-1 overflow-hidden">
        <div className={`${sidebarOpen ? 'flex' : 'hidden'} lg:flex shrink-0`}>
          <AIAssistant
            onAsk={handleAsk}
            onEvidenceClick={handleEvidenceClick}
            loading={aiLoading}
            chatHistory={chatHistory}
            streamingText={streamingText}
            side
            onboardingData={onboardingData}
            onboardingLoading={onboardingLoading}
            fileCount={graphData?.nodes.length}
            repoName={repo?.name}
            graphNodes={graphData?.nodes}
          />
        </div>
        <div className="flex-1 relative bg-zinc-900/30">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="absolute top-3 left-3 z-10 flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/90 border border-zinc-200 text-xs text-zinc-600 shadow-sm hover:bg-zinc-50 transition-colors backdrop-blur-sm lg:hidden"
          >
            <Menu className="w-3.5 h-3.5" />
            {sidebarOpen ? 'Close' : 'Menu'}
          </button>
          <button
            onClick={() => {
              if (onboardingData) {
                sessionStorage.setItem(`ferret-onboarding-${id}`, '1');
                setOnboardingData(null);
              } else {
                handleOpenOnboarding();
              }
            }}
            disabled={onboardingLoading}
            className="absolute top-3 left-20 z-10 flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/90 border border-zinc-200 text-xs text-zinc-600 shadow-sm hover:bg-zinc-50 disabled:opacity-50 transition-colors backdrop-blur-sm"
          >
            <BookOpen className="w-3.5 h-3.5" />
            {onboardingData ? 'Close Guide' : 'New Dev Mode'}
          </button>
          <GraphControls
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            nodeCount={graphData?.nodes.length || 0}
            visibleCount={filteredNodeIds?.size ?? graphData?.nodes.length ?? 0}
          />
          <ArchitectureGraph
            nodes={graphData ? displayNodes : []}
            edges={graphData ? displayEdges : []}
            selectedNodeId={selectedNode?.node_id || null}
            aiHighlightNodes={aiHighlightNodes}
            aiHighlightEdges={aiHighlightEdges}
            focusNodeId={focusNodeId}
            focusedNodeId={focusedNodeId}
            heatMapMode={heatMapMode}
            pulsingNodeIds={pulsingNodeIds}
            dimmedNodeIds={filteredNodeIds}
            revealProgress={revealProgress}
            collapsedDirs={collapsedDirs}
            onNodeClick={handleNodeClick}
            onAiReset={handleAiReset}
            onHeatMapModeChange={setHeatMapMode}
            onToggleDir={toggleDir}
          />
      {walkthroughGraph && (
          <SubGraphOverlay
            graph={walkthroughGraph}
            nodes={graphData?.nodes || []}
            onClose={handleAiReset}
            onViewInMain={handleSubGraphViewInMain}
          />
        )}
        </div>
      </div>
      {selectedNode && (
        <InfoPanel
          node={selectedNode}
          nodes={graphData?.nodes || []}
          edges={graphData?.edges || []}
          repositoryId={id}
          onClose={handleClosePanel}
          onNodeNavigate={navigateToNode}
          onFocusNode={setFocusedNodeId}
          focusedNodeId={focusedNodeId}
          impactResult={impactResult}
          impactLoading={impactLoading}
          onRunImpact={handleRunImpact}
          onClearImpact={handleClearImpact}
          onHighlightNodes={handleHighlightNodes}
          onClearHighlight={handleClearHighlight}
        />
      )}
    </div>
  );
}
