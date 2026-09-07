"""RAG-Abruf: Hybrid-Retrieval -> Parent-Kontext -> Satzfilter -> Governance-Prompt -> LLM.

Governance (Spark): versionierter Prompt aus prompts/de/*.yaml (bmds_prompt_loader,
Audit-Hash pro Call); Kontext via bmds_prompt_security gekapselt/entschärft.
Parent/Sub: gefunden wird per Sub-Chunk, ans LLM geht der (deduplizierte) Eltern-Chunk.

Satzfilter (Spark, modul-suche-und-zuordnung Stufe 2): ein Durchgang, zwei Wirkungen — der
Kontext wird auf die tragenden Sätze gekürzt UND jede Fundstelle bekommt ihren Wortlaut. Das
ist derselbe Bau wie bei Spark, wo das gefilterte Ergebnis gleichzeitig als Kontext an
`modul-bewertung` geht und als Fundstellen-Datensatz abgelegt wird. Neu ist nur, dass die
Satznummern erhalten bleiben; damit ist der Beleg ohne Modellaufruf prüfbar.

Abschaltbar über SATZFILTER=false — Messungen von vorher bleiben so vergleichbar.
"""
import sys
from pathlib import Path

from bmds_prompt_loader import PromptLoader
from bmds_prompt_security import sanitize_and_wrap

import satzfilter
from retrieval import hybrid_search
from llm import chat
from config import BASE, SATZFILTER

loader = PromptLoader(Path(BASE) / "prompts", lang="de")


def fundstelle(p):
    seiten = p.get("seiten") or []
    s = f", S. {', '.join(map(str, seiten))}" if seiten else ""
    return f"{p.get('quelle')}{s} | {p.get('abschnitt')}"


def bloecke_bilden(hits):
    """Ein Block je Eltern-Chunk, Duplikate weg. Kennung „0001" wie bei Spark (_assign_simple_ids):
    das Modell soll auf Blöcke zeigen können, ohne interne Kennungen zu sehen."""
    seen, bloecke = set(), []
    for h in hits:
        pid = h.payload.get("parent_id")
        if pid in seen:
            continue
        seen.add(pid)
        bloecke.append({
            "id": f"{len(bloecke) + 1:04d}",
            "fundstelle": fundstelle(h.payload),
            "roh": h.payload.get("parent_text") or h.payload.get("text") or "",
            "punkt": h,
        })
    return bloecke


def main():
    query = " ".join(sys.argv[1:]).strip() or "Welche Angaben gehören in den Zuwendungszweck?"
    hits = hybrid_search(query)
    bloecke = bloecke_bilden(hits)

    metas, verworfen = [], []
    if SATZFILTER and bloecke:
        bloecke, metas = satzfilter.filtern(query, bloecke)
        # Ein Block ohne gewählten Satz ist keine Fundstelle. Er fliegt aus dem Kontext UND aus
        # dem Nachweis — sonst führt die Liste Belegstellen, die nichts belegen. Die Zahl wird
        # gemeldet, damit die Kürzung sichtbar bleibt.
        leer = {b["id"] for b in bloecke if b["gefiltert"] and not b["indizes"]}
        verworfen = [b["fundstelle"] for b in bloecke if b["id"] in leer]
        bloecke = [b for b in bloecke if b["id"] not in leer]

    kontext = "\n\n".join(f"[{b['fundstelle']}]\n{b.get('kurz') or b['roh']}" for b in bloecke)
    sicher = sanitize_and_wrap(kontext, tag_name="kontext", max_length=50000).wrapped_content
    prompt = loader.load("rag_system", kontext=sicher, frage=query)

    print("Frage:", query)
    for meta in metas:  # Audit-Nachweis, ein Eintrag je Filterstapel
        print(f"[prompt {meta.id} | {meta.content_hash[:23]}…]")
    print(f"[prompt {prompt.meta.id} | {prompt.meta.content_hash[:23]}…]")
    antwort = chat([
        {"role": "system", "content": prompt.system},
        {"role": "user", "content": prompt.user},
    ])
    print("\nAntwort:\n", antwort)

    print("\nGenutzte Fundstellen:")
    if verworfen:
        print(f"  ({len(verworfen)} abgerufene Passage(n) vom Satzfilter verworfen: "
              f"{'; '.join(verworfen)})")
    for b in bloecke:
        print(f" - {b['fundstelle']}")
        if not b.get("gefiltert"):
            continue
        for nr, satz in satzfilter.belege(b):
            # Gegenprobe ohne Modellaufruf: steht der Satz wörtlich in der Quelle?
            marke = "" if satzfilter.beleg_pruefen(satz, b["punkt"].payload) else "  [NICHT BELEGT]"
            print(f"     Satz {nr}: „{satz}“{marke}")


if __name__ == "__main__":
    main()
