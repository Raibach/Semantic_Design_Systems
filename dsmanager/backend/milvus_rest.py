"""Milvus REST client — zero dependencies, zero threads, works on any Python."""
import urllib.request, json, os

class MilvusREST:
    def __init__(self):
        self.uri = os.getenv("MILVUS_URI", "")
        self.token = os.getenv("MILVUS_TOKEN", "")
        self.mode = os.getenv("MILVUS_MODE", "standalone")
    
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
        r = self._req("/v2/vectordb/collections/list")
        return r.get("data", [])
    
    def connected(self):
        try:
            self.list_collections()
            return True
        except:
            return False

def get_milvus_client():
    c = MilvusREST()
    return c if c.connected() else None
