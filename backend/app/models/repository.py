from datetime import datetime
from typing import Annotated, Literal, Optional, Union
from pydantic import BaseModel, Field


class RepositoryCreate(BaseModel):
    name: str


class RepositoryResponse(BaseModel):
    id: str
    name: str
    status: str
    language: Optional[str] = None
    file_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class NodeResponse(BaseModel):
    id: str
    repository_id: str
    node_id: str
    label: str
    type: str
    data: dict = {}
    position_x: float = 0
    position_y: float = 0


class EdgeResponse(BaseModel):
    id: str
    repository_id: str
    source_id: str
    target_id: str
    label: Optional[str] = None


class GraphResponse(BaseModel):
    nodes: list[NodeResponse]
    edges: list[EdgeResponse]


class AnalysisStats(BaseModel):
    files_found: int = 0
    languages: dict[str, int] = {}
    nodes_built: int = 0


class AnalysisStatusResponse(BaseModel):
    id: str
    status: str
    progress: float = 0.0
    step: int = 0
    stats: AnalysisStats = AnalysisStats()


class QuestionRequest(BaseModel):
    question: str
    type: str = "freeform"


class EvidenceItem(BaseModel):
    node_id: str
    display_name: str
    type: str
    reason: str
    relevance: float = Field(ge=0.0, le=1.0)


class SubGraphNode(BaseModel):
    id: str
    label: str
    type: str


class SubGraphEdge(BaseModel):
    source: str
    target: str
    label: Optional[str] = None


class SubGraph(BaseModel):
    type: str = "dependency_flow"
    title: str = ""
    nodes: list[SubGraphNode]
    edges: list[SubGraphEdge]


class HighlightNodesAction(BaseModel):
    model_config = {"extra": "forbid"}
    type: Literal["highlight_nodes"] = "highlight_nodes"
    nodes: list[str]


class HighlightEdgesAction(BaseModel):
    model_config = {"extra": "forbid"}
    type: Literal["highlight_edges"] = "highlight_edges"
    edges: list[str]


class ShowSubGraphAction(BaseModel):
    model_config = {"extra": "forbid"}
    type: Literal["show_subgraph"] = "show_subgraph"
    graph: SubGraph


class SubGraphRequest(BaseModel):
    anchor_node_ids: list[str] = []
    depth: int = 2
    title: str = ""


GraphAction = Annotated[
    Union[HighlightNodesAction, HighlightEdgesAction, ShowSubGraphAction],
    Field(discriminator="type"),
]


class QuestionResponse(BaseModel):
    schema_version: int = 1
    answer: str
    confidence: float
    degraded_mode: bool = False
    warnings: list[str] = []
    evidence: list[EvidenceItem] = []
    graph_actions: list[GraphAction] = []
