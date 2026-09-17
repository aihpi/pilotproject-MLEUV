"""Hierarchie des GAK-Rahmenplans aus dem Text ableiten und an die Chunks hängen.

Warum: Die Überschrift „1.3 Zuwendungsempfänger" kommt im Rahmenplan 27-mal vor, ohne dass
etwas sagt, zu welchem Förderbereich sie gehört. Damit ist eine Fundstelle nicht eindeutig,
und Fragen wie „alle Empfängerkreise des Förderbereichs 1" sind über eine Ähnlichkeitssuche
grundsätzlich nicht beantwortbar — das ist gemessen, nicht vermutet.

Struktur des Rahmenplans:
    Teil I  Allgemeiner Teil (Bereiche A bis C)
    Teil II Fördergrundsätze -> Förderbereich 1..9
              -> allgemeine Bestimmungen + Maßnahmengruppen (A, B, C …)
                 -> Fördermaßnahmen (1.0 … X.X)
                    -> Zweck / Gegenstand / Empfänger / Art und Höhe / Voraussetzungen / Sonstiges

Ableitung, drei Regeln:
1. Förderbereich: Überschrift „Förderbereich N“ — für die Bereiche 6, 8 und 9 fehlt sie in der
   Extraktion, dort greift ein Titel-Stichwort. Bewusst über Stichworte statt über Chunk-Nummern,
   damit die Ableitung eine Neu-Indizierung übersteht.
2. Fördermaßnahme: führende Zahl einer Überschrift „N.M“. Sie zählt je Maßnahmengruppe neu —
   ein Rücksprung markiert also den Gruppenwechsel, und daraus folgt der Gruppenbuchstabe.
3. Abschnittstyp: über Stichworte in der Überschrift, NICHT über die Ziffer hinter dem Punkt.
   Die Reihenfolge schwankt zwischen den Förderbereichen (in Förderbereich 1 ist X.4 „Art und
   Höhe“, in Förderbereich 4 ist X.4 „Zuwendungsvoraussetzungen“).

Wo eine Regel nicht greift, bleibt das Feld leer. Eine unvollständige Adresse ist brauchbar,
eine falsche nicht.
"""
import re

DOKUMENT = "gak-rahmenplan-2026-2029.pdf"

# Förderbereiche ohne erkennbare Überschrift: Einstieg über den Wortlaut ihres Zuwendungszwecks.
TITEL_STICHWORT = {
    6: "Züchterische Verbesserung der Gesundheit und Robustheit",
    8: "Erhöhung der Sicherheit an den Küsten",
    9: "Europarechtliche Grundlage für die Förderung benachteiligter Gebiete",
}

ABSCHNITT_TYP = [
    ("zuwendungszweck", "zweck"),
    ("gegenstand der förderung", "gegenstand"),
    ("förderausschluss", "gegenstand"),
    ("zuwendungsempfänger", "empfaenger"),
    ("art und höhe", "art_hoehe"),
    ("zuwendungsvoraussetzungen", "voraussetzungen"),
    ("sonstige bestimmungen", "sonstige"),
]


def _typ(ueberschrift):
    """Nur echte Abschnittsüberschriften, nicht jede Erwähnung des Wortes.

    Sonst wird „7.6.2 Der Zuwendungsempfänger hat …“ als Empfängerliste geführt. Deshalb:
    Nummer, dann im Wesentlichen nur noch der Abschnittstitel (kurze Überschrift)."""
    h = (ueberschrift or "").strip()
    rest = re.sub(r"^\d+(?:\.\d+)*\s*", "", h)
    if len(rest) > 48:  # längere Überschriften sind Satzanfänge, keine Titel
        return None
    low = rest.lower()
    for stichwort, typ in ABSCHNITT_TYP:
        if low.startswith(stichwort):
            return typ
    return None


def _buchstabe(n):
    return chr(ord("A") + n) if 0 <= n < 26 else None


