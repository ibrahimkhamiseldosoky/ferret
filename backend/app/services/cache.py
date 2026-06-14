import logging
import time
from collections import OrderedDict

logger = logging.getLogger(__name__)


class QueryCache:
    def __init__(self, max_entries: int = 200, default_ttl: int = 300):
        self._cache: OrderedDict[str, tuple[float, object]] = OrderedDict()
        self._max = max_entries
        self._ttl = default_ttl

    def _make_key(self, repo_id: str, func: str, *args) -> str:
        return f"{repo_id}:{func}:{':'.join(str(a) for a in args)}"

    def get(self, repo_id: str, func: str, *args) -> object | None:
        key = self._make_key(repo_id, func, *args)
        entry = self._cache.get(key)
        if entry is None:
            return None
        ts, val = entry
        if time.time() - ts > self._ttl:
            del self._cache[key]
            return None
        self._cache.move_to_end(key)
        return val

    def set(self, repo_id: str, func: str, value: object, *args) -> None:
        key = self._make_key(repo_id, func, *args)
        self._cache[key] = (time.time(), value)
        self._cache.move_to_end(key)
        if len(self._cache) > self._max:
            self._cache.popitem(last=False)
        logger.debug("Cache SET %s (size=%d)", key, len(self._cache))

    def invalidate_repo(self, repo_id: str) -> None:
        before = len(self._cache)
        keys = [k for k in self._cache if k.startswith(f"{repo_id}:")]
        for k in keys:
            del self._cache[k]
        after = len(self._cache)
        if before != after:
            logger.info("Cache invalidated for repo %s (removed %d entries)", repo_id, before - after)

    def clear(self) -> None:
        self._cache.clear()
        logger.info("Cache cleared entirely")


cache = QueryCache(max_entries=200, default_ttl=300)
