"""
Quick Milvus Setup Verification
Checks if Milvus is properly configured and collections exist
"""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.milvus_client import get_milvus_client
from config.milvus_config import get_all_collections, MILVUS_MODE, MILVUS_URI


def verify_setup():
    """Verify Milvus setup and collections"""
    print("=" * 80)
    print("🔍 MILVUS SETUP VERIFICATION")
    print("=" * 80)
    
    print(f"\nConfiguration:")
    print(f"  Mode: {MILVUS_MODE}")
    print(f"  URI: {MILVUS_URI}")
    
    try:
        print("\n📦 Connecting to Milvus...")
        milvus_client = get_milvus_client()
        print("✅ Connected successfully")
        
        print("\n📊 Collection Status:")
        collections = get_all_collections()
        all_exist = True
        
        for collection_name in collections:
            try:
                stats = milvus_client.get_collection_stats(collection_name)
                row_count = stats.get('row_count', 0)
                status = "✅" if row_count >= 0 else "⚠️"
                print(f"  {status} {collection_name}: {row_count} vectors")
                if row_count < 0:
                    all_exist = False
            except Exception as e:
                print(f"  ❌ {collection_name}: Error - {e}")
                all_exist = False
        
        if all_exist:
            print("\n✅ All collections exist and are accessible")
        else:
            print("\n⚠️ Some collections may need to be created")
        
        print("\n✅ Milvus setup verification complete!")
        return True
        
    except Exception as e:
        print(f"\n❌ Milvus setup verification failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = verify_setup()
    sys.exit(0 if success else 1)