def ableiten(chunks):
    """chunks: nach chunk_index sortierte Liste von Payload-Dicts. Ergibt {chunk_index: felder}."""
    ergebnis = {}
    fb = gruppe_nr = massnahme = None
    letzte_massnahme = None

    for pl in chunks:
        idx = pl.get("chunk_index")
        h = pl.get("abschnitt") or ""
        text_anfang = " ".join((pl.get("text") or "").split())[:220]

        # 1. Förderbereichs-Wechsel
        m = re.search(r"Förderbereich\s+(\d)\b", h)
        if m:
            fb, gruppe_nr, massnahme, letzte_massnahme = int(m.group(1)), 0, None, None
        else:
            for nr, stichwort in TITEL_STICHWORT.items():
                if stichwort.lower() in (h + " " + text_anfang).lower():
                    if fb != nr:
                        fb, gruppe_nr, massnahme, letzte_massnahme = nr, 0, None, None
                    break

        # 2. Fördermaßnahme und Gruppenwechsel
        mm = re.match(r"^(\d+)\.(\d+)", h)
        if mm and fb:
            nummer = int(mm.group(1))
            if letzte_massnahme is not None and nummer < letzte_massnahme:
                gruppe_nr = (gruppe_nr or 0) + 1  # Rücksprung -> neue Maßnahmengruppe
            letzte_massnahme = nummer
            massnahme = f"{nummer}.0"

        felder = {}
        if fb:
            felder["teil"] = "II"
            felder["foerderbereich"] = fb
            if massnahme:
                felder["foerdermassnahme"] = massnahme
            # Maßnahmengruppe wird NICHT geschrieben. Die Ableitung über Nummern-Rücksprünge
            # ergab in vier von neun Förderbereichen eine andere Zahl als der Rahmenplan selbst
            # angibt (FB5: 3 statt 6, FB4: 11 statt 12) — die Gruppengrenzen stehen im
            # extrahierten Text nirgends, nur die Gruppenliste je Förderbereich. Ein Buchstabe,
            # der in der Hälfte der Fälle falsch ist, wäre schlimmer als keiner.
            b = _buchstabe(gruppe_nr) if gruppe_nr is not None else None
            if b:
                felder["_massnahmengruppe_unsicher"] = b
        typ = _typ(h)
        if typ:
            felder["abschnitt_typ"] = typ
        if felder:
            felder["hierarchie_quelle"] = "abgeleitet"
            ergebnis[idx] = felder
    return ergebnis


def gruppen_soll(chunks):
    """Wie viele Maßnahmengruppen nennt der Rahmenplan je Förderbereich selbst?
    Dient als Gegenprobe zur Ableitung über die Rücksprünge."""
    soll = {}
    fb = None
    for pl in chunks:
        h = pl.get("abschnitt") or ""
        t = " ".join((pl.get("text") or "").split())
        m = re.search(r"Förderbereich\s+(\d)\b", h)
        if m:
            fb = int(m.group(1))
        if fb and "gliedert sich in folgende Maßnahmengruppen" in t:
            soll[fb] = len(re.findall(r"(?:^|[-–]\s*)([A-Z])\.\s+[A-ZÄÖÜ]", t))
    return soll


def fundstelle(pl):
    """Fundstelle in der Form, die das MLEUV verwendet."""
    if not pl.get("foerderbereich"):
        seiten = pl.get("seiten") or []
        return f"{pl.get('quelle')}" + (f", S. {', '.join(map(str, seiten))}" if seiten else "")
    teile = ["GAK-Rahmenplan", f"Teil {pl.get('teil', 'II')}", f"Förderbereich {pl['foerderbereich']}"]
    if pl.get("massnahmengruppe"):
        teile.append(f"Maßnahmengruppe {pl['massnahmengruppe']}")
    if pl.get("foerdermassnahme"):
        teile.append(f"Fördermaßnahme {pl['foerdermassnahme']}")
    if pl.get("abschnitt"):
        teile.append(f"Nr. {pl['abschnitt']}")
    return ", ".join(teile)
