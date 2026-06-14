import re
from pathlib import Path
from typing import List


def _normalise_python_import(import_name: str) -> str:
    return import_name.replace(".", "/") + ".py"


def _match_python_import(import_name: str, file_paths: list[Path]) -> list[str]:
    candidates = []
    as_path = _normalise_python_import(import_name)
    for fp in file_paths:
        fp_str = str(fp).replace("\\", "/")
        if fp_str.endswith(as_path) or fp_str.endswith(as_path.replace(".py", "/__init__.py")):
            candidates.append(str(fp))
        init_check = as_path.replace(".py", "/__init__.py")
        if fp_str.endswith(init_check):
            candidates.append(str(fp))
    return candidates


def _match_js_import(import_path: str, source_file: Path, file_paths: list[Path]) -> list[str]:
    if not import_path.startswith(".") and not import_path.startswith("/"):
        return []
    source_dir = source_file.parent
    candidates = []
    extensions = ["", ".js", ".jsx", ".ts", ".tsx", ".json", ".mjs", ".cjs"]

    resolved = (source_dir / import_path).resolve()
    base_str = str(resolved).replace("\\", "/")

    for ext in extensions:
        candidate_str = base_str + ext
        for fp in file_paths:
            if str(fp).replace("\\", "/") == candidate_str:
                candidates.append(str(fp))
        index_str = base_str + "/index" + ext
        for fp in file_paths:
            if str(fp).replace("\\", "/") == index_str:
                candidates.append(str(fp))

    return list(set(candidates))


def extract_dependencies(
    files: list[Path], all_symbols: dict[str, list[dict]]
) -> list[dict]:
    edges = []
    file_paths = [f for f in files]

    for file_path in files:
        fp_str = str(file_path)
        symbols = all_symbols.get(fp_str, [])
        for sym in symbols:
            if sym["type"] != "import":
                continue
            name = sym["name"]

            if file_path.suffix == ".py":
                matched = _match_python_import(name, file_paths)
            elif file_path.suffix in (".js", ".jsx", ".ts", ".tsx"):
                matched = _match_js_import(name, file_path, file_paths)
            else:
                matched = []

            is_external = len(matched) == 0
            for target in matched:
                edges.append({
                    "source": fp_str,
                    "target": target,
                    "label": "imports",
                })
            if is_external and name:
                edges.append({
                    "source": fp_str,
                    "target": f"external:{name}",
                    "label": "external_dep",
                })

    return edges
