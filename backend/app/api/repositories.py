import os
import tempfile
import zipfile
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from typing import List, Optional
from app.models.repository import (
    RepositoryResponse,
    AnalysisStatusResponse,
    AnalysisStats,
    SubGraphRequest,
)
from app.services.analysis_service import get_analysis_state
from app.services.repository_service import (
    create_repository,
    get_repository,
    list_repositories,
    delete_repository,
    update_status,
)
from app.services.analysis_service import start_analysis
from app.services.onboarding_service import generate_onboarding
from app.services.impact_service import analyze_impact
from app.services.symbol_service import get_symbols, get_call_chain
from app.services.subgraph_service import extract_subgraph
from app.services.cache import cache
from app.core.deps import get_current_user
from app.services.semantic_queries import (
    find_entrypoints,
    find_unused_nodes,
    find_external_dependencies,
    find_auth_flow,
    find_db_interactions,
    find_request_flow,
)

router = APIRouter(prefix="/api/repositories", tags=["repositories"])


@router.post("/upload", response_model=RepositoryResponse)
async def upload_repository(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only ZIP files are accepted")

    repo_name = Path(file.filename).stem
    extract_dir = tempfile.mkdtemp()

    zip_path = os.path.join(extract_dir, file.filename)
    try:
        content = await file.read()
        with open(zip_path, "wb") as f:
            f.write(content)

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

        os.remove(zip_path)

        top_level = os.listdir(extract_dir)
        if len(top_level) == 1 and os.path.isdir(os.path.join(extract_dir, top_level[0])):
            actual_dir = os.path.join(extract_dir, top_level[0])
        else:
            actual_dir = extract_dir

        repo_id = create_repository(repo_name, 0, None, user["id"])

        start_analysis(repo_id, actual_dir)

        repo_data = get_repository(repo_id)
        if not repo_data:
            raise HTTPException(status_code=500, detail="Failed to create repository")
        return RepositoryResponse(**repo_data)

    except zipfile.BadZipFile:
        shutil.rmtree(extract_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Invalid ZIP file")
    except Exception as e:
        shutil.rmtree(extract_dir, ignore_errors=True)
        detail = str(e)
        if "PGRST204" in detail or "Could not find" in detail:
            detail = "Database tables not set up. Run the SQL migration in backend/migrations/001_create_tables.sql against your Supabase project."
        raise HTTPException(status_code=500, detail=detail)


def _verify_ownership(repo: Optional[dict], user_id: str) -> dict:
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    if repo.get("user_id") and repo["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this repository")
    return repo


def _db_error(e: Exception) -> str:
    msg = str(e)
    if "PGRST204" in msg or "Could not find" in msg:
        return "Database tables not set up. Run the SQL migration in backend/migrations/001_create_tables.sql against your Supabase project."
    return msg


@router.get("", response_model=List[RepositoryResponse])
async def list_all_repositories(user: dict = Depends(get_current_user)):
    try:
        repos = list_repositories(user["id"])
        return [RepositoryResponse(**r) for r in repos]
    except Exception as e:
        raise HTTPException(status_code=500, detail=_db_error(e))


@router.get("/{repository_id}", response_model=RepositoryResponse)
async def get_repository_by_id(repository_id: str, user: dict = Depends(get_current_user)):
    try:
        repo = _verify_ownership(get_repository(repository_id), user["id"])
        return RepositoryResponse(**repo)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=_db_error(e))


@router.post("/{repository_id}/invalidate-cache")
async def invalidate_repo_cache(repository_id: str, user: dict = Depends(get_current_user)):
    try:
        _verify_ownership(get_repository(repository_id), user["id"])
        cache.invalidate_repo(repository_id)
        return {"detail": "Cache invalidated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{repository_id}/subgraph")
async def get_subgraph(repository_id: str, body: SubGraphRequest, user: dict = Depends(get_current_user)):
    try:
        repo = _verify_ownership(get_repository(repository_id), user["id"])
        result = extract_subgraph(repository_id, body.anchor_node_ids, body.depth)
        graph = result
        if body.title:
            graph["title"] = body.title
        graph_action = {
            "type": "show_subgraph",
            "graph": graph,
        }
        return graph_action
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{repository_id}/impact/{node_id:path}")
async def get_impact_analysis(repository_id: str, node_id: str, user: dict = Depends(get_current_user)):
    try:
        repo = _verify_ownership(get_repository(repository_id), user["id"])
        result = analyze_impact(repository_id, node_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{repository_id}/onboarding")
async def get_onboarding(repository_id: str, user: dict = Depends(get_current_user)):
    try:
        repo = _verify_ownership(get_repository(repository_id), user["id"])
        result = generate_onboarding(repository_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{repository_id}")
async def delete_repository_by_id(repository_id: str, user: dict = Depends(get_current_user)):
    try:
        repo = _verify_ownership(get_repository(repository_id), user["id"])
        cache.invalidate_repo(repository_id)
        delete_repository(repository_id)
        return {"detail": "Repository deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=_db_error(e))


@router.post("/{repository_id}/symbols/{node_id:path}")
async def get_node_symbols(repository_id: str, node_id: str, user: dict = Depends(get_current_user)):
    try:
        _verify_ownership(get_repository(repository_id), user["id"])
        result = get_symbols(repository_id, node_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{repository_id}/call-chain/{node_id:path}")
async def get_node_call_chain(repository_id: str, node_id: str, body: dict, user: dict = Depends(get_current_user)):
    try:
        _verify_ownership(get_repository(repository_id), user["id"])
        function_name = body.get("function_name", "")
        if not function_name:
            raise HTTPException(status_code=400, detail="function_name is required")
        result = get_call_chain(repository_id, node_id, function_name)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
