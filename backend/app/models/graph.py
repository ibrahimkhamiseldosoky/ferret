from pydantic import BaseModel
from typing import Optional


class GraphNode(BaseModel):
    id: str
    label: str
    type: str = "file"
    data: dict = {}
    position_x: float = 0
    position_y: float = 0


class GraphEdge(BaseModel):
    source_id: str
    target_id: str
    label: Optional[str] = None


class ArchitectureGraph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
