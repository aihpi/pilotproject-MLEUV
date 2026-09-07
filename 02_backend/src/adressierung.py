"""Adressierung: jedem Chunk sagen, wo er steht (Bausteine a und b).

Das Problem: „In den Fällen der Nummer 7.8 sind diese Rechte …" — Nummer 7.8 wovon? Der Satz
sagt es nicht. Auflösbar ist er nur, wenn das Textstück weiß, dass es in ANBest-G steht und
selbst die Nummer 8.1 trägt. Im Korpus stehen rund 10.600 solcher Verweise auf 4.889 Chunks,
gut die Hälfte davon nackt.

Zwei Felder je Chunk:
    dokument  Kurzname aus dem Register (korpus_register.yaml) — „ANBest-G"
    nummer    Gliederungsnummer dieses Textstücks — „8.1"

Drei Regeln für die Nummer, in dieser Reihenfolge:
1. Der Text beginnt mit einer Gliederungsnummer — die genaueste und verlässlichste Angabe,
   weil sie den Absatz trifft und nicht nur den Abschnitt.
2. Sonst die Nummer aus der Überschrift — aber nur unter Vorbehalt. docling hängt einem
   Fortsetzungs-Chunk gern die Überschrift des Nachbarabschnitts an; ungeprüft übernommen
   springt die Adresse dann rückwärts (in der VV zu § 44 LHO von 3.0 auf 2) oder vorwärts in
   einen Abschnitt, der erst später beginnt (in der EBI-RL von 2.1 auf 3 und zurück auf 2.2).
3. Sonst die zuletzt gesehene Nummer weiterschreiben. Ein Chunk ohne eigene Nummer ist die
   Fortsetzung seines Vorgängers.

Wo keine Regel greift, bleibt das Feld leer. Eine unvollständige Adresse ist brauchbar, eine
falsche nicht — dieselbe Linie wie in gak_hierarchie.py.

EU-Verordnungen sind ausgenommen: dort fehlt die Artikelstruktur schon in der Extraktion
(Überschriften nur „▼ B"/„▼ M6"). Das Register führt sie mit `struktur_fehlt: true`; sie
bekommen den Dokumentnamen, aber keine Nummer. Lieber kein Feld als ein erfundenes.
"""
import os
import re

import yaml

from config import BASE

REGISTER = os.path.join(BASE, "korpus_register.yaml")
# Overlay mit den Einträgen, deren Titel nicht ins Repo gehören (von git ignoriert).
REGISTER_LOKAL = os.path.join(BASE, "korpus_register_lokal.yaml")

# Gliederungsnummer am Textanfang: „8.1 Die Bewilligungsbehörde …", „- 8.1 …", „4.1.8. …"
_NUMMER_TEXT = re.compile(r"^[\s\-–—•]*(?:Nr\.\s*)?(\d+(?:\.\d+)*)\.?(?=\s+\S)")
# … und in der Überschrift: „8 Prüfung der Verwendung", „4.1.8 Fördergebietskulisse"
_NUMMER_UEBERSCHRIFT = re.compile(r"^\s*(?:Nr\.\s*)?(\d+(?:\.\d+)*)\.?(?:\s|$)")


def register(pfad=REGISTER):
    """Register laden: {Dateiname: Eintrag}. Leer, wenn die Datei fehlt.

    korpus_register_lokal.yaml wird dazugemischt, falls vorhanden: dort stehen die Einträge,
    deren Dateiname ein Dokument aus einem vertraulichen Ordner benennt und darum nicht ins
    Repo gehört. Fehlt das Overlay, fehlen nur diese Einträge — kein Fehler.
    """
    reg = {}
    for p in (pfad, REGISTER_LOKAL):
        try:
            with open(p, encoding="utf-8") as f:
                daten = yaml.safe_load(f) or {}
        except FileNotFoundError:
            continue
        reg.update({e["datei"]: e for e in (daten.get("dokumente") or []) if e.get("datei")})
    return reg


def abkuerzungen(reg=None):
    """Alle Namen, unter denen Dokumente zitiert werden — Kurznamen und Aliase.

    Das ist die `lawbooks`-Liste, die norm_extraction.yaml aus norm-matching erwartet, und
    zugleich die Zielliste für die Verweisauflösung in Baustein (c).
    """
    reg = register() if reg is None else reg
    namen = {}
    for e in reg.values():
        for n in [e.get("kurzname")] + list(e.get("aliase") or []):
            if n:
                namen.setdefault(n, e["kurzname"])
    return namen


