from pathlib import Path
from typing import List

EXCLUDED_DIRS = {
    "node_modules", ".git", "__pycache__", "venv", ".venv",
    "dist", "build", ".next", ".tox", ".egg-info", "env",
}


def scan_files(directory: str) -> List[Path]:
    base = Path(directory)
    files = []
    for path in base.rglob("*"):
        if not path.is_file():
            continue
        parts = path.relative_to(base).parts
        if any(part in EXCLUDED_DIRS for part in parts):
            continue
        files.append(path)
    return files
