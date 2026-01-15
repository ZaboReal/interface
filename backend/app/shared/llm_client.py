# LLM Client using OpenAI and Langchain
from typing import Optional, List
import re
from app.config import settings


class SimpleTextSplitter:
    """Simple text splitter that doesn't require spacy."""

    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split_text(self, text: str) -> List[str]:
        """Split text into overlapping chunks."""
        # Split by paragraphs first
        paragraphs = re.split(r'\n\s*\n', text)

        chunks = []
        current_chunk = ""

        for para in paragraphs:
            if len(current_chunk) + len(para) <= self.chunk_size:
                current_chunk += para + "\n\n"
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                # Start new chunk with overlap from previous
                if chunks and self.chunk_overlap > 0:
                    overlap_text = current_chunk[-self.chunk_overlap:] if len(current_chunk) > self.chunk_overlap else current_chunk
                    current_chunk = overlap_text + para + "\n\n"
                else:
                    current_chunk = para + "\n\n"

        if current_chunk.strip():
            chunks.append(current_chunk.strip())

        # If no chunks created, split by size
        if not chunks:
            for i in range(0, len(text), self.chunk_size - self.chunk_overlap):
                chunks.append(text[i:i + self.chunk_size])

        return chunks


class LLMClient:
    """Client for LLM API calls using OpenAI via Langchain."""

    def __init__(self):
        self.openai_client = None
        self.embeddings = None
        self.text_splitter = SimpleTextSplitter(chunk_size=1000, chunk_overlap=200)
        self._initialized = False

    def _lazy_init(self):
        """Lazy initialization of Langchain components."""
        if self._initialized:
            return

        if settings.OPENAI_API_KEY and settings.OPENAI_API_KEY != "your-openai-api-key-here":
            try:
                from langchain_openai import ChatOpenAI, OpenAIEmbeddings

                self.openai_client = ChatOpenAI(
                    api_key=settings.OPENAI_API_KEY,
                    model="gpt-5-nano",
                )
                self.embeddings = OpenAIEmbeddings(
                    api_key=settings.OPENAI_API_KEY,
                )
            except ImportError as e:
                print(f"Langchain not available, using fallback: {e}")

        self._initialized = True

    async def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> str:
        """Generate text using OpenAI via Langchain."""
        self._lazy_init()

        if not self.openai_client:
            raise ValueError("No LLM API key configured. Please set OPENAI_API_KEY in .env")

        from langchain_core.messages import HumanMessage, SystemMessage

        messages = []
        if system:
            messages.append(SystemMessage(content=system))
        else:
            messages.append(SystemMessage(content="You are a helpful regulatory compliance assistant."))
        messages.append(HumanMessage(content=prompt))

        # Use ainvoke for true async parallel execution
        response = await self.openai_client.ainvoke(messages)
        return response.content

    async def answer_question(
        self,
        question: str,
        context_docs: List[str],
    ) -> str:
        """Answer a question based on context documents using QA chain."""
        self._lazy_init()

        if not self.openai_client:
            raise ValueError("No LLM API key configured. Please set OPENAI_API_KEY in .env")

        from langchain_core.documents import Document
        from langchain.chains.question_answering import load_qa_chain

        # Convert to Langchain documents
        docs = [Document(page_content=text) for text in context_docs]

        # Load QA chain
        qa_chain = load_qa_chain(self.openai_client, chain_type="stuff")

        # Run QA
        result = qa_chain.invoke({"input_documents": docs, "question": question})
        return result["output_text"]

    def split_text(self, text: str) -> List[str]:
        """Split text into chunks for processing."""
        return self.text_splitter.split_text(text)

    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Get embeddings for texts using OpenAI."""
        self._lazy_init()
        if self.embeddings:
            return self.embeddings.embed_documents(texts)
        return []

    def get_embedding(self, text: str) -> List[float]:
        """Get embedding for a single text."""
        self._lazy_init()
        if self.embeddings:
            return self.embeddings.embed_query(text)
        return []

    def is_configured(self) -> bool:
        """Check if LLM client is configured."""
        self._lazy_init()
        return self.openai_client is not None


llm_client = LLMClient()
