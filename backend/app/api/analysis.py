from fastapi import APIRouter, HTTPException, Depends
from app.core.deps import get_current_user
from app.core.database import get_supabase

router = APIRouter(prefix="/api/repositories", tags=["analysis"])


@router.get("/{repository_id}/graph")
async def get_repository_graph(repository_id: str, user: dict = Depends(get_current_user)):
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
