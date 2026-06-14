import threading
from pathlib import Path
from collections import Counter
from app.core.database import get_supabase
from app.services.repository_service import update_status, update_repository
from app.parsers.scanner import scan_files
from app.parsers.detector import detect_primary_language
from app.services.onboarding_service import generate_onboarding
from app.parsers.ast_parser import parse_file
from app.parsers.dependency_extractor import extract_dependencies
from app.parsers.graph_builder import build_graph
from app.services.cache import cache

_analysis_state: dict[str, dict] = {}


def get_analysis_state(repository_id: str) -> dict:
    return _analysis_state.get(repository_id, {
        "step": 0,
        "progress": 0.0,
        "stats": {"files_found": 0, "languages": {}, "nodes_built": 0},
    })


def _set_analysis_state(repository_id: str, step: int, progress: float, **stats) -> None:
    current = _analysis_state.get(repository_id, {"stats": {}})
    merged_stats = {**current.get("stats", {}), **stats}
    _analysis_state[repository_id] = {
        "step": step,
        "progress": progress,
        "stats": merged_stats,
    }


def start_analysis(repository_id: str, extract_dir: str) -> None:
    thread = threading.Thread(
        target=_run_analysis,
        args=(repository_id, extract_dir),
        daemon=True,
    )
    thread.start()


def _run_analysis(repository_id: str, extract_dir: str) -> None:
    try:
        update_status(repository_id, "analyzing")
        _set_analysis_state(repository_id, 0, 0.05)

        files = scan_files(extract_dir)
        if not files:
            update_status(repository_id, "failed")
            return

        lang_counts = Counter()
        for f in files:
            ext = f.suffix.lower()
            if ext in (".py",):
                lang_counts["Python"] += 1
            elif ext in (".ts", ".tsx"):
                lang_counts["TypeScript"] += 1
            elif ext in (".js", ".jsx"):
                lang_counts["JavaScript"] += 1
            elif ext in (".json",):
                lang_counts["JSON"] += 1
            elif ext in (".go",):
                lang_counts["Go"] += 1
            else:
                lang_counts["Other"] += 1

        _set_analysis_state(
            repository_id, 0, 0.15,
            files_found=len(files),
            languages=dict(lang_counts),
        )

        primary_lang, lang_confidence = detect_primary_language(files)
        update_repository(repository_id, {
            "language": primary_lang,
            "file_count": len(files),
        })

        _set_analysis_state(repository_id, 1, 0.3)

        all_symbols = {}
        all_contents = {}
        for i, file_path in enumerate(files):
            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
                all_contents[str(file_path)] = content
                symbols = parse_file(str(file_path), content)
                if symbols:
                    all_symbols[str(file_path)] = symbols
            except Exception:
                continue
            if i % 5 == 0:
                _set_analysis_state(
                    repository_id, 1, 0.3 + (0.2 * i / max(len(files), 1)),
                    nodes_built=i + 1,
                )

        _set_analysis_state(repository_id, 2, 0.55)
        edges = extract_dependencies(files, all_symbols)

        _set_analysis_state(repository_id, 3, 0.75)
        graph = build_graph(files, all_symbols, edges, all_contents)
        _set_analysis_state(
            repository_id, 4, 0.9,
            nodes_built=len(graph.nodes),
        )

        supabase = get_supabase()
        supabase.table("nodes").delete().eq("repository_id", repository_id).execute()
        supabase.table("edges").delete().eq("repository_id", repository_id).execute()

        node_records = []
        for node in graph.nodes:
            node_records.append({
                "repository_id": repository_id,
                "node_id": node.id,
                "label": node.label,
                "type": node.type,
                "data": node.data,
                "position_x": node.position_x,
                "position_y": node.position_y,
            })

        edge_records = []
        for edge in graph.edges:
            edge_records.append({
                "repository_id": repository_id,
                "source_id": edge.source_id,
                "target_id": edge.target_id,
                "label": edge.label,
            })

        if node_records:
            supabase.table("nodes").insert(node_records).execute()
        if edge_records:
            supabase.table("edges").insert(edge_records).execute()

        update_status(repository_id, "completed")
        _set_analysis_state(repository_id, 4, 1.0, nodes_built=len(graph.nodes))
        _analysis_state.pop(repository_id, None)
        cache.invalidate_repo(repository_id)

        # Generate onboarding guide in background (fire and forget)
        try:
            generate_onboarding(repository_id)
        except Exception:
            pass  # Non-critical; user can trigger manually

        cache.invalidate_repo(repository_id)

    except Exception:
        update_status(repository_id, "failed")
        cache.invalidate_repo(repository_id)
