# Vector Store using Supabase pgvector - NO LOCAL FALLBACK
from typing import List, Dict, Optional
from app.config import settings


class SupabaseVectorStore:
    """Supabase vector store using pgvector."""

    def __init__(self, url: str, key: str):
        from supabase import create_client
        self.client = create_client(url, key)
        self._embedding_model = None
        print("VectorStore: Connected to Supabase pgvector")

    @property
    def embedding_model(self):
        """Lazy load embedding model."""
        if self._embedding_model is None:
            from sentence_transformers import SentenceTransformer
            self._embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        return self._embedding_model

    async def add_documents(
        self,
        collection_name: str,
        documents: List[str],
        metadatas: Optional[List[Dict]] = None,
        ids: Optional[List[str]] = None,
    ) -> None:
        """Add documents to Supabase with embeddings."""
        if not documents:
            return

        # Generate IDs if not provided
        if ids is None:
            ids = [f"doc_{i}" for i in range(len(documents))]

        # Generate embeddings
        embeddings = self.embedding_model.encode(documents).tolist()

        # Prepare records
        records = []
        for i, doc in enumerate(documents):
            records.append({
                "id": ids[i],
                "collection": collection_name,
                "content": doc,
                "embedding": embeddings[i],
                "metadata": metadatas[i] if metadatas else {},
            })

        # Upsert to Supabase
        self.client.table("documents").upsert(records).execute()

    async def search(
        self,
        collection_name: str,
        query: str,
        n_results: int = 10,
        where: Optional[Dict] = None,
    ) -> List[Dict]:
        """Search using pgvector similarity."""
        # Generate query embedding
        query_embedding = self.embedding_model.encode([query])[0].tolist()

        # Call Supabase RPC function for vector search
        response = self.client.rpc(
            "match_documents",
            {
                "query_embedding": query_embedding,
                "match_count": n_results,
                "filter_collection": collection_name,
            }
        ).execute()

        formatted = []
        for item in response.data:
            formatted.append({
                "id": item["id"],
                "document": item["content"],
                "metadata": item.get("metadata", {}),
                "distance": 1 - item.get("similarity", 0),
            })

        return formatted

    async def delete_collection(self, collection_name: str) -> None:
        """Delete all documents in a collection."""
        self.client.table("documents").delete().eq("collection", collection_name).execute()

    async def clear_collection(self, collection_name: str) -> None:
        """Clear all documents from a collection."""
        await self.delete_collection(collection_name)


def create_vector_store() -> SupabaseVectorStore:
    """Create Supabase vector store. Raises error if not configured."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_SECRET_KEY:
        raise RuntimeError(
            "Supabase not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env"
        )

    if settings.SUPABASE_URL == "your-supabase-url-here":
        raise RuntimeError(
            "Supabase URL not set. Update SUPABASE_URL in .env with your actual URL"
        )

    if settings.SUPABASE_SECRET_KEY == "your-sb-secret-key-here":
        raise RuntimeError(
            "Supabase secret key not set. Update SUPABASE_SECRET_KEY in .env"
        )

    return SupabaseVectorStore(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)


vector_store = create_vector_store()
