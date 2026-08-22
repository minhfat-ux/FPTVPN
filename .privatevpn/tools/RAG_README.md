# Local RAG Helper

This repo has a lightweight offline RAG helper:

```bash
python3 .privatevpn/tools/rag_search.py --rebuild
python3 .privatevpn/tools/rag_search.py "exit node backend selection"
python3 .privatevpn/tools/rag_search.py "macOS Premium temporary unlock"
```

Implementation:

- SQLite FTS5 lexical/BM25 search.
- No external Python package required.
- Index DB: `.privatevpn/tmp/rag.sqlite` (gitignored).
- Excludes `.git`, `.tmp`, `secrets`, `node_modules`, build products, and Xcode
  generated project files.

Current machine state:

- `sqlite3` with FTS5 is available.
- `python3`, `numpy`, and `openai` Python package are available.
- `OPENAI_API_KEY` is not set.
- `ollama` is installed but has no local models pulled.
- Chroma, FAISS, LlamaIndex, LangChain, sentence-transformers, and sklearn are
  not installed.

If semantic RAG is needed later, either set `OPENAI_API_KEY` for embeddings or
pull an Ollama embedding model and add a vector index. For now this helper gives
fast local retrieval over code, docs, and memory without network or secrets.
