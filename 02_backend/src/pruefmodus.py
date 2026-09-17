"""Prüf-Modus: einen fertigen Richtlinienentwurf gegen die Musterstruktur halten.

Phase 2 der Pilotprojekt-Vereinbarung, und der zweite Weg durch dasselbe Wissen: beim
Erstellen wird aus Angaben ein Text, beim Prüfen aus einem Text wieder Angaben. Deshalb
baut dieses Modul nichts nach, was es schon gibt — es zerlegt den Entwurf in Bausteine und
reicht jeden an `vorschlag.vorschlagen` weiter. Was dort herauskommt, sind Feldwerte, und
die kann die bestehende Prüflogik im Frontend beurteilen.

DREI STUFEN, absteigend nach Verlässlichkeit:

1. ZERLEGEN — welche Bausteine hat der Entwurf überhaupt? Ein Zeichenvergleich auf
   nummerierte Überschriften, kein Modell.
2. VOLLSTÄNDIGKEIT — fehlt ein Baustein, fehlt ein Gliederungspunkt der Musterrichtlinie?
   Ebenfalls ohne Modell. Das ist die „geschlossene Bezugsgröße", die § 2 der Vereinbarung
   verlangt.
3. FELDWERTE — was steht inhaltlich drin? Dafür das Modell, über den vorhandenen Weg.

Die Reihenfolge ist Absicht. Stufe 1 und 2 sind wiederholbar und kosten nichts; wer nur
wissen will, ob ein Entwurf vollständig ist, braucht Stufe 3 gar nicht.

    python src/pruefmodus.py --datei entwurf.pdf
    python src/pruefmodus.py --datei entwurf.pdf --inhalt    # mit Stufe 3
"""
import argparse
import os
import re
import unicodedata

import musterbausteine
import richtlinie

# Die acht Bausteine nach der Gliederung der Grundsätze für Förderrichtlinien (Anlage 19 zu
# VV Nr. 14.2.1 zu § 44 LHO). Öffentliches Recht, deshalb hier und nicht im lokalen Overlay.
BAUSTEINE = {
    1: "Zuwendungszweck, Rechtsgrundlage",
    2: "Gegenstand der Förderung",
    3: "Zuwendungsempfangende",
    4: "Zuwendungsvoraussetzungen",
    5: "Art und Umfang, Höhe der Zuwendung",
    6: "Sonstige Zuwendungsbestimmungen",
    7: "Verfahren",
    8: "Geltungsdauer",
}

# Eine Abschnittsüberschrift: Ziffer 1 bis 8 am Zeilenanfang, dann ein Titel. Der Punkt nach
# der Ziffer ist wahlweise — die Richtlinien im Korpus führen ihn mal so, mal so.
_UEBERSCHRIFT = re.compile(r"^[ \t]*([1-8])[.)]?[ \t]+([A-ZÄÖÜ][^\n]{3,90})$", re.M)


def _norm(s):
    s = unicodedata.normalize("NFKC", str(s or ""))
    return re.sub(r"\s+", " ", s.replace("­", "")).strip().lower()


def text_lesen(pfad):
    """Rohtext aus PDF oder DOCX. Ohne Layoutanalyse — für das Zerlegen reicht der Textlauf."""
    if pfad.lower().endswith(".pdf"):
        import pypdfium2
        doc = pypdfium2.PdfDocument(pfad)
        try:
            return "\n".join(doc[i].get_textpage().get_text_range() for i in range(len(doc)))
        finally:
            doc.close()
    if pfad.lower().endswith(".docx"):
        import docx
        return "\n".join(p.text for p in docx.Document(pfad).paragraphs)
    raise ValueError(f"Nur PDF und DOCX, nicht {os.path.splitext(pfad)[1]}")


def _aehnlich(a, b, schwelle=0.5):
    """Behandeln zwei Überschriften dieselbe Sache? Wortvergleich, tragende Wörter.

    Verglichen wird über den Wortanfang, nicht über Gleichheit: die Richtlinien im Korpus
    schreiben „Zuwendungsvoraussetzung" und „Zuwendungsvoraussetzungen", „Zuwendungsempfänger"
    und „Zuwendungsempfangende". Ein Vergleich auf Gleichheit fände davon nichts, und bei
    deutschen Komposita ist das die Regel und nicht die Ausnahme.

    Der eine muss Anfang des anderen sein, mindestens sechs Zeichen — das trennt
    „Zuwendungsvoraussetzung(en)" noch von „Zuwendungsempfänger", weil beide sich schon im
    elften Zeichen unterscheiden.
    """
    wa = set(re.findall(r"\w{5,}", _norm(a)))
    wb = set(re.findall(r"\w{5,}", _norm(b)))
    if not wa or not wb:
        return False
    treffer = sum(1 for x in wa
                  if any(x.startswith(y[:6]) and (x.startswith(y) or y.startswith(x))
                         for y in wb))
    return treffer / min(len(wa), len(wb)) >= schwelle


