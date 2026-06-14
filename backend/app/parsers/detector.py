EXTENSION_MAP = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript (React)",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".md": "Markdown",
    ".sql": "SQL",
    ".css": "CSS",
    ".html": "HTML",
    ".scss": "SCSS",
    ".less": "Less",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".rb": "Ruby",
    ".php": "PHP",
    ".c": "C",
    ".cpp": "C++",
    ".h": "C/C++ Header",
    ".cs": "C#",
    ".swift": "Swift",
    ".kt": "Kotlin",
    ".ex": "Elixir",
    ".exs": "Elixir",
}


def detect_language(file_path: str) -> tuple[str, float]:
    ext = None
    path_lower = file_path.lower()
    for known_ext in sorted(EXTENSION_MAP.keys(), key=len, reverse=True):
        if path_lower.endswith(known_ext):
            ext = known_ext
            break
    if ext is None:
        return "Unknown", 0.0
    confidence = 0.95 if ext in (".py", ".js", ".ts", ".tsx", ".jsx") else 0.85
    return EXTENSION_MAP[ext], confidence


def detect_primary_language(files: list) -> tuple[str, float]:
    counts: dict[str, int] = {}
    for f in files:
        lang, _ = detect_language(str(f))
        if lang != "Unknown":
            counts[lang] = counts.get(lang, 0) + 1
    if not counts:
        return "Unknown", 0.0
    primary = max(counts, key=counts.get)
    total = sum(counts.values())
    ratio = counts[primary] / total if total else 0
    return primary, round(ratio, 2)
