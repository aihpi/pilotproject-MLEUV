"""Trägt die angegebene Stelle den Wert wirklich? — die letzte große Messlücke.

`eval.py` misst, ob die richtige Stelle gefunden wird. `eval_feld.py` misst, ob der richtige
Wert im richtigen Feld landet. Beide sagen nichts darüber, ob die Stelle, die unter einem
Wert steht, ihn auch STÜTZT.

Bis zum 24.09.2026 wurde nur zeichengenau nachgeprüft, ob ein Zitat wörtlich in der Quelle
steht. Am selben Tag stand unter „Auszahlungsverfahren: Erstattungsprinzip" die Deckung „Der
Fördersatz beträgt 90 Prozent, als Anteilfinanzierung in Form eines Zuschusses" — ein echtes
Zitat, das über Vorschuss oder Erstattung nichts sagt. Ein ungedeckter Wert, der sich als
gedeckt ausgibt, entgeht auch dem aufmerksamen Gegenlesen.

    python src/eval_deckung.py
    python src/eval_deckung.py --fall F-07-baustein5-vollstaendig

ZWEI SORTEN STELLEN, getrennt gemessen, weil sie Verschiedenes versprechen:

- DECKUNG  — eine Stelle der EINGABE, die den Wert trägt. Sie ist das stärkere Versprechen:
             die Oberfläche schreibt „durch Ihre Angabe gedeckt".
- BELEG    — eine Stelle aus dem KORPUS. Sie verankert den Vorschlag, beweist ihn aber nicht;
             die Oberfläche sagt das auch. Trotzdem soll sie zur Sache gehören.

Das bewertende Modell ist ein anderes als das vorschlagende (JUDGE_MODEL). Ein Modell
beurteilt die eigene Ausgabe milder — und es muss hier kein Recht können, es vergleicht nur
zwei Texte, die beide vor ihm liegen.
"""
import argparse
import collections
from pathlib import Path

from bmds_prompt_loader import PromptLoader
from bmds_prompt_security import sanitize_and_wrap

import vorschlag
from eval_feld import laden
from judge_antwort import json_aus
from llm import chat
from config import BASE, JUDGE_MODEL, JUDGE_FALLBACKS

loader = PromptLoader(Path(BASE) / "prompts", lang="de")


def beurteilen(feld, wert, stelle):
    """Ein Urteil über eine einzelne Stelle. Ergibt (urteil, begruendung, modell)."""
    prompt = loader.load(
        "deckung_pruefen",
        feld=feld,
        wert=str(wert),
        # Fremdtext im Prompt, wie überall: die Stelle stammt aus einem Dokument oder aus
        # der Eingabe der Bearbeiterin, nicht von uns.
        stelle=sanitize_and_wrap(str(stelle), tag_name="stelle",
                                 max_length=8000).wrapped_content,
    )
    text, modell = chat(
        [{"role": "system", "content": prompt.system},
         {"role": "user", "content": prompt.user}],
        model=JUDGE_MODEL, temperature=0, fallbacks=JUDGE_FALLBACKS, mit_modell=True)
    daten = json_aus(text)
    return daten.get("urteil"), daten.get("begruendung", ""), modell


def lauf(faelle, felder_def, nur=None):
    zaehler = collections.Counter()
    schlecht = []
    modelle = set()

    for fall in faelle:
        if nur and fall["id"] != nur:
            continue
        felder = [felder_def[i] for i in fall["felder"]]
        vorschlaege, _ = vorschlag.vorschlagen(
            fall["abschnitt_nr"], fall["eingabe"].strip(), felder,
            entschieden=[{"label": felder_def[i].get("label") or i, "wert": w}
                         for i, w in (fall.get("bestaetigt") or {}).items()] or None,
            regelfall=bool(fall.get("regelfall")))

        for v in vorschlaege:
            if v.get("status") != "suggested":
                continue
            for art, stelle in (("Deckung", v.get("deckung")),
                                ("Beleg", v.get("belegzitat"))):
                if not stelle:
                    continue
                urteil, warum, modell = beurteilen(v["label"], v["wert"], stelle)
                modelle.add(modell)
                zaehler[(art, urteil)] += 1
                if urteil == "traegt_nicht":
                    schlecht.append((fall["id"], art, v["feld"], str(v["wert"])[:40],
                                     str(stelle)[:90], warum))

    print()
    for art in ("Deckung", "Beleg"):
        gesamt = sum(n for (a, _), n in zaehler.items() if a == art)
        if not gesamt:
            continue
        traegt = zaehler[(art, "traegt")]
        teils = zaehler[(art, "teilweise")]
        nicht = zaehler[(art, "traegt_nicht")]
        print(f"{art}: {traegt} trägt · {teils} teilweise · {nicht} trägt nicht "
              f"({round(100 * traegt / gesamt)} % tragend, {gesamt} geprüft)")

    if schlecht:
        print(f"\n{len(schlecht)} Stellen, die den Wert NICHT tragen:")
        for fall, art, feld, wert, stelle, warum in schlecht:
            print(f"  {fall} · {art} · {feld} = {wert}")
            print(f"      Stelle: {stelle}")
            print(f"      Urteil: {warum}")

    print(f"\nBewertendes Modell: {', '.join(sorted(modelle)) or '—'}")
    print("Gemessen wird, ob die Stelle den Wert stützt — nicht, ob der Wert fachlich "
          "richtig ist. Das ist eine andere Frage und braucht einen Menschen.")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--fall", help="nur diesen Fall prüfen")
    a = p.parse_args()
    felder_def, faelle = laden()
    lauf(faelle, felder_def, nur=a.fall)


if __name__ == "__main__":
    main()
