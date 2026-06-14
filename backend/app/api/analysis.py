from fastapi import APIRouter, HTTPException, Depends
from app.core.deps import get_current_user
from app.core.database import get_supabase
from app.services.repository_service import get_user_repository
from app.services.analysis_service import get_analysis_state
from app.models.repository import AnalysisStatusResponse

router = APIRouter(prefix="/api/repositories", tags=["analysis"])


@router.get("/{repository_id}/status", response_model=AnalysisStatusResponse)
async def get_analysis_status(repository_id: str, user: dict = Depends(get_current_user)):
    repo = get_user_repository(repository_id, user["id"])
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    state = get_analysis_state(repository_id)
    return AnalysisStatusResponse(
        id=repository_id,
        status=repo["status"],
        progress=state.get("progress", 0.0),
        step=state.get("step", 0),
        stats=state.get("stats", {"files_found": 0, "languages": {}, "nodes_built": 0}),
    )


@router.get("/{repository_id}/graph")
async def get_repository_graph(repository_id: str, user: dict = Depends(get_current_user)):
    repo = get_user_repository(repository_id, user["id"])
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    supabase = get_supabase()
    nodes_result = (
        supabase.table("nodes")
        .select("*")
        .eq("repository_id", repository_id)
        .execute()
    )
    edges_result = (
        supabase.table("edges")
        .select("*")
        .eq("repository_id", repository_id)
        .execute()
    )

    if not nodes_result.data:
        raise HTTPException(
            status_code=404,
            detail="Graph not found or analysis not yet complete",
        )

    frontend_nodes = []
    for n in nodes_result.data:
        frontend_nodes.append({
            "id": n["id"],
            "node_id": n["node_id"],
            "label": n["label"],
            "type": n["type"],
            "data": n.get("data", {}),
            "position": {
                "x": n.get("position_x", 0),
                "y": n.get("position_y", 0),
            },
        })

    frontend_edges = []
    for e in edges_result.data:
        frontend_edges.append({
            "id": e["id"],
            "source_id": e["source_id"],
            "target_id": e["target_id"],
            "label": e.get("label"),
        })

    return {"nodes": frontend_nodes, "edges": frontend_edges}


@router.get("/{repository_id}/files")
async def get_repository_files(repository_id: str, user: dict = Depends(get_current_user)):
    repo = get_user_repository(repository_id, user["id"])
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    supabase = get_supabase()
    nodes_result = (
        supabase.table("nodes")
        .select("*")
        .eq("repository_id", repository_id)
        .eq("type", "file")
        .execute()
    )

    if not nodes_result.data:
        raise HTTPException(
            status_code=404,
            detail="No files found or analysis not yet complete",
        )

    files = [
        {
            "id": n["node_id"],
            "name": n["label"],
            "type": n["type"],
            "path": n["data"].get("filePath", n["label"]) if n.get("data") else n["label"],
        }
        for n in nodes_result.data
    ]

    return {"files": files, "total": len(files)}
