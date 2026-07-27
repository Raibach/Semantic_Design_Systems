"""Milvus REST client — zero dependencies, zero threads, works on any Python.

Targets Zilliz Cloud (MILVUS_URI / MILVUS_TOKEN env vars).

FAIL-LOUD POLICY: this module never swallows connection errors. Callers get
the real exception (HTTP error, auth failure, timeout) so problems surface
immediately instead of degrading silently. The /api/health endpoint catches
and reports the real message; everywhere else, exceptions propagate.
"""
import urllib.request, json, os


class MilvusREST:
    def __init__(self):
        self.uri = os.getenv("MILVUS_URI", "")
        self.token = os.getenv("MILVUS_TOKEN", "")
        self.mode = os.getenv("MILVUS_MODE", "standalone")
        if not self.uri:
            raise RuntimeError(
                "MILVUS_URI is not set — Zilliz Cloud endpoint required "
                "(e.g. https://<cluster>.serverless.<region>.cloud.zilliz.com)"
            )

    def _req(self, path, data=None):
        url = f"{self.uri}{path}"
        body = json.dumps(data or {}).encode()
        req = urllib.request.Request(url, data=body, headers={
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        })
        resp = urllib.request.urlopen(req, timeout=10)
        return json.loads(resp.read())

    def list_collections(self):
        """All collection names in the cluster. Raises on failure."""
        r = self._req("/v2/vectordb/collections/list")
        return r.get("data", [])

    def describe_collection(self, name):
        """Full schema/index/load state for one collection. Raises on failure."""
        return self._req("/v2/vectordb/collections/describe", {"collectionName": name})

    def query(self, collection, expr="", output_fields=None, limit=50, offset=0):
        """Query entities from a collection (no vector search — metadata rows)."""
        r = self._req("/v2/vectordb/entities/query", {
            "collectionName": collection,
            "filter": expr,
            "outputFields": output_fields or ["*"],
            "limit": limit,
            "offset": offset,
        })
        return r.get("data", [])

    def connected(self):
        """True if the cluster answers. Raises the real error otherwise."""
        self.list_collections()
        return True


def get_milvus_client():
    """MilvusREST instance if the cluster answers, else None (error printed)."""
    try:
        c = MilvusREST()
        return c if c.connected() else None
    except Exception as e:
        print(f"[milvus_rest] Zilliz connection failed: {e}")
        return None