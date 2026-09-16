"""Regeldokumentationen aus dem Prozessmodell ziehen — die Quelle der Prüflogik.

Die fachlichen Regeln stehen nicht im Diagramm, sondern in den Dokumentationen der
Elemente: 60 Notizen an Aufgaben, Verzweigungen und Sequenzflüssen, jede mit Rechtsstelle,
Schwellenwert und Folge. Sie sind die Begründung hinter jeder Verzweigung, und ohne sie ist
das Modell nur ein Bild.

Aus der BPMN und nicht aus dem PDF-Standardreport: derselbe Inhalt, aber ohne docling-Runde
und damit in Sekunden statt Minuten. Der Report hat mir nur aufgedeckt, dass mein erster
Auszug aus der BPMN bei 520 Zeichen abgeschnitten war und dadurch die Unterabschnitte
fehlten — die Datei selbst hatte sie die ganze Zeit.

Zwei Ausgaben, getrennt nach Vertraulichkeit:

- `regeln_roh_lokal.yaml` (nicht im Repo) trägt den Wortlaut der Dokumentationen. Er stammt
  aus einem Dokument des vertraulichen Ordners.
- Daraus kuratiere ich von Hand `regeln.yaml` mit der destillierten Regel: Rechtsstelle,
  Schwellenwert, Zielfeld, Schweregrad. Das ist öffentliches Recht und darf mit.

    python src/regeln.py --bpmn "<Pfad zum Prozessmodell>"
    python src/regeln.py --bpmn … --nur Bagatell      # filtern, zum Nachsehen
"""
import argparse
import os
import re
import xml.etree.ElementTree as ET

import yaml

from config import BASE

ZIEL = os.path.join(BASE, "regeln_roh_lokal.yaml")

# Rechtsstellen, wie sie in den Dokumentationen auftauchen. Die Reihenfolge ist die der
# Genauigkeit: „Ziff. 2.2.1 der VV zu § 44 LHO" soll nicht als bloßes „§ 44 LHO" enden.
_STELLE = re.compile(
    r"(Ziff(?:er)?\.?\s*[\d.]+\s*(?:und\s*[\d.]+\s*)?(?:der\s+)?VV\s+zu\s+§\s*44\s+LHO"
    r"|Anlage\s+\d+\s+zu\s+VV\s+Nr\.\s*[\d.]+"
    r"|Art(?:ikel)?\.?\s*\d+[a-z]?\s+(?:Abs\.\s*\d+\s+)?[A-ZÄÖÜ][\w-]*"
    r"|§§?\s*\d+[a-z]?(?:\s+und\s+\d+)?\s+LHO)")

# Abschnittsüberschrift: eine kurze Wendung mit Doppelpunkt am Zeilenanfang — „Beachte:",
# „Bei Abweichung:", „Aufnahme in Richtlinie:", „Auswirkungen auf spätere Verfahren:".
#
# Der Inhalt steht mal darunter, mal in derselben Zeile dahinter; im Prozessmodell sogar
# überwiegend dahinter. Ein Muster, das nur die alleinstehende Zeile erkennt, fand deshalb
# nur 7 von 60 Gliederungen — der Rest landete unsortiert in der Einleitung.
#
# Höchstens sechs Wörter vor dem Doppelpunkt, damit kein normaler Satz mit Doppelpunkt
# fälschlich als Überschrift gilt.
_UEBERSCHRIFT = re.compile(r"^([A-ZÄÖÜ][\wÄÖÜäöüß\s\-/().§]{2,55}?):\s*(.*)$")


def _ist_ueberschrift(zeile):
    m = _UEBERSCHRIFT.match(zeile)
    if not m or len(m.group(1).split()) > 6:
        return None
    return m.group(1).strip().lower(), m.group(2).strip()

# Geldbeträge und Prozentsätze — die Schwellenwerte, um die es geht.
_BETRAG = re.compile(r"(\d[\d.]*(?:,\d+)?)\s*(?:€|Euro)")
_PROZENT = re.compile(r"(\d{1,3})\s*(?:%|Prozent|vom Hundert)")


def _text(roh):
    """Geschützte Leerzeichen und Leerabsätze entfernen, Zeilen erhalten."""
    zeilen = [z.replace("\xa0", " ").strip() for z in (roh or "").split("\n")]
    return [z for z in zeilen if z]


def gliedern(roh):
    """Dokumentation in {abschnitt: text} zerlegen. Vorspann steht unter `einleitung`."""
    teile, aktuell = {}, "einleitung"
    for zeile in _text(roh):
        kopf = _ist_ueberschrift(zeile)
        if kopf:
            aktuell, rest = kopf
            teile[aktuell] = (teile.get(aktuell, "") + " " + rest).strip()
            continue
        teile[aktuell] = (teile.get(aktuell, "") + " " + zeile).strip()
    return {k: v for k, v in teile.items() if v}


