"""Suchanfrage bilden aus Abschnitt und Nutzertext (Baustein B2).

Das Problem: Im Werkzeug kommt keine Frage an, sondern eine Situation — die Nutzerin ist in
Abschnitt 5 und hat einen Entwurfssatz getippt. Wird dieser Text unverändert in die Suche
gegeben, findet das Retrieval nur in 34 Prozent der Fälle alle Pflicht-Fundstellen, gegenüber
66 Prozent bei einer sauber gestellten Frage. Dieses Zwischenstück schließt die Lücke.

Vier Hebel:
1. Abschnittsthema als eigene Anfrage — was in Abschnitt N zu regeln ist, steht in den
   Grundsätzen für Förderrichtlinien und ist unabhängig vom Entwurfstext bekannt.
2. Kern des Entwurfstextes statt des ganzen Absatzes.
3. MEHRERE Anfragen statt einer. Ein Abschnitt hat mehrere Pflichtelemente, und eine
   Ähnlichkeitssuche kann eine Aufzählung nicht in einem Zug holen (siehe Versuch zu H-03).
4. Zusammenführung der Teilergebnisse per RRF, wie im Hybrid-Retrieval.

Bewusst NICHT aus dem Eval-Katalog abgeleitet: Die Themen je Abschnitt stammen aus der
Gliederung der Grundsätze für Förderrichtlinien, nicht aus den Gold-Fundstellen der
Validierungsfragen. Sonst würde die Suche auf den Messfall hin gebaut.
"""
import re
from concurrent.futures import ThreadPoolExecutor

from retrieval import hybrid_search
from config import TOP_K

# Was in welchem Abschnitt zu regeln ist — nach der Gliederung der Grundsätze für
# Förderrichtlinien (Anlage 19 zu VV Nr. 14.2.1), Nummern 1 bis 8.
ABSCHNITT_THEMEN = {
    1: ["Zuwendungszweck Rechtsgrundlage Verwaltungsvorschriften zu § 44 LHO",
        "kein Anspruch auf Gewährung der Zuwendung pflichtgemäßes Ermessen"],
    2: ["Gegenstand der Förderung welche Maßnahmen gefördert werden",
        "Förderausschlüsse nicht förderfähige Maßnahmen"],
    3: ["Zuwendungsempfangende Kreis abschließend bezeichnen",
        "Weiterleitung der Zuwendung an Dritte"],
    4: ["Zuwendungsvoraussetzungen Bewilligungsvoraussetzungen",
        "zusätzliche Voraussetzungen bei Antragstellung nachzuweisen"],
    5: ["Zuwendungsart Projektförderung institutionelle Förderung",
        "Finanzierungsart Anteilfinanzierung Fehlbedarfsfinanzierung Festbetragsfinanzierung Vollfinanzierung",
        "Bemessungsgrundlage zuwendungsfähige Ausgaben Höhe der Zuwendung Förderquote"],
    6: ["sonstige Zuwendungsbestimmungen besondere Nebenbestimmungen Auflagen",
        "Zweckbindung Inventarisierung Publizitätspflichten"],
    7: ["Antragsverfahren Bewilligungsverfahren Auszahlungsverfahren",
        "Verwendungsnachweis Prüfung der Verwendung Erstattung",
        "zu beachtende Vorschriften Standardklausel"],
    8: ["Geltungsdauer Inkrafttreten Außerkrafttreten Befristung",
        "Verlängerung der Laufzeit Geltungsdauer der Beihilfegrundlage"],
}

# Füllwörter und Rückfrageformeln, die als Suchbegriff nichts beitragen
_BALLAST = re.compile(
    r"\b(ist|sind|das|so|zulässig|richtig|ausreichend|genügt|geht|was|welche[rs]?|wie|"
    r"muss|müssen|darf|dürfen|kann|können|gilt|gehört|bitte|entwurf|fachreferat|"
    r"abschnitt|nummer)\b[:.,]?", re.I)


def zerlegen(text):
    """Trennt den Vorspann („Abschnitt 6, Projektförderung an einen Verein, ANBest-P.") vom Rest.

    Der Vorspann trägt die Basisangaben, und die sind als Suchbegriff oft das Wertvollste im
    ganzen Satz — „ANBest-P", „reine Landesmittel", „GAK-kofinanziert" zeigen unmittelbar auf das
    einschlägige Regelwerk. Ihn wegzuwerfen war der erste Fehler dieser Funktion.
    """
    t = (text or "").strip()
    t = re.sub(r"^\s*Querschnittsprüfung\.\s*", "", t)
    m = re.match(r"^\s*Abschnitt\s+\d+\s*,?\s*([^.]*)\.\s*(.*)$", t, re.S)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return "", t