def abschnitte_finden(text):
    """Den Entwurf in Bausteine zerlegen. Ergibt {nr: {titel, text}}.

    Über die Nummerierung und nicht über den Titel: die Richtlinien im Korpus benennen ihre
    Abschnitte unterschiedlich („Zuwendungsempfangende", „Zuwendungsempfänger"), nummerieren
    sie aber alle gleich. Der Titel wird trotzdem mitgeführt — er ist die Antwort auf die
    Frage, ob der Abschnitt das enthält, was er soll.

    Aufsteigend: eine zweite „1" weiter hinten ist eine Aufzählung, keine Überschrift.
    """
    treffer = []
    erwartet = 1
    for m in _UEBERSCHRIFT.finditer(text):
        nr = int(m.group(1))
        if nr != erwartet:
            continue
        treffer.append((nr, m.group(2).strip(), m.start(), m.end()))
        erwartet += 1

    raus = {}
    for i, (nr, titel, _, ende) in enumerate(treffer):
        schluss = treffer[i + 1][2] if i + 1 < len(treffer) else len(text)
        raus[nr] = {"titel": titel, "text": text[ende:schluss].strip()}
    return raus


def gliederung(nur_landesrecht=True):
    """Die Gliederungspunkte der Musterrichtlinie je Baustein.

    Sie stecken in den Musterbausteinen — `ist_ueberschrift` trennt sie von den Satzrahmen.
    Eine eigene Liste zu pflegen hiesse, dieselbe Vorlage zweimal zu führen.
    """
    raus = {}
    for nr in BAUSTEINE:
        punkte = [t for t in richtlinie.vorschlag.rahmen(nr, nur_landesrecht)
                  if richtlinie.ist_ueberschrift(t)]
        if punkte:
            raus[nr] = punkte
    return raus


def vollstaendigkeit(gefunden, nur_landesrecht=True):
    """Was fehlt gegenüber der Musterstruktur? Ohne Modell, wiederholbar.

    Zwei Ebenen: fehlt ein ganzer Baustein, und fehlt innerhalb eines vorhandenen Bausteins
    ein Gliederungspunkt der Musterrichtlinie.

    Die zweite Ebene ist ein Wortvergleich und damit ein HINWEIS, keine Feststellung: ein
    Punkt kann der Sache nach geregelt sein, ohne die Wörter der Vorlage zu benutzen. Das
    steht im Befund, damit niemand die Liste für eine Mängelliste hält.
    """
    befunde = []
    for nr, titel in BAUSTEINE.items():
        if nr not in gefunden:
            befunde.append({
                "baustein": nr, "art": "baustein_fehlt", "schwere": "fehler",
                "text": f"Baustein {nr} „{titel}“ ist im Entwurf nicht zu finden.",
            })

    # Folgt der Entwurf überhaupt dieser Gliederung?
    #
    # Die Musterstruktur gilt für Zuwendungsrichtlinien nach § 44 LHO. Eine
    # Billigkeitsrichtlinie nach § 53 nummeriert anders — „1 Leistungszweck",
    # „2 Begriffsbestimmungen", „3 Gegenstand der Billigkeitsleistung". Wird das nicht
    # bemerkt, vergleicht die Prüfung Abschnitt für Abschnitt das Falsche und meldet lauter
    # fehlende Punkte, die in Wahrheit nur woanders stehen.
    #
    # Gemessen an den Titeln, nicht am Inhalt: Überschriften sind kurz und genau dafür da,
    # den Gegenstand zu benennen.
    passend = sum(1 for nr, d in gefunden.items()
                  if _aehnlich(d["titel"], BAUSTEINE.get(nr, "")))
    if gefunden and passend < len(gefunden) / 2:
        befunde.insert(0, {
            "baustein": 0, "art": "andere_gliederung", "schwere": "fehler",
            "text": f"Die Gliederung dieses Entwurfs folgt nicht der Musterstruktur — nur "
                    f"{passend} von {len(gefunden)} Abschnittsüberschriften passen. "
                    f"Möglicherweise keine Zuwendungsrichtlinie nach § 44 LHO, sondern etwa "
                    f"eine Billigkeitsrichtlinie nach § 53. Die folgenden Hinweise zu "
                    f"einzelnen Gliederungspunkten sind dann nicht aussagekräftig.",
        })
        return befunde

    for nr, punkte in gliederung(nur_landesrecht).items():
        if nr not in gefunden:
            continue
        abschnittstext = _norm(gefunden[nr]["text"])
        for p in punkte:
            # Vor dem Doppelpunkt steht das Thema, dahinter zählt die Vorlage die
            # Varianten auf, aus denen zu wählen ist. Wer eine davon gewählt hat, hat den
            # Punkt geregelt — die übrigen stehen bei ihm naturgemäß nicht. Verglichen wird
            # deshalb nur das Thema.
            thema = _norm(p["text"]).split(":")[0]
            # Ein Gliederungspunkt, der nur den Abschnittstitel wiederholt, sagt nichts:
            # „Baustein 4 — Zuwendungsvoraussetzungen: zu Zuwendungsvoraussetzungen findet
            # sich nichts" ist keine Feststellung, sondern ein Zirkelschluss.
            if thema and thema in _norm(BAUSTEINE.get(nr, "")):
                continue
            woerter = [w for w in re.findall(r"\w{5,}", thema)]
            if not woerter:
                continue
            gedeckt = sum(1 for w in woerter if w in abschnittstext) / len(woerter)
            if gedeckt < 0.5:
                befunde.append({
                    "baustein": nr, "art": "gliederungspunkt_offen", "schwere": "hinweis",
                    "text": f"Baustein {nr}: zu „{p['text']}“ (Musterrichtlinie "
                            f"{p['nummer']}) findet sich im Entwurf nichts Entsprechendes.",
                })
    return befunde


