"""Misst den Prüf-Modus: findet er, was fehlt — und meldet er nichts, was da ist?

Der Prüf-Modus war bis zum 24.09.2026 die größte weiße Fläche des Werkzeugs: gebaut,
getestet über Einheitstests mit erfundenen Texten, aber nie an einer echten Richtlinie
gemessen. Eine Prüfung, die niemand geprüft hat, ist eine Behauptung.

DAS VERFAHREN, und es kommt ohne Modell aus: eine echte Richtlinie aus dem Korpus wird
eingelesen, dann werden ihr gezielt Abschnitte entnommen. Was fehlt, weiß der Versuchsaufbau
— und damit gibt es einen Goldstandard ohne jede Handarbeit.

    python src/eval_pruefmodus.py
    python src/eval_pruefmodus.py --datei "<Teil eines Dateinamens>"

ZWEI FEHLERARTEN, beide zählen:

- ÜBERSEHEN: ein entnommener Abschnitt wird nicht gemeldet. Die Bearbeiterin hält einen
  unvollständigen Entwurf für vollständig — der teurere der beiden Fehler.
- FEHLALARM: ein vorhandener Abschnitt wird als fehlend gemeldet. Wer zwei Fehlalarme
  gesehen hat, liest den dritten Befund nicht mehr.

Der Holdout spielt hier keine Rolle: geprüft wird ein hochgeladenes Dokument gegen die
Musterstruktur, nicht gegen den Index. Eine Richtlinie im Holdout ist trotzdem die bessere
Wahl — sie ist dann auch für die andere Messrichtung sauber.
"""
import argparse
import os
import re

import pruefmodus
from config import CORPUS_DIR

# Welche Abschnitte einzeln entnommen werden.
#
# Die Bausteine mit eigenem Regelungsgehalt. 0 (Titel) und die Schlussformel bleiben außen
# vor: sie tragen keine Nummer und würden die Abschnittserkennung selbst verändern.
ENTNEHMEN = [2, 3, 4, 5, 6, 7]


def datei_finden(name=None):
    """Eine Richtlinie im Korpus finden. Ohne Namen die erste, die sich lesen lässt."""
    for wurzel, _, dateien in os.walk(CORPUS_DIR):
        for d in sorted(dateien):
            if not d.lower().endswith(".pdf"):
                continue
            if name and name.lower() not in d.lower():
                continue
            return os.path.join(wurzel, d)
    return None


def abschnitt_entfernen(text, nr):
    """Einen Abschnitt herausschneiden, wie ihn `abschnitte_finden` sieht.

    Geschnitten wird von seiner Überschrift bis zur nächsten — dadurch verschwindet der
    Abschnitt vollständig, und die Nummerierung bekommt eine Lücke. Genau so sieht ein
    Entwurf aus, in dem jemand einen Baustein vergessen hat.
    """
    gefunden = pruefmodus.abschnitte_finden(text)
    if nr not in gefunden:
        return None
    # Über die Überschriftenpositionen, nicht über den Text: derselbe Wortlaut kann mehrfach
    # vorkommen, die Stelle nicht.
    treffer = [(int(m.group(1)), m.start(), m.end())
               for m in pruefmodus._UEBERSCHRIFT.finditer(text)]
    erwartet, echte = 1, []
    for n, start, ende in treffer:
        if n == erwartet:
            echte.append((n, start, ende))
            erwartet += 1
    for i, (n, start, _) in enumerate(echte):
        if n != nr:
            continue
        schluss = echte[i + 1][1] if i + 1 < len(echte) else len(text)
        return text[:start] + text[schluss:]
    return None


def lauf(pfad):
    text = pruefmodus.text_lesen(pfad)
    vollstaendig = pruefmodus.abschnitte_finden(text)
    print(f"Datei: {os.path.basename(pfad)}")
    print(f"Erkannte Abschnitte im Original: {sorted(vollstaendig)}")

    # Erst der Grundfall: das unveränderte Dokument. Was hier gemeldet wird, ist entweder ein
    # echter Mangel der Richtlinie oder ein Fehlalarm — beides muss man kennen, bevor man die
    # entnommenen Fälle bewertet.
    grund = {b["baustein"] for b in pruefmodus.vollstaendigkeit(vollstaendig)
             if b["art"] == "baustein_fehlt"}
    print(f"Ohne Eingriff als fehlend gemeldet: {sorted(grund) or 'nichts'}")
    print()

    erkannt, uebersehen, fehlalarm = 0, [], []
    for nr in ENTNEHMEN:
        if nr not in vollstaendig:
            continue
        gekuerzt = abschnitt_entfernen(text, nr)
        if gekuerzt is None:
            continue
        rest = pruefmodus.abschnitte_finden(gekuerzt)
        fehlend = {b["baustein"] for b in pruefmodus.vollstaendigkeit(rest)
                   if b["art"] == "baustein_fehlt"}
        # Nur die NEUEN Meldungen zählen: was schon ohne Eingriff fehlte, ist kein Verdienst.
        neu = fehlend - grund
        if nr in neu:
            erkannt += 1
            zeichen = "✓"
        else:
            uebersehen.append(nr)
            zeichen = "✗"
        ueberzaehlig = sorted(neu - {nr})
        if ueberzaehlig:
            fehlalarm.append((nr, ueberzaehlig))
        print(f"  {zeichen} Baustein {nr} entnommen — gemeldet: {sorted(neu) or 'nichts'}")

    gesamt = erkannt + len(uebersehen)
    print()
    print(f"{erkannt}/{gesamt} entnommene Bausteine erkannt"
          f" ({round(100 * erkannt / gesamt) if gesamt else 0} %)")
    if uebersehen:
        print(f"ÜBERSEHEN: {uebersehen} — ein unvollständiger Entwurf gilt als vollständig.")
    if fehlalarm:
        print("FEHLALARM: zusätzlich gemeldet, obwohl vorhanden:")
        for nr, extra in fehlalarm:
            print(f"  beim Entfernen von {nr}: {extra}")
    print()
    print("Gemessen wird die Vollständigkeit auf Bausteinebene, nicht die Güte der "
          "Gliederungshinweise — die sind Wortvergleiche und ausdrücklich keine "
          "Feststellungen.")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--datei", help="Teil des Dateinamens einer Richtlinie im Korpus")
    a = p.parse_args()
    pfad = datei_finden(a.datei)
    if not pfad:
        raise SystemExit(f"Keine Richtlinie gefunden (Suche: {a.datei or 'beliebig'})")
    lauf(pfad)


if __name__ == "__main__":
    main()
