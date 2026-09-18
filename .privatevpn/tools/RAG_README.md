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

## Indexed release fact

The current Windows VPNFlow release is documented in `windows/README.md` and
`.privatevpn/memory/PROJECT_STATE.md`: commit `866ec9e`, Core tests **53/53
pass**, self-contained installer `windows/installer/out/VPNFlow-Setup-1.0.0.exe`,
SHA-256 `0f06c4b5729d153b7c240054d26d6bd8ec1a0a61ea1dd999735e8ee7842928b4`, with
bundled `wintun.dll` and `wireguard-go.exe`. The installer is for Windows test
use; real tunnel/UAC/route/DNS/adapter validation remains outstanding.

If semantic RAG is needed later, either set `OPENAI_API_KEY` for embeddings or
pull an Ollama embedding model and add a vector index. For now this helper gives
fast local retrieval over code, docs, and memory without network or secrets.
