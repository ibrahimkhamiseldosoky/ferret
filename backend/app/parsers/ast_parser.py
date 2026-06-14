import ast
import re
from typing import List


class ParsedSymbol:
    def __init__(self, name: str, symbol_type: str, line: int, file_path: str, calls: list[dict] = None):
        self.name = name
        self.symbol_type = symbol_type
        self.line = line
        self.file_path = file_path
        self.calls = calls or []

    def to_dict(self) -> dict:
        d = {
            "name": self.name,
            "type": self.symbol_type,
            "line": self.line,
            "file_path": self.file_path,
        }
        if self.calls:
            d["calls"] = self.calls
        return d


def _extract_function_calls(func_node: ast.FunctionDef | ast.AsyncFunctionDef) -> list[dict]:
    calls = []
    for child in ast.walk(func_node):
        if isinstance(child, ast.Call):
            if isinstance(child.func, ast.Name):
                calls.append({"name": child.func.id, "line": getattr(child, "lineno", 0)})
            elif isinstance(child.func, ast.Attribute):
                calls.append({"name": child.func.attr, "line": getattr(child, "lineno", 0)})
    return calls


def parse_python(file_path: str, content: str) -> List[ParsedSymbol]:
    symbols = []
    try:
        tree = ast.parse(content, filename=file_path)

        def _walk_module_body(body):
            for node in body:
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        symbols.append(ParsedSymbol(
                            name=alias.name,
                            symbol_type="import",
                            line=getattr(node, "lineno", 0),
                            file_path=file_path,
                        ))
                elif isinstance(node, ast.ImportFrom):
                    module = node.module or ""
                    for alias in node.names:
                        symbols.append(ParsedSymbol(
                            name=module,
                            symbol_type="import",
                            line=getattr(node, "lineno", 0),
                            file_path=file_path,
                        ))
                elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    calls = _extract_function_calls(node)
                    symbols.append(ParsedSymbol(
                        name=node.name,
                        symbol_type="function",
                        line=getattr(node, "lineno", 0),
                        file_path=file_path,
                        calls=calls,
                    ))
                elif isinstance(node, ast.ClassDef):
                    methods = []
                    for item in node.body:
                        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                            methods.append({
                                "name": item.name,
                                "line": getattr(item, "lineno", 0),
                                "calls": _extract_function_calls(item),
                            })
                    symbols.append(ParsedSymbol(
                        name=node.name,
                        symbol_type="class",
                        line=getattr(node, "lineno", 0),
                        file_path=file_path,
                        calls=methods,
                    ))
                elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                    if node.func.attr in ("get", "post", "put", "delete", "patch", "route"):
                        symbols.append(ParsedSymbol(
                            name=f"route:{node.func.attr}",
                            symbol_type="api_endpoint",
                            line=getattr(node, "lineno", 0),
                            file_path=file_path,
                        ))

        _walk_module_body(tree.body)
    except SyntaxError:
        pass
    return symbols


def _parse_js_ts(file_path: str, content: str) -> List[ParsedSymbol]:
    symbols = []

    import_pattern = re.compile(
        r'(?:import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))?)\s+from\s+[\'"]([^\'"]+)[\'"]'
        r'|const\s+\w+\s*=\s*require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)'
        r'|import\s+[\'"]([^\'"]+)[\'"]\s*)',
        re.MULTILINE,
    )
    for match in import_pattern.finditer(content):
        name = match.group(1) or match.group(2) or match.group(3) or ""
        symbols.append(ParsedSymbol(
            name=name.strip(),
            symbol_type="import",
            line=content[:match.start()].count("\n") + 1,
            file_path=file_path,
        ))

    func_pattern = re.compile(
        r'(?:export\s+)?(?:async\s+)?function\s+\*?\s*(\w+)\s*\(',
        re.MULTILINE,
    )
    for match in func_pattern.finditer(content):
        symbols.append(ParsedSymbol(
            name=match.group(1),
            symbol_type="function",
            line=content[:match.start()].count("\n") + 1,
            file_path=file_path,
        ))

    arrow_func_pattern = re.compile(
        r'(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>',
        re.MULTILINE,
    )
    for match in arrow_func_pattern.finditer(content):
        symbols.append(ParsedSymbol(
            name=match.group(1),
            symbol_type="function",
            line=content[:match.start()].count("\n") + 1,
            file_path=file_path,
        ))

    class_pattern = re.compile(
        r'(?:export\s+)?class\s+(\w+)',
        re.MULTILINE,
    )
    for match in class_pattern.finditer(content):
        symbols.append(ParsedSymbol(
            name=match.group(1),
            symbol_type="class",
            line=content[:match.start()].count("\n") + 1,
            file_path=file_path,
        ))

    export_pattern = re.compile(
        r'(?:export\s+default\s+(?:function|class|const)\s+(\w+)|export\s+\{[^}]+\})',
        re.MULTILINE,
    )
    for match in export_pattern.finditer(content):
        if match.group(1):
            symbols.append(ParsedSymbol(
                name=match.group(1),
                symbol_type="export",
                line=content[:match.start()].count("\n") + 1,
                file_path=file_path,
            ))

    return symbols


def parse_file(file_path: str, content: str) -> List[dict]:
    lower = file_path.lower()
    if lower.endswith(".py"):
        symbols = parse_python(file_path, content)
    elif lower.endswith((".js", ".jsx", ".ts", ".tsx")):
        symbols = _parse_js_ts(file_path, content)
    else:
        return []
    return [s.to_dict() for s in symbols]
