"""Musterbausteine aus der Musterrichtlinie ziehen — die geschlossene Bezugsgröße.

Wozu: Der Prüfmodus soll sagen können „in Baustein 5 fehlt die Kumulierungsregel". Eine
Ähnlichkeitssuche kann das nicht — sie findet passende Passagen, aber Abwesenheit stellt sie
nicht fest. Dafür braucht es eine vollständige Liste dessen, was dastehen muss, und die ist
die Musterrichtlinie. Zugleich liefert dieser Lauf die echten Mustersätze für den Zusammenbau
des Entwurfs.

Warum ein eigener Weg statt ingest.py: Die Musterrichtlinie IST eine Tabelle mit den Spalten
Nummer, Textbaustein und Hinweis an den Ersteller. Der HybridChunker in ingest.py serialisiert
Tabellen zu Text, und dabei laufen die drei Spalten zu einer Zeile zusammen („5.4.n,
Textbausteine = Die zuwendungsfähigen Kosten …"). Im Index steht sie deshalb als 33
Zellfragmente. docling selbst extrahiert die Tabelle sauber — man muss nur am Chunker vorbei
an `document.tables` gehen. Genau das tut dieses Modul.

Die Quelle wird NICHT im Code hinterlegt: sie liegt in einem der vertraulichen Ordner, und
weder ihr Titel noch ihr Pfad gehören ins Repo. Deshalb über --pdf oder MUSTER_PDF. Die
Ausgabe ist aus demselben Grund von git ausgenommen — sie enthält den Wortlaut der Bausteine.

    python src/musterbausteine.py --pdf "<Pfad zur Vorlage>"   # extrahieren und schreiben
    python src/musterbausteine.py --pdf … --trocken            # nur zählen, nichts schreiben
    python src/musterbausteine.py                              # nutzt MUSTER_PDF aus .env
"""
import argparse
import os
import re

import yaml

from config import BASE

ZIEL = os.path.join(BASE, "musterbausteine_lokal.yaml")

# Erwartete Zeilenzahl je Baustein, am 2026-09-07 gegen die Vorlage gemessen. Dient als
# Selbstprüfung: weicht ein Lauf ab, hat sich entweder die Vorlage geändert oder die
# Zeilenzusammenführung ist kaputt. Beides will man sehen, nicht überlesen.
ERWARTET = {1: 12, 2: 7, 3: 3, 4: 7, 5: 15, 6: 6, 7: 12, 8: 6}

# „1.1", „1.2.n", „5.4.n" — die Gliederungsnummer eines Textbausteins. Das Suffix .n steht in
# der Vorlage für „laufend zu nummerieren, sooft der Baustein gebraucht wird"; es bleibt
# erhalten, weil es eine Anweisung an den Ersteller ist und keine Nummer.
_NUMMER = re.compile(r"^(\d+)(?:\.\d+)*(?:\.n)?\.?$")
# Überschriftszeile der Vorlage: „1. Zuwendungszeck, Rechtsgrundlage" — in allen drei Spalten
# gleich, weil Word die verbundene Zelle über die Tabellenbreite zieht.
_UEBERSCHRIFT = re.compile(r"^(\d+)\.\s*(.+)$")


def _wandler():
    """docling mit Tabellenerkennung, ohne OCR.

    Gleiche Einstellungen wie ingest.py (ACCURATE, Zellabgleich), damit die Zellgrenzen
    identisch erkannt werden — nur ohne den Chunker dahinter. OCR bleibt aus: die Vorlage
    hat einen Textlayer, und OCR würde die Tabellenstruktur wieder zerreiben.
    """
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode

    opts = PdfPipelineOptions()
    opts.do_ocr = False
    opts.do_table_structure = True
    opts.table_structure_options.mode = TableFormerMode.ACCURATE
    opts.table_structure_options.do_cell_matching = True
    return DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)})