def lesen(pfad):
    """Alle Dokumentationen mit Element, Pool und Gliederung."""
    baum = ET.parse(pfad).getroot()
    kurz = lambda e: e.tag.split("}")[-1]

    prozessname = {p.get("id"): p.get("name") for p in baum.iter() if kurz(p) == "process"}
    pool = {}
    for p in [e for e in baum.iter() if kurz(e) == "process"]:
        for el in p.iter():
            if el.get("id"):
                pool[el.get("id")] = prozessname[p.get("id")]

    eintraege = []
    for el in baum.iter():
        for d in el:
            if kurz(d) != "documentation" or not (d.text or "").strip():
                continue
            abschnitte = gliedern(d.text)
            ganzer = " ".join(abschnitte.values())
            stellen = list(dict.fromkeys(m.group(1).strip() for m in _STELLE.finditer(ganzer)))
            eintraege.append({
                "element": el.get("name") or "(ohne Namen)",
                "art": kurz(el),
                "pool": pool.get(el.get("id")),
                "rechtsstellen": stellen or None,
                "betraege_eur": [b.replace(".", "") for b in _BETRAG.findall(ganzer)] or None,
                "prozente": _PROZENT.findall(ganzer) or None,
                "abschnitte": abschnitte,
            })
    return eintraege


def schreiben(eintraege, pfad=ZIEL):
    kopf = ("# Regeldokumentationen aus dem Prozessmodell — ERZEUGT, nicht von Hand pflegen.\n"
            "# Quelle: src/regeln.py. Nicht im Repo (siehe .gitignore): der Wortlaut stammt\n"
            "# aus einem Dokument der vertraulichen Ordner.\n"
            "#\n"
            "# Daraus wird von Hand die destillierte Regeltabelle kuratiert — nur\n"
            "# Rechtsstelle, Schwellenwert, Zielfeld und Schweregrad, also öffentliches Recht.\n\n")
    with open(pfad, "w", encoding="utf-8") as f:
        f.write(kopf)
        yaml.safe_dump({"regeln": eintraege}, f, allow_unicode=True, sort_keys=False,
                       default_flow_style=False, width=100)
    return pfad


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--bpmn", default=os.getenv("PROZESS_BPMN"),
                   help="Pfad zum Prozessmodell; Vorgabe PROZESS_BPMN aus .env")
    p.add_argument("--nur", help="nur Einträge, deren Element oder Text das enthält")
    p.add_argument("--trocken", action="store_true", help="nur zählen, nichts schreiben")
    args = p.parse_args()

    if not args.bpmn or not os.path.exists(args.bpmn):
        print("Kein Prozessmodell. Erwartet wird --bpmn oder PROZESS_BPMN in .env.\n"
              "Der Pfad steht bewusst nicht im Code: er liegt im vertraulichen Datenordner.")
        return

    eintraege = lesen(args.bpmn)
    if args.nur:
        nadel = args.nur.lower()
        eintraege = [e for e in eintraege
                     if nadel in e["element"].lower()
                     or nadel in " ".join(e["abschnitte"].values()).lower()]
        for e in eintraege:
            print(f"\n=== [{e['pool']}] {e['element']}")
            if e["rechtsstellen"]:
                print(f"    Rechtsstelle: {', '.join(e['rechtsstellen'])}")
            if e["betraege_eur"]:
                print(f"    Beträge: {', '.join(e['betraege_eur'])} EUR")
            if e["prozente"]:
                print(f"    Prozente: {', '.join(e['prozente'])}")
            for k, v in e["abschnitte"].items():
                print(f"    [{k}] {v[:220]}")
        return

    print(f"{len(eintraege)} Dokumentationen.\n")
    nach_pool = {}
    for e in eintraege:
        nach_pool.setdefault(e["pool"] or "(ohne Pool)", []).append(e)
    for pool, liste in sorted(nach_pool.items(), key=lambda x: -len(x[1])):
        mit_stelle = sum(1 for e in liste if e["rechtsstellen"])
        print(f"  {pool:22} {len(liste):3}  davon {mit_stelle:3} mit Rechtsstelle")

    abschnitte = {}
    for e in eintraege:
        for k in e["abschnitte"]:
            abschnitte[k] = abschnitte.get(k, 0) + 1
    print("\nGliederungsabschnitte:")
    for k, n in sorted(abschnitte.items(), key=lambda x: -x[1])[:12]:
        print(f"  {n:3}  {k}")

    if args.trocken:
        print("\nTrockenlauf, nichts geschrieben.")
        return
    print(f"\nGeschrieben: {schreiben(eintraege)}")


if __name__ == "__main__":
    main()
