import logging
from collections import defaultdict
from app.core.database import get_supabase

logger = logging.getLogger(__name__)


class NodeResolver:
    def __init__(self, repository_id: str):
        supabase = get_supabase()
        nodes = supabase.table("nodes").select("node_id,label").eq("repository_id", repository_id).execute()
        edges = supabase.table("edges").select("id,source_id,target_id").eq("repository_id", repository_id).execute()

        nodes_data = nodes.data if nodes.data else []
        edges_data = edges.data if edges.data else []

        self.canonical: dict[str, str] = {}
        self.alias: dict[str, list[str]] = defaultdict(list)
        self.stem_index: dict[str, str] = {}

        self.all_labels: set[str] = set()

        for n in nodes_data:
            nid = n["node_id"]
            label = n["label"]
            self.canonical[label] = nid
            self.all_labels.add(label)
            filename = label.split("/")[-1]
            self.alias[filename].append(nid)
            stem = filename.rsplit(".", 1)[0].lower() if "." in filename else filename.lower()
            if stem not in self.stem_index:
                self.stem_index[stem] = nid

        self.edge_map: dict[tuple[str, str], str] = {}
        for e in edges_data:
            self.edge_map[(e["source_id"], e["target_id"])] = e["id"]

    def resolve_file_hint(self, hint: str) -> list[str]:
        normalized = hint.replace("\\", "/")
        if normalized in self.canonical:
            return [self.canonical[normalized]]
        lower_normalized = normalized.lower()
        for label, nid in self.canonical.items():
            if label.lower() == lower_normalized:
                return [nid]
        filename = normalized.split("/")[-1]
        if filename in self.alias:
            return self.alias[filename]
        stem = filename.rsplit(".", 1)[0].lower() if "." in filename else filename.lower()
        if stem in self.stem_index:
            return [self.stem_index[stem]]
        return []

    def resolve_evidence(self, file_hint: str, reason: str, relevance: float, ev_type: str) -> dict | None:
        ids = self.resolve_file_hint(file_hint)
        if not ids:
            return None
        return {
            "node_id": ids[0],
            "display_name": file_hint.split("/")[-1],
            "type": ev_type,
            "reason": reason,
            "relevance": relevance,
        }

    def resolve_edge_intent(self, from_hint: str, to_hint: str) -> str | None:
        from_ids = self.resolve_file_hint(from_hint)
        to_ids = self.resolve_file_hint(to_hint)
        for fid in from_ids:
            for tid in to_ids:
                eid = self.edge_map.get((fid, tid))
                if eid:
                    return eid
        return None

    def resolve_highlight_candidates(self, candidates: list[str]) -> list[str]:
        result = []
        for c in candidates:
            resolved = self.resolve_file_hint(c)
            if not resolved:
                logger.warning("Resolver: highlight candidate '%s' not found in graph", c)
            result.extend(resolved)
        return result