def _spalten(df):
    """Spaltenindizes für (nr, text, hinweis) über die Bezeichnung, nicht die Position.

    Nach Position geht es nicht: docling erkennt auf einer Seite eine vierte, leere Spalte
    dazu (dort steckt die Überschrift von Baustein 5), und auf einer anderen fehlt die
    Nummernspalte ganz (eine reine Fortsetzungszeile). Beide Tabellen fielen bei einer
    Prüfung auf „genau drei Spalten" heraus — zusammen fünf Textbausteine und ein Titel.
    Fehlt die Nummernspalte, gilt None: die Zeile ist dann zwangsläufig eine Fortsetzung.
    """
    idx = {}
    for i, spalte in enumerate(df.columns):
        name = str(spalte).strip().lower()
        if name.startswith("nr"):
            idx.setdefault("nr", i)
        elif "textbaustein" in name:
            idx.setdefault("text", i)
        elif "hinweis" in name:
            idx.setdefault("hinweis", i)
    if "text" not in idx or "hinweis" not in idx:
        return None
    return idx.get("nr"), idx["text"], idx["hinweis"]


def _zellen(doc):
    """Alle Tabellenzeilen der Vorlage in Dokumentreihenfolge als (nr, text, hinweis).

    Die Vorlage bricht über 23 Seiten in 24 Einzeltabellen, und ein Textbaustein kann dabei
    mitten im Satz umbrechen. Fortsetzungszeilen erkennt man daran, dass die Nummernspalte
    leer ist — sie werden hier NICHT gefiltert, sondern durchgereicht; das Zusammenfügen
    passiert eine Ebene höher, weil es über Tabellengrenzen hinweg gehen muss.
    """
    def wert(zeile, i):
        if i is None:
            return ""
        w = str(zeile.iloc[i])
        return "" if w == "nan" else w.strip()

    for tab in doc.tables:
        df = tab.export_to_dataframe(doc=doc)
        spalten = _spalten(df)
        if not spalten:
            continue  # z.B. die einzellige Kopftabelle „Notifizierung/Freistellung"
        nr_i, text_i, hinweis_i = spalten
        for _, zeile in df.iterrows():
            yield wert(zeile, nr_i), wert(zeile, text_i), wert(zeile, hinweis_i)


def lesen(pfad):
    """Vorlage einlesen: [{nummer, baustein, text, hinweis}], plus {baustein: (titel, hinweis)}."""
    doc = _wandler().convert(pfad).document
    eintraege, titel, baustein = [], {}, None

    for nr, text, hinweis in _zellen(doc):
        # Überschrift: alle drei Spalten gleich, weil Word die verbundene Zelle über die
        # Tabellenbreite zieht. Sie ist keine Regel, sondern sagt, in welchem Baustein die
        # folgenden Zeilen stehen — und liefert dessen amtlichen Titel.
        if nr and nr == text == hinweis:
            m = _UEBERSCHRIFT.match(nr)
            if m:
                baustein = int(m.group(1))
                # In der verbundenen Zelle kann hinter dem Titel ein Hinweis stehen (Baustein 7:
                # „Verfahren Hinweis: Bei Verwaltungsvorschriften … nicht über § 44 LHO."). Der
                # gehört nicht in den Titel, ist aber zu schade zum Wegwerfen.
                rest = m.group(2).strip()
                kopf, _, notiz = rest.partition("Hinweis:")
                titel[baustein] = (kopf.strip(), notiz.strip() or None)
            continue

        if _NUMMER.match(nr):
            baustein = int(_NUMMER.match(nr).group(1))
            eintraege.append({"nummer": nr.rstrip("."), "baustein": baustein,
                              "text": text, "hinweis": hinweis})
        elif eintraege and (text or hinweis):
            # Fortsetzung nach Seitenumbruch: an den vorigen Eintrag anhängen. Mit Leerzeichen
            # verbinden, nicht mit Zeilenumbruch — der Umbruch ist ein Artefakt des Layouts.
            vor = eintraege[-1]
            if text:
                vor["text"] = f"{vor['text']} {text}".strip()
            if hinweis:
                vor["hinweis"] = f"{vor['hinweis']} {hinweis}".strip()

    return eintraege, titel