def pruefen(pfad, mit_inhalt=False, felder_je_baustein=None):
    """Einen Entwurf prüfen. Ergibt {abschnitte, befunde, felder}."""
    text = text_lesen(pfad)
    gefunden = abschnitte_finden(text)
    befunde = vollstaendigkeit(gefunden)

    felder = {}
    if mit_inhalt:
        # Stufe 3: aus dem Abschnittstext wieder Feldwerte machen — derselbe Weg wie beim
        # Erstellen, nur andersherum. Ein Modellaufruf je Baustein.
        for nr, daten in sorted(gefunden.items()):
            ziel = (felder_je_baustein or {}).get(nr)
            if not ziel:
                continue
            vorschlaege, nachweis = richtlinie.vorschlag.vorschlagen(
                nr, daten["text"][:6000], ziel)
            felder[nr] = {"vorschlaege": vorschlaege,
                          "befunde": nachweis.get("befunde", [])}
    return {
        "abschnitte": {nr: {"titel": d["titel"], "zeichen": len(d["text"])}
                       for nr, d in sorted(gefunden.items())},
        "befunde": befunde,
        "felder": felder,
    }


def main():
    p = argparse.ArgumentParser(description="Einen Richtlinienentwurf gegen die Musterstruktur halten.")
    p.add_argument("--datei", required=True, help="PDF oder DOCX des Entwurfs")
    p.add_argument("--inhalt", action="store_true",
                   help="zusätzlich Feldwerte aus dem Text ziehen (ein Modellaufruf je Baustein)")
    args = p.parse_args()

    ergebnis = pruefen(args.datei, mit_inhalt=args.inhalt)

    print(f"{len(ergebnis['abschnitte'])} von {len(BAUSTEINE)} Bausteinen gefunden:\n")
    for nr, d in ergebnis["abschnitte"].items():
        print(f"  {nr}  {d['titel'][:56]:58} {d['zeichen']:6} Zeichen")

    fehler = [b for b in ergebnis["befunde"] if b["schwere"] == "fehler"]
    hinweise = [b for b in ergebnis["befunde"] if b["schwere"] == "hinweis"]
    print(f"\n{len(fehler)} fehlende Bausteine, {len(hinweise)} offene Gliederungspunkte\n")
    for b in fehler + hinweise:
        marke = "✗" if b["schwere"] == "fehler" else "~"
        print(f"  {marke} {b['text']}")
    if hinweise:
        print("\n  Die Gliederungspunkte sind ein Wortvergleich und damit ein Hinweis: ein")
        print("  Punkt kann der Sache nach geregelt sein, ohne die Wörter der Vorlage zu")
        print("  benutzen.")


if __name__ == "__main__":
    main()
