"""RAG-Abruf: Hybrid-Retrieval -> Parent-Kontext -> Governance-Prompt -> LLM.

Governance (Spark): versionierter Prompt aus prompts/de/rag_system.yaml (bmds_prompt_loader,
Audit-Hash pro Call); Kontext via bmds_prompt_security gekapselt/entschärft.
Parent/Sub: gefunden wird per Sub-Chunk, ans LLM geht der (deduplizierte) Eltern-Chunk.
"""
import sys
from pathlib import Path

from bmds_prompt_loader import PromptLoader
from bmds_prompt_security import sanitize_and_wrap

from retrieval import hybrid_search
from llm import chat
from config import BASE

loader = PromptLoader(Path(BASE) / "prompts", lang="de")


def fundstelle(p):
    seiten = p.get("seiten") or []
    s = f", S. {', '.join(map(str, seiten))}" if seiten else ""
    return f"{p.get('quelle')}{s} | {p.get('abschnitt')}"


def main():
    query = " ".join(sys.argv[1:]).strip() or "Welche Angaben gehören in den Zuwendungszweck?"
    hits = hybrid_search(query)

    seen, bloecke = set(), []
    for h in hits:
        pid = h.payload.get("parent_id")
        if pid in seen:
            continue
        seen.add(pid)
        text = h.payload.get("parent_text") or h.payload.get("text")
        bloecke.append(f"[{fundstelle(h.payload)}]\n{text}")
    kontext = "\n\n".join(bloecke)

    sicher = sanitize_and_wrap(kontext, tag_name="kontext", max_length=50000).wrapped_content
    prompt = loader.load("rag_system", kontext=sicher, frage=query)

    print("Frage:", query)
    print(f"[prompt {prompt.meta.id} | {prompt.meta.content_hash[:23]}…]")  # Audit-Nachweis
    antwort = chat([
        {"role": "system", "content": prompt.system},
        {"role": "user", "content": prompt.user},
    ])
    print("\nAntwort:\n", antwort)
    print("\nGenutzte Fundstellen:")
    for h in hits:
        print(" -", fundstelle(h.payload))


if __name__ == "__main__":
    main()