def gliedern(eintraege, titel):
    """Nach Baustein gruppieren — die Form, in der Prüfmodus und Zusammenbau sie brauchen."""
    nach_baustein = {}
    for e in eintraege:
        nach_baustein.setdefault(e["baustein"], []).append(
            {"nummer": e["nummer"], "text": e["text"], "hinweis": e["hinweis"] or None})
    gegliedert = []
    for b in sorted(nach_baustein):
        kopf, notiz = titel.get(b, (None, None))
        gegliedert.append({"nummer": b, "titel": kopf, "hinweis": notiz,
                           "textbausteine": nach_baustein[b]})
    return gegliedert


def schreiben(bausteine, pfad=ZIEL):
    kopf = ("# Musterbausteine aus der Musterrichtlinie — ERZEUGT, nicht von Hand pflegen.\n"
            "# Quelle: src/musterbausteine.py. Nicht im Repo (siehe .gitignore): der Wortlaut\n"
            "# stammt aus einem Dokument der vertraulichen Ordner.\n"
            "#\n"
            "# Felder je Textbaustein:\n"
            "#   nummer   Gliederungsnummer der Vorlage; Suffix .n = laufend zu nummerieren\n"
            "#   text     Wortlaut des Textbausteins\n"
            "#   hinweis  Hinweis an den Ersteller der Richtlinie/VV\n\n")
    with open(pfad, "w", encoding="utf-8") as f:
        f.write(kopf)
        yaml.safe_dump({"bausteine": bausteine}, f, allow_unicode=True, sort_keys=False,
                       default_flow_style=False, width=100)
    return pfad


def laden(pfad=ZIEL):
    """Erzeugte Datei laden: {baustein: [textbausteine]}. Leer, wenn sie fehlt.

    Fehlt sie, fehlen die Mustersätze — kein Fehler. Wer das Repo klont, hat die Vorlage
    nicht und muss den Lauf mit eigenem Datenordner nachholen.
    """
    try:
        with open(pfad, encoding="utf-8") as f:
            daten = yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {}
    return {b["nummer"]: b.get("textbausteine") or [] for b in (daten.get("bausteine") or [])}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--pdf", default=os.getenv("MUSTER_PDF"),
                   help="Pfad zur Musterrichtlinie; Vorgabe MUSTER_PDF aus .env")
    p.add_argument("--trocken", action="store_true", help="nur zählen, nichts schreiben")
    args = p.parse_args()

    if not args.pdf:
        print("Keine Quelle. Erwartet wird --pdf oder MUSTER_PDF in .env.\n"
              "Der Pfad steht bewusst nicht im Code: er nennt ein Dokument aus einem\n"
              "vertraulichen Ordner.")
        return
    if not os.path.exists(args.pdf):
        print(f"Nicht gefunden: {args.pdf}")
        return

    eintraege, titel = lesen(args.pdf)
    bausteine = gliedern(eintraege, titel)

    print(f"{len(eintraege)} Textbausteine in {len(bausteine)} Bausteinen.\n")
    abweichung = False
    for b in bausteine:
        ist, soll = len(b["textbausteine"]), ERWARTET.get(b["nummer"])
        marke = "" if soll is None or ist == soll else f"   [erwartet {soll}]"
        if marke:
            abweichung = True
        print(f"  Baustein {b['nummer']}: {ist:3} — {b['titel'] or '(ohne Titel)'}{marke}")
    if abweichung:
        print("\nAbweichung zur Messung vom 07.09.2026: entweder hat sich die Vorlage geändert\n"
              "oder die Zeilenzusammenführung greift nicht. Vor dem Weiterverwenden nachsehen.")

    ohne = [e["nummer"] for e in eintraege if not e["text"]]
    if ohne:
        print(f"\nOhne Wortlaut: {', '.join(ohne)} — in der Vorlage nur Zwischentitel?")

    if args.trocken:
        print("\nTrockenlauf, nichts geschrieben.")
        return
    print(f"\nGeschrieben: {schreiben(bausteine)}")


if __name__ == "__main__":
    main()