# Fortsetzung: Aufzählungsstrich, Kleinbuchstabe oder Listenmarke „a)" am Anfang. Solche
# Chunks beginnen keine neue Gliederungseinheit, egal was ihre Überschrift behauptet.
_FORTSETZUNG = re.compile(r"^[\s]*(?:[\-–—•]|[a-zäöüß]\)|[a-zäöüß]\s|\()")


def _stufen(n):
    return [int(t) for t in n.split(".")]


def _nummer(text, ueberschrift):
    """Eigene Nummer dieses Chunks: (Nummer, Quelle) oder (None, None)."""
    knapp = " ".join((text or "").split())
    m = _NUMMER_TEXT.match(knapp[:60])
    if m:
        return m.group(1), "text"
    if _FORTSETZUNG.match(knapp):   # Fortsetzung erbt, die Überschrift zählt hier nicht
        return None, None
    m = _NUMMER_UEBERSCHRIFT.match(ueberschrift or "")
    return (m.group(1), "ueberschrift") if m else (None, None)


def _uebernehmen(neu, alt):
    """Darf die Überschriftsnummer die bisherige ersetzen?

    Nein, wenn sie rückwärts zeigt — Dokumente werden vorwärts gelesen. Ausgenommen ist der
    echte Neuanfang bei 1, den der GAK-Rahmenplan je Maßnahmengruppe macht.
    Nein auch, wenn sie gröber ist als die bisherige („4" nach „4.0"): das ist dieselbe Stelle,
    nur ungenauer benannt.
    """
    if alt is None:
        return True
    a, n = _stufen(alt), _stufen(neu)
    if n[0] == 1 and a[0] > 1:
        return True                      # Neuanfang der Zählung
    if n == a[:len(n)]:
        return False                     # gröbere Angabe derselben Stelle
    return n >= a


def _plausibel(neu, alt):
    """Sprung von `alt` auf `neu` glaubhaft?

    Ohne diese Prüfung reißt jede Jahreszahl und jeder Geldbetrag am Satzanfang die Adresse an
    sich („2023 wurden …" würde Nummer 2023). Verlangt wird deshalb: entweder eine mehrstufige
    Nummer, oder eine einstellige Zahl unter 100, oder ein Anschluss an die bisherige Nummer.
    """
    if "." in neu:
        return True
    n = int(neu)
    if n >= 100:
        return False
    if alt is None:
        return n <= 20  # Dokumentanfang: eine 47 als erste Gliederungsnummer ist unglaubhaft
    a = int(alt.split(".")[0])
    return n <= a + 3  # Weiterzählen oder kleiner Sprung; ein Satz „2024 gilt …" fällt raus


def adressen(chunks, eintrag):
    """chunks: nach chunk_index sortierte Payload-Dicts EINES Dokuments.

    Ergibt {chunk_index: {"dokument": …, "nummer": …}}. Chunks ohne eigene Nummer erben die
    des Vorgängers; ein Dokument mit `struktur_fehlt` bekommt nur den Dokumentnamen.
    """
    kurz = eintrag.get("kurzname")
    ohne_struktur = bool(eintrag.get("struktur_fehlt"))
    ergebnis, laufend = {}, None

    for pl in chunks:
        felder = {"dokument": kurz}
        if not ohne_struktur:
            eigen, quelle = _nummer(pl.get("text"), pl.get("abschnitt"))
            gesetzt = None
            if eigen and _plausibel(eigen, laufend):
                # Die Textnummer gilt unmittelbar, die Überschrift nur unter Vorbehalt.
                if quelle == "text" or _uebernehmen(eigen, laufend):
                    laufend, gesetzt = eigen, quelle
            if laufend:
                felder["nummer"] = laufend
                felder["nummer_quelle"] = gesetzt or "vererbt"
        ergebnis[pl["chunk_index"]] = felder
    return ergebnis


def fundstelle(pl):
    """Fundstelle in Zitierform: „ANBest-G, Nummer 8.1 (S. 5)".

    Fällt auf die bisherige Form zurück, solange die Adressierung nicht geschrieben ist.
    """
    seiten = pl.get("seiten") or []
    s = f" (S. {', '.join(map(str, seiten))})" if seiten else ""
    dok = pl.get("dokument")
    if not dok:
        return f"{pl.get('quelle')}{s} | {pl.get('abschnitt')}"
    nr = pl.get("nummer")
    art = "Artikel" if pl.get("zitierweise") == "artikel" else "Nummer"
    return f"{dok}, {art} {nr}{s}" if nr else f"{dok}{s}"