def kern(text):
    """Suchbarer Kern des eigentlichen Anliegens: Entwurfszitat, sonst der Satz ohne Füllwörter."""
    _, rest = zerlegen(text)
    zitate = re.findall(r"[„'\"]([^„'\"]{25,})[”'\"]", rest)   # Entwurfstext in Anführungszeichen
    if zitate:
        rest = " ".join(zitate)
    return re.sub(r"\s+", " ", _BALLAST.sub(" ", rest)).strip()


# Wie viele Mustersätze als eigene Teilanfrage mitlaufen.
#
# Drei. Jede Teilanfrage kostet ein Embedding und ein Reranking; mehr als drei verdoppeln die
# Antwortzeit, ohne die Trefferliste zu verbreitern — RRF führt ohnehin zusammen.
MUSTERSAETZE_ALS_ANFRAGE = 3

# Ab welcher Länge ein Mustersatz als Suchtext taugt. Kürzere sind Gliederungsüberschriften.
MUSTERSATZ_MINDESTLAENGE = 80


def _mustersaetze(text, abschnitt_nr):
    """Mustersätze des Abschnitts, die zum Anliegen passen — als zusätzliche Suchtexte.

    Der Grund ist eine Messung vom 07.10.2026: Bei den Gold-Fundstellen, die unter zwanzig
    Kandidaten fehlten, lag die Wortüberschneidung zwischen Frage und Fundstelle im MEDIAN
    bei null. Die Frage nennt den Zweck („ab welchem Wert ist zu inventarisieren"), die
    Fundstelle die Voraussetzung („deren Wert … übersteigt") — kein tragendes Wort gemeinsam.
    Weder BM25 noch die Einbettung überbrücken das.

    Der Mustersatz dagegen ist in derselben Sprache verfasst wie die Rechtsstelle, die er
    meint — er ist nach ihr gebaut. Mit ihm zu suchen ist die Idee hinter HyDE, nur ohne
    deren Risiko: Der hypothetische Text wird nicht erzeugt, sondern aus der Vorlage genommen.

    Ausgewählt nach Wortüberschneidung mit dem Anliegen, damit nicht alle dreizehn Mustersätze
    eines Abschnitts mitlaufen.
    """
    import musterbausteine
    bausteine = musterbausteine.laden().get(abschnitt_nr) or []
    saetze = [(b.get("text") or "").strip() for b in bausteine]
    saetze = [s for s in saetze if len(s) >= MUSTERSATZ_MINDESTLAENGE]
    if not saetze:
        return []
    gesucht = {w.lower() for w in re.findall(r"\w{5,}", text)}
    if not gesucht:
        return saetze[:MUSTERSAETZE_ALS_ANFRAGE]
    bewertet = sorted(
        saetze,
        key=lambda s: -len(gesucht & {w.lower() for w in re.findall(r"\w{5,}", s)}))
    return bewertet[:MUSTERSAETZE_ALS_ANFRAGE]


def _gleiches_wort(a, b):
    """Dasselbe Wort, auch in gebeugter Form — aber kein Kompositum mit gleichem Anfang.

    „zuwendungsfähig" und „zuwendungsfähige" sind dasselbe, „zuwendung" und „zuwendungsart"
    sind es nicht. Deutsche Komposita teilen sich beliebig lange Anfänge, ein Stamm fester
    Länge fällt darauf herein: bei acht Zeichen galten „Finanzierungsform" und
    „Finanzierungsart" als gleich, und genau diese beiden Felder sollen getrennt werden.
    Deshalb: gleicher Wortanfang nur bis zu drei Zeichen Unterschied.
    """
    a, b = a.lower(), b.lower()
    if a == b:
        return True
    kurz, lang = sorted((a, b), key=len)
    return len(kurz) >= 7 and len(lang) - len(kurz) <= 3 and lang.startswith(kurz)


