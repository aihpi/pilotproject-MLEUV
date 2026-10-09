"""Taugen die Fundstellen, die der Formular-Knopf liefert?

Für diesen Weg gibt es keine Gold-Fundstellen: Der Eval-Katalog kennt Fragen, keine Entwürfe
mit offenen Feldern. Bewertet wird deshalb jede gelieferte Stelle einzeln, von einem anderen
Modell als dem vorschlagenden (`fundstelle_tauglich`).

Die Fälle sind Momentaufnahmen echter Entwürfe: welcher Abschnitt, welche Felder noch offen,
welche Werte schon gesetzt. Format je Fall:

    {"abschnitt": 2, "felder": [...], "bedingungen": "...", "heute": "<Suchtext>",
     "profil": {"financingType": "share", ...}}

`profil` sind die bestätigten Werte des Entwurfs; ohne sie findet kein Profilabgleich statt.

    python src/eval_fundstellen.py --faelle <datei.json>
    python src/eval_fundstellen.py --faelle <datei.json> --arme ohne profil beide

Alle Arme laufen über dieselben Fälle im selben Lauf. Ein Wert aus einem früheren Lauf taugt
nicht zum Vergleich — zwischen den Läufen ändern sich Index und Einstellungen.
"""
import argparse
import json

import messung
import profilfilter
import vorschlag
from anfrage import suche
from rag_query import bloecke_bilden
from config import TOP_K

# Wie viele Stellen je Fall beurteilt werden. Entspricht dem, was die Oberfläche zeigt.
STELLEN_JE_FALL = 5

# Die vergleichbaren Einstellungen. Zwei Stufen, einzeln und zusammen — nur so ist zu sehen,
# ob eine von beiden allein schon trägt.
ARME = {
    "ohne": ("ohne Filter", {"abschnittsbindung": False, "profilabgleich": False}),
    "abschnitt": ("nur Abschnittsbindung", {"abschnittsbindung": True, "profilabgleich": False}),
    "profil": ("nur Profilabgleich", {"abschnittsbindung": False, "profilabgleich": True}),
    "beide": ("Abschnitt + Profil", {"abschnittsbindung": True, "profilabgleich": True}),
    "feld": ("Abschnitt + Profil + Feld", {"abschnittsbindung": True, "profilabgleich": True,
                                           "feldbindung": True}),
    # Dieselbe Einstellung, aber jede Stelle wird gegen IHR Feld beurteilt statt gegen alle
    # offenen Felder des Abschnitts. Die beiden Zahlen gehören zusammen: Die erste ist mit den
    # übrigen Armen vergleichbar, die zweite sagt, was die Bearbeiterin tatsächlich sieht.
    "feld-je-feld": ("Abschnitt + Profil + Feld (Urteil je Feld)",
                     {"abschnittsbindung": True, "profilabgleich": True,
                      "feldbindung": True, "urteil_je_feld": True}),
}


def stellen(fall, einstellung):
    nr = fall.get("abschnitt")
    gebunden = einstellung.get("abschnittsbindung") and 1 <= (nr or 0) <= 8
    nur_quellen = None
    if einstellung.get("profilabgleich"):
        quellen, _ = profilfilter.passende_quellen(fall.get("profil") or {})
        nur_quellen = sorted(quellen) or None

    if einstellung.get("feldbindung"):
        # Je Zielfeld eine eigene Anfrage, wie im Werkzeug. `belege_je_feld` setzt den
        # Feldnamen selbst vor den Kontext.
        felder = [{"id": f, "label": f} for f in fall["felder"]]
        bloecke, _ = vorschlag.belege_je_feld(
            felder, fall["bedingungen"], nr,
            nur_baustein=nr if gebunden else None, nur_quellen=nur_quellen)
        bloecke = bloecke[:STELLEN_JE_FALL]
    else:
        treffer = suche(fall["heute"], abschnitt_nr=nr, top_k=TOP_K,
                        nur_baustein=nr if gebunden else None, nur_quellen=nur_quellen)
        bloecke = bloecke_bilden(treffer)[:STELLEN_JE_FALL]

    urteile = []
    for b in bloecke:
        text = (b.get("kurz") or b.get("roh") or "")[:1200]
        # Gegen das eigene Feld oder gegen alle offenen — siehe `ARME`.
        feld = (b.get("feld_label") if einstellung.get("urteil_je_feld") and b.get("feld_label")
                else ", ".join(fall["felder"]))
        urteil, warum = messung.urteil_holen(
            "fundstelle_tauglich", text,
            feld=feld, bedingungen=fall["bedingungen"])
        urteile.append({
            "urteil": urteil,
            "feld": feld,
            "warum": warum,
            "abschnitt": nr,
            "quelle": (b["punkt"].payload or {}).get("quelle"),
            "nummer": (b["punkt"].payload or {}).get("nummer"),
            "baustein": (b["punkt"].payload or {}).get("baustein"),
        })
    return urteile


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--faelle", required=True, help="JSON-Datei mit den Fällen")
    p.add_argument("--arme", nargs="+", choices=sorted(ARME), default=["ohne", "abschnitt"])
    p.add_argument("--urteile", help="Pfad für die Rohurteile samt Begründung")
    a = p.parse_args()

    with open(a.faelle, encoding="utf-8") as f:
        faelle = json.load(f)

    arme = [(ARME[k][0], ARME[k][1]) for k in a.arme]

    messung.lauf("formular-fundstellen", faelle, arme, stellen, urteile_nach=a.urteile)


if __name__ == "__main__":
    main()
