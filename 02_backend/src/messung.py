"""Gemeinsamer Rahmen für urteilsgestützte Messläufe.

Mehrere Arme über dieselben Fälle, Fortschrittsanzeige, Vergleich gegen einen Ausgangswert,
eine Protokollzeile je Arm. Die Einstellung jedes Arms wird mitgeschrieben, nicht nur benutzt.

Was er nicht abnimmt: zu prüfen, ob die Einstellung zu den Daten passt.

    from messung import lauf, urteil_holen
"""
import json
import os
import subprocess
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from bmds_prompt_loader import PromptLoader
from bmds_prompt_security import sanitize_and_wrap

from judge_antwort import json_aus
from llm import chat
from config import BASE, JUDGE_MODEL, JUDGE_FALLBACKS

loader = PromptLoader(Path(BASE) / "prompts", lang="de")

PROTOKOLL = Path(BASE) / ".data" / "messungen.jsonl"

# Streuung des Urteilsverfahrens in Prozentpunkten, an zwei Läufen derselben Einstellung
# bestimmt. Unterschiede darunter sind nicht deutbar.
URTEIL_STREUUNG = 4

# Streuung der Goldanker-Messungen. Sie kommt vom Reranking, das ein Modellaufruf ist.
GOLD_STREUUNG = 3


def commit():
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True,
                              text=True, cwd=BASE).stdout.strip() or "?"
    except OSError:
        return "?"


def protokollieren(name, arm, einstellung, zahlen):
    """Eine Zeile je Arm nach `.data/messungen.jsonl`."""
    PROTOKOLL.parent.mkdir(parents=True, exist_ok=True)
    with open(PROTOKOLL, "a", encoding="utf-8") as f:
        f.write(json.dumps({
            "zeit": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
            "commit": commit(),
            "messung": name,
            "arm": arm,
            "einstellung": einstellung,
            **zahlen,
        }, ensure_ascii=False) + "\n")


def urteil_holen(prompt_id, stelle, **variablen):
    """Ein Urteil des JUDGE_MODEL. Ergibt (urteil, begruendung).

    Bewusst ein anderes Modell als das vorschlagende — ein Modell beurteilt die eigene
    Ausgabe milder.
    """
    p = loader.load(prompt_id, stelle=sanitize_and_wrap(
        str(stelle), tag_name="stelle", max_length=6000).wrapped_content, **variablen)
    antwort = chat([{"role": "system", "content": p.system},
                    {"role": "user", "content": p.user}],
                   model=JUDGE_MODEL, temperature=0, fallbacks=JUDGE_FALLBACKS)
    d = json_aus(antwort) or {}
    return d.get("urteil"), d.get("begruendung", "")


def lauf(name, faelle, arme, je_fall, ausgangswert=None, urteile_nach=None):
    """Mehrere Arme über dieselben Fälle, mit Fortschritt, Protokoll und Vergleich.

    `arme`: [(titel, einstellung-dict)] — die Einstellung wird mitgeschrieben, nicht nur benutzt.
    `je_fall`: (fall, einstellung) -> Liste von Urteilen, jedes {"urteil", "warum", ...}.
    `ausgangswert`: Prozentwert, gegen den verglichen wird.
    `urteile_nach`: Pfad für die Rohurteile samt Begründung — nötig, um ein Ergebnis zu
        erklären statt nur zu berichten.
    """
    print(f"MESSUNG {name} — {len(faelle)} Fälle, {len(arme)} Arme (Commit {commit()})")
    if ausgangswert is not None:
        print(f"Ausgangswert: {ausgangswert} % · Streuung des Verfahrens: ±{URTEIL_STREUUNG}")
    print(flush=True)

    alle, ergebnisse = [], {}
    for titel, einstellung in arme:
        z, t0 = Counter(), time.monotonic()
        for i, fall in enumerate(faelle, 1):
            for u in je_fall(fall, einstellung):
                z[u.get("urteil")] += 1
                alle.append({"messung": name, "arm": titel, **u})
            if i % 5 == 0 or i == len(faelle):
                print(f"  [{titel}] {i}/{len(faelle)} — {round(time.monotonic()-t0)}s", flush=True)
        g = sum(z.values()) or 1
        zahlen = {
            "stellen": g,
            "traegt": z["traegt"],
            "teilweise": z["teilweise"],
            "traegt_nicht": z["traegt_nicht"],
            "brauchbar_prozent": round(100 * (z["traegt"] + z["teilweise"]) / g),
            "tragend_prozent": round(100 * z["traegt"] / g),
        }
        ergebnisse[titel] = zahlen
        protokollieren(name, titel, einstellung, zahlen)
        print(f"\n{titel}  ({einstellung})")
        print(f"  {z['traegt']} trägt · {z['teilweise']} teilweise · {z['traegt_nicht']} trägt nicht"
              f"  ({g} Stellen)")
        print(f"  brauchbar {zahlen['brauchbar_prozent']} % · "
              f"voll tragend {zahlen['tragend_prozent']} %\n", flush=True)

    if urteile_nach:
        Path(urteile_nach).write_text(json.dumps(alle, ensure_ascii=False, indent=1),
                                      encoding="utf-8")
        print(f"{len(alle)} Urteile in {urteile_nach}\n")

    if ausgangswert is not None and ergebnisse:
        print("Gegen den Ausgangswert:")
        for titel, z in ergebnisse.items():
            d = z["brauchbar_prozent"] - ausgangswert
            urteil = "unterhalb der Streuung" if abs(d) <= URTEIL_STREUUNG else (
                "besser" if d > 0 else "schlechter")
            print(f"  {titel}: {d:+d} Punkte — {urteil}")
    return ergebnisse