def mustersaetze_zu(feld_label, abschnitt_nr):
    """Der Mustersatz, der zu DIESEM Formularfeld gehört. Leer, wenn keiner erkennbar ist.

    Eigene Auswahl statt `_mustersaetze`, weil die beiden verschiedene Fragen stellen. Dort
    ist das Anliegen ein ganzer Abschnittstext, hier ein Feldname aus zwei Wörtern. Die
    Auswahl über Wortüberschneidung mit dem GANZEN Mustersatz ergab deshalb am 28.10.2026 für
    sieben von neun Feldern des Bausteins 5 denselben Satz — „Zuwendungsfähig sind (bspw.):
    Investitionskosten …" —, auch für Finanzierungsart, Fördersatz und Höchstbetrag. Eine
    Teilanfrage, die bei fast jedem Feld dasselbe fragt, ist schlimmer als keine.

    Zwei Unterschiede: verglichen wird nur mit dem BEZEICHNER des Mustersatzes, dem Teil vor
    dem Doppelpunkt („Form der Zuwendung: Zuschuss/Zuweisung"), und ohne Treffer kommt nichts
    zurück statt des besten von lauter schlechten. Die Mindestlänge entfällt — gerade die
    kurzen Mustersätze sind die Bezeichner der Oberpunkte 5.1 bis 5.5.

    Was dabei leer ausgeht, sind Felder, deren Formularname anders heißt als der Mustersatz
    („Finanzierungsform" gegen „Form der Zuwendung"). Dafür braucht es eine Tabelle Feld zu
    Gliederungsnummer; die lässt sich nicht erraten.
    """
    import musterbausteine
    gesucht = re.findall(r"\w{5,}", feld_label or "")
    if not gesucht:
        return []
    bewertet = []
    for b in musterbausteine.laden().get(abschnitt_nr) or []:
        satz = (b.get("text") or "").strip()
        if not satz:
            continue
        bezeichner = re.findall(r"\w{5,}", satz.split(":", 1)[0][:60])
        treffer = sum(1 for g in gesucht if any(_gleiches_wort(g, w) for w in bezeichner))
        if treffer:
            bewertet.append((treffer, satz))
    bewertet.sort(key=lambda e: -e[0])
    return [satz for _, satz in bewertet]


def anfragen(text, abschnitt_nr=None):
    """Teilanfragen: Basisangaben, Kern des Anliegens, Abschnittsthemen, Mustersätze."""
    vorspann, _ = zerlegen(text)
    liste = []
    if len(vorspann) > 5:
        liste.append(vorspann)
    k = kern(text)
    if len(k) > 12:
        liste.append(k)
        if vorspann:
            liste.append(f"{vorspann} {k}"[:300])  # Basisangaben und Anliegen zusammen
    for thema in ABSCHNITT_THEMEN.get(abschnitt_nr or 0, []):
        liste.append(thema)
    liste += _mustersaetze(text, abschnitt_nr)
    return liste or [text]


def zusammenfuehren(trefferlisten, k=60):
    """RRF über mehrere Trefferlisten. Öffentlich für die Suche je Feld, die ihre Teilanfragen
    selbst stellt und deshalb auch selbst zusammenführen muss."""
    return _rrf(trefferlisten, k)


def _rrf(trefferlisten, k=60):
    """Reciprocal Rank Fusion über die Teilergebnisse — dasselbe Verfahren wie dense/BM25."""
    punkte, objekte = {}, {}
    for treffer in trefferlisten:
        for rang, t in enumerate(treffer, 1):
            punkte[t.id] = punkte.get(t.id, 0.0) + 1.0 / (k + rang)
            objekte[t.id] = t
    return [objekte[i] for i in sorted(punkte, key=punkte.get, reverse=True)]


def suche(text, abschnitt_nr=None, top_k=TOP_K, je_anfrage=None, **such_args):
    """Mehrere Teilanfragen stellen und die Ergebnisse zusammenführen.

    je_anfrage: wie viele Treffer je Teilanfrage geholt werden. Vorgabe top_k, damit auch ein
    Treffer, der nur bei einer Teilanfrage oben steht, in die Zusammenführung kommt.

    Die Teilanfragen laufen nebenläufig. Sie sind voneinander unabhängig, aber jede enthält
    per Vorgabe ein Reranking — also einen Modellaufruf von rund zehn Sekunden. Seriell
    brauchten drei Teilanfragen 29 Sekunden und machten damit die Hälfte der Antwortzeit der
    Naht aus. An der Zusammenführung ändert sich nichts: RRF hängt nicht von der Reihenfolge
    ab, in der die Listen eintreffen.
    """
    teile = anfragen(text, abschnitt_nr)
    je = je_anfrage or top_k
    if len(teile) == 1:
        return _rrf([hybrid_search(teile[0], top_k=je, **such_args)])[:top_k]
    with ThreadPoolExecutor(max_workers=min(len(teile), 6)) as pool:
        listen = list(pool.map(lambda a: hybrid_search(a, top_k=je, **such_args), teile))
    return _rrf(listen)[:top_k]
