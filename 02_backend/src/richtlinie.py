"""Die Richtlinie zusammenbauen — der letzte Schritt des Prozessmodells.

Dort heißt er: „Erstellung der Richtlinie mit Begründungen je Entscheidung, die in den Text
einfloss (ob Musterbaustein, ob Eingabe, welche rechtliche Prüfung ggf. durchgeführt wurde)
anhand der Informationen aus dem RL-Modell im Zustand der Anwendung."

Bis hierher erhebt und prüft das Werkzeug nur. Am Ende steht eine Liste von Feldwerten,
keine Richtlinie — und damit fehlt genau das Arbeitsergebnis, um dessentwillen es gebaut
wurde.

ZWEI TEILE MIT UNTERSCHIEDLICHER VERLÄSSLICHKEIT, und das ist der Kern dieses Moduls:

- Die BEGRÜNDUNGEN werden gerechnet, nicht erzeugt. Woher ein Wert kam, welcher
  Musterbaustein den Rahmen gab, welche Prüfung ihn berührt hat — das steht alles im
  Entwurf und wird nur eingesammelt. Kein Modellaufruf, kein Spielraum.
- Der TEXT wird formuliert, je Abschnitt ein Modellaufruf, eingeklemmt zwischen die
  Musterbausteine als Satzrahmen und die bestätigten Werte als Inhalt.

Dazu die Gegenprüfung: `pruefe_text` hält jeden Satz zeichengenau gegen Musterbausteine und
Werte. Was sich auf keines von beidem zurückführen lässt, wird gemeldet. Das ist dieselbe
Idee wie in vorschlag.py, nur in die andere Richtung — dort verhindert sie das Abschreiben,
hier das Dazudichten.

    python src/richtlinie.py --entwurf entwurf.json
"""
import argparse
import json
import re
import time
import unicodedata
from pathlib import Path

from bmds_prompt_loader import PromptLoader
from bmds_prompt_security import sanitize_and_wrap

import musterbausteine
import vorschlag
from llm import chat
from config import BASE

loader = PromptLoader(Path(BASE) / "prompts", lang="de")

# Platzhalter der Musterrichtlinie. `XX` in allen Längen, dazu spitze Klammern.
PLATZHALTER = re.compile(r"X{2,}|<[^>]{2,60}>", re.I)

# Ab dieser Länge gilt ein Satz als eigenständige Aussage, die belegt sein muss. Kürzere
# sind Überschriften, Nummern oder Formeln wie „Im Auftrag" — dort sagt ein Zeichenvergleich
# nichts mehr, wie schon in vorschlag._woertlich_in.
SATZ_MINDESTLAENGE = 40


def _norm(s):
    s = unicodedata.normalize("NFKC", str(s or ""))
    s = re.sub(r"\s+", " ", s.replace("­", "")).strip().lower()
    # Tausendertrennung innerhalb einer Zahl entfernen. Im ersten vollständigen Lauf hat
    # die Textprüfung „Die maximale Fördersumme beträgt 500 000 Euro" als unbelegt gemeldet,
    # obwohl 500000 ein bestätigter Wert war — getrennt durch ein schmales geschütztes
    # Leerzeichen, das NFKC zu einem gewöhnlichen macht. Ein Fehlalarm an genau der Stelle,
    # an der die Prüfung Vertrauen schaffen soll.
    return re.sub(r"(?<=\d)[ .](?=\d{3}\b)", "", s)


def bestaetigte_werte(entwurf, abschnitt_nr):
    """Die bestätigten Felder eines Abschnitts als [{feld, wert, ...}].

    Nur bestätigte: ein Vorschlag, den niemand angenommen hat, gehört nicht in den Text.
    Der Unterschied ist an dieser Stelle besonders wichtig — was hier hineinkommt, liest
    später jemand als Regelung.
    """
    daten = (entwurf.get("sections") or {}).get(str(abschnitt_nr)) or {}
    raus = []
    for feld_id, feld in (daten.get("fields") or {}).items():
        if not feld.get("confirmedByUser"):
            continue
        wert = feld.get("value")
        if wert is None or wert == "" or wert == []:
            continue
        raus.append({
            "feld": feld_id,
            "wert": wert,
            # Herkunft, wie sie der Vorschlagsdienst hinterlassen hat. `source` ist Arvids
            # Feld (user-form, user-chat, ki), `musterbaustein` und `fundstelle` kommen aus
            # unserer Naht.
            "herkunft": feld.get("source"),
            "musterbaustein": feld.get("musterbaustein"),
            "fundstelle": feld.get("fundstelle"),
            "belegzitat": feld.get("belegzitat"),
        })
    return raus


def begruendungen(entwurf, abschnitt_nr):
    """Je Feld: woher der Wert kam und welche Prüfung ihn berührt hat. Gerechnet, nicht erzeugt."""
    vermerk = entwurf.get("vermerk") or []
    befunde = ((entwurf.get("validation") or {}).get("issues")) or []
    raus = []
    for w in bestaetigte_werte(entwurf, abschnitt_nr):
        pruefungen = [v.get("regel") for v in vermerk
                      if v.get("sectionId") == str(abschnitt_nr) and v.get("regel")]
        hinweise = [b.get("regel") or b.get("message") for b in befunde
                    if b.get("sectionId") == str(abschnitt_nr)
                    and b.get("fieldId") == w["feld"]]
        raus.append({**w, "pruefungen": pruefungen, "hinweise": hinweise})
    return raus


def ist_ueberschrift(baustein):
    """Ist dieser Eintrag eine Gliederungsüberschrift statt eines Satzrahmens?

    Die Musterrichtlinie ist eine Tabelle, und in der Spalte „Textbausteine" stehen zwei
    verschiedene Dinge: die Gliederungspunkte des Abschnitts und die Mustersätze selbst.
    `musterbausteine.py` trennt sie nicht, und im Prompt sahen beide gleich aus.

    Die Folge war im Text zu besichtigen: „Finanzierungsart: Anteilfinanzierung. Form der
    Zuwendung: Zuschuss." — das Modell gab die Überschriften als Sätze wieder, weil es sie
    als Satzrahmen bekommen hatte. Es hat nichts falsch gemacht.

    Erkennung über Länge und fehlendes Satzende, nicht über die Nummer: das `.n`-Suffix
    trennt die beiden nicht (9 von 19 Einträgen ohne `.n` sind lange Mustersätze). Die
    längste so erkannte Überschrift hat 66 Zeichen, der kürzeste echte Mustersatz deutlich
    mehr — die Grenze bei 80 liegt komfortabel dazwischen.
    """
    text = (baustein.get("text") or "").strip()
    return len(text) < 80 and not re.search(r"[.!?]\s*$", text)


def _bausteine_text(bausteine):
    """Gliederung und Satzrahmen getrennt — sie haben verschiedene Rollen."""
    gliederung = [t for t in bausteine if ist_ueberschrift(t)]
    saetze = [t for t in bausteine if not ist_ueberschrift(t)]

    teile = []
    if gliederung:
        punkte = "\n".join(f"- {t['nummer']}: {t['text']}" for t in gliederung)
        teile.append("GLIEDERUNG des Abschnitts (Überschriften, KEINE Sätze — sie ordnen "
                     f"den Text, stehen aber nicht in ihm):\n{punkte}")
    for t in saetze:
        block = f"[Musterbaustein {t['nummer']}]\n{t['text']}"
        if t.get("hinweis"):
            block += f"\nHinweis an den Ersteller: {t['hinweis']}"
        teile.append(block)
    return "\n\n".join(teile) if teile else "(keine Musterbausteine für diesen Abschnitt)"


def _klartext(wert, feld):
    """Den Wert so schreiben, wie er im Text erscheinen soll.

    Auswahlfelder tragen Kennungen — `share`, `actual`, `refund`. Die sagen dem Modell
    nichts; es muss aus dem Feldnamen erraten, was gemeint ist. Mit der Beschriftung aus
    der Optionsliste steht stattdessen „Anteilfinanzierung" da.
    """
    optionen = {o.get("value"): (o.get("label") or o.get("value"))
                for o in (feld or {}).get("options") or []}
    if isinstance(wert, list):
        return ", ".join(str(optionen.get(w, w)) for w in wert)
    return str(optionen.get(wert, wert))


def _werte_text(werte, felder=None):
    """Die bestätigten Angaben für den Prompt — mit Beschriftung, nicht mit Feldkennung.

    Vorher stand hier `minimum: 5000`. Im ersten vollständigen Lauf blieb die Bagatellgrenze
    daraufhin als „XX Euro" stehen, obwohl der Wert bestätigt vorlag: das Modell konnte den
    Platzhalter im Musterbaustein nicht mit einer Feldkennung zusammenbringen, die es noch
    nie gesehen hat. Mit „Bagatellgrenze in Euro: 5000" ist der Bezug offensichtlich.
    """
    if not werte:
        return "(keine bestätigten Angaben)"
    nach_id = {f.get("id"): f for f in felder or []}
    zeilen = []
    for w in werte:
        feld = nach_id.get(w["feld"])
        name = (feld or {}).get("label") or w["feld"]
        zeilen.append(f"- {name}: {_klartext(w['wert'], feld)}")
    return "\n".join(zeilen)


def _saetze(text):
    roh = re.split(r"(?<=[.!?])\s+", (text or "").strip())
    return [s.strip() for s in roh if len(s.strip()) >= SATZ_MINDESTLAENGE]


def pruefe_verworfene_optionen(text, felder, werte, bausteine=None):
    """Behauptet der Text etwas, das ausdrücklich nicht gewählt wurde?

    Der Fehler, den der erste vollständige Lauf zutage gefördert hat: in Baustein 5 stand
    `financingType: share`, und im Text stand trotzdem ein Satz zur Festbetragsfinanzierung.
    Er stammte aus einem Musterbaustein, war also sauber gedeckt — `pruefe_text` musste ihn
    durchlassen. Ein Widerspruch zu einer ausdrücklichen Entscheidung, der die Kontrolle
    passiert, ist der teuerste Fehler dieses Werkzeugs.

    Warum hier festgestellt und nicht vorher gefiltert: die Musterrichtlinie sagt nicht,
    welcher Satz zu welchem Zweig gehört — von 68 nennen sechs ihren Zweig. Ein Filter
    bräuchte eine Zuordnung, die es nicht gibt, und würde bei einem Fehlgriff eine Regelung
    still aus der Richtlinie entfernen. Ein sichtbarer Widerspruch ist besser als ein
    unsichtbarer Verlust.

    `felder` sind die Felddefinitionen des Abschnitts, wie sie der Aufrufer ohnehin führt —
    daraus stammen die Beschriftungen der verworfenen Optionen.
    """
    gewaehlt = {w["feld"]: w["wert"] for w in werte}
    befunde = []
    kleintext = _norm(text)
    # Was schon im Satzrahmen steht, ist kein Hinweis auf eine Entscheidung.
    #
    # Erster Lauf über die Oberfläche: gewählt war „Zuwendung nach § 44 LHO", und der Text
    # enthielt „nach Maßgabe dieser Richtlinie und der Verwaltungsvorschriften zu § 44 LHO"
    # — die Standardformel jeder Richtlinie. Gemeldet wurde ein Widerspruch zur Option
    # „Verwaltungsvorschriften". Ein Wächter, der so etwas meldet, wird nicht mehr gelesen.
    rahmen = _norm(" ".join((t.get("text") or "") for t in bausteine or []))
    for f in felder or []:
        optionen = f.get("options") or []
        wert = gewaehlt.get(f.get("id"))
        if not optionen or wert is None:
            continue
        angenommen = wert if isinstance(wert, list) else [wert]
        for o in optionen:
            if o.get("value") in angenommen:
                continue
            beschriftung = (o.get("label") or "").strip()
            # Kurze Beschriftungen („Ja", „Nein", „Land") treffen zu häufig zufällig.
            if len(beschriftung) < 8 or _norm(beschriftung) not in kleintext:
                continue
            if _norm(beschriftung) in rahmen:
                continue
            befunde.append(
                f"{f['id']}: Der Text nennt „{beschriftung}“, gewählt wurde aber "
                f"„{_beschriftung(optionen, angenommen)}“")
    return befunde


# Wie sich das Dokument selbst nennen darf, je Rechtsgrundlage. Aus den Optionswerten von
# `legalBasis` in packages/shared.
_SELBSTBEZEICHNUNG = {
    "lho44": ("Richtlinie", ("verwaltungsvorschrift",)),
    "lho53": ("Richtlinie", ("verwaltungsvorschrift",)),
    "administrative": ("Verwaltungsvorschrift", ("richtlinie",)),
}


def pruefe_selbstbezeichnung(text, werte):
    """Nennt sich der Text so, wie es die Rechtsgrundlage verlangt?

    Der Fall aus dem ersten Word-Export: gewählt war „Zuwendung nach § 44 LHO", im Text stand
    „nach Maßgabe dieser Verwaltungsvorschrift". Die Musterrichtlinie führt beide Varianten
    und lässt die Begriffe über einen Hinweis austauschen — das Modell hat den Hinweis
    verkehrt herum angewandt.

    Ein Wächter über Musterbausteine kann das nicht fangen: beide Varianten SIND
    Musterbausteine, der falsche Text ist also gedeckt. Deshalb hier eine engere Regel, die
    nicht am Satzrahmen hängt, sondern an der Sache — ein Dokument, das sich selbst falsch
    bezeichnet, ist falsch, auch wenn jeder einzelne Satz aus der Vorlage stammt.

    Bewusst nur die Selbstbezeichnung („diese Verwaltungsvorschrift"), nicht der
    Begriffstausch Zuwendung/Finanzierung: „Finanzierung" steht in zu vielen zulässigen
    Zusammenhängen, dort wäre die Regel ein Fehlalarmwerk.
    """
    rgl = next((w["wert"] for w in werte if w["feld"] == "legalBasis"), None)
    eintrag = _SELBSTBEZEICHNUNG.get(rgl)
    if not eintrag:
        return []
    richtig, verboten = eintrag
    kleintext = _norm(text)
    befunde = []
    for wort in verboten:
        # Nur die SELBSTbezeichnung: „dieser Richtlinie", nicht jede Erwähnung. „der
        # Verwaltungsvorschriften zu § 44 LHO" ist die Standardformel und bleibt zulässig.
        for form in (f"diese{n} {wort}" for n in ("r", "")):
            if form in kleintext:
                befunde.append(
                    f"legalBasis: Der Text bezeichnet sich als „{wort.capitalize()}“, "
                    f"nach der gewählten Rechtsgrundlage ist es eine {richtig}")
                break
    return befunde


def pruefe_fehlende_werte(text, felder, werte):
    """Kommt jede bestätigte Angabe im Text vor?

    Das Gegenstück zu `pruefe_verworfene_optionen`, und der Wächter gegen den gefährlicheren
    der beiden Fehler. Als die Regel „ein Musterbaustein ohne Angabe bleibt weg" eingeführt
    wurde, verschwand der bestätigte Fördersatz von 60 Prozent aus Abschnitt 5 — lautlos.
    Ein Widerspruch im Text fällt beim Lesen auf, eine fehlende Regelung nicht.

    Zahlen werden gesucht, Freitext über seine tragenden Wörter: ein Wert wird beim
    Formulieren umgeschrieben, seine Substantive überleben das aber. Die Schranke ist mit
    einem Drittel niedrig angesetzt — gesucht wird das vollständige Fehlen, nicht die
    ungenaue Wiedergabe.
    """
    nach_id = {f.get("id"): f for f in felder or []}
    kleintext = _norm(text)
    textwoerter = set(re.findall(r"\w{5,}", kleintext))
    befunde = []
    for w in werte:
        feld = nach_id.get(w["feld"])
        name = (feld or {}).get("label") or w["feld"]
        klartext = _norm(_klartext(w["wert"], feld))
        if not klartext:
            continue

        zahlen = re.findall(r"\d+", klartext)
        if zahlen:
            fehlend = [z for z in zahlen if z not in kleintext]
            if fehlend:
                befunde.append(f"{w['feld']}: „{name}“ ist bestätigt "
                               f"({_klartext(w['wert'], feld)}), steht aber nicht im Text")
            continue

        woerter = set(re.findall(r"\w{5,}", klartext))
        if not woerter:
            continue
        if len(woerter & textwoerter) / len(woerter) < 1 / 3:
            befunde.append(f"{w['feld']}: „{name}“ ist bestätigt, kommt im Text aber "
                           f"nicht vor")
    return befunde


def _beschriftung(optionen, werte):
    namen = [o.get("label") or o.get("value") for o in optionen if o.get("value") in werte]
    return ", ".join(namen) or ", ".join(str(w) for w in werte)


def pruefe_text(text, bausteine, werte):
    """Lässt sich jeder Satz auf einen Musterbaustein oder eine bestätigte Angabe zurückführen?

    Zeichenvergleich, kein Modellaufruf — dieselbe Begründung wie bei der Abschreibprüfung
    in vorschlag.py: eine Regel, die nicht davon abhängt, wie gut eine Prompt-Formulierung
    befolgt wird.

    Die Prüfung ist bewusst grob. Ein formulierter Satz ist selten wörtlich identisch mit
    seinem Satzrahmen; deshalb wird auf ÜBERLAPPUNG geprüft, nicht auf Gleichheit. Was gar
    keine Überlappung hat, ist entweder frei erfunden oder eine Formulierung, die niemand
    zugeordnet hat — beides gehört gemeldet, nicht verworfen.
    """
    quelle = _norm(" ".join([t.get("text") or "" for t in bausteine]
                            + [str(w["wert"]) for w in werte]))
    quellwoerter = set(re.findall(r"\w{5,}", quelle))
    befunde = []
    for satz in _saetze(text):
        woerter = set(re.findall(r"\w{5,}", _norm(satz)))
        if not woerter:
            continue
        deckung = len(woerter & quellwoerter) / len(woerter)
        if deckung < 0.5:
            befunde.append(f"Satz ohne Rückhalt in Musterbaustein oder Angabe "
                           f"({int(deckung * 100)} % Überlappung): {satz[:120]!r}")
    offen = sorted({m.group(0) for m in PLATZHALTER.finditer(text or "")})
    if offen:
        befunde.append(f"nicht gefüllte Platzhalter: {', '.join(offen)}")
    return befunde


def abschnitt_bauen(entwurf, abschnitt_nr, titel=None, nur_landesrecht=True, felder=None):
    """Einen Abschnitt ausformulieren. Ergibt (text, nachweis).

    `felder`: die Felddefinitionen des Abschnitts aus `packages/shared`. Sie werden nur für
    die Prüfung auf verworfene Optionen gebraucht und sind deshalb freiwillig — fehlen sie,
    entfällt diese eine Prüfung, der Rest läuft.
    """
    bausteine = vorschlag.rahmen(abschnitt_nr, nur_landesrecht)
    werte = bestaetigte_werte(entwurf, abschnitt_nr)

    # Ohne bestätigte Angaben wird nichts geschrieben. Ein Abschnitt allein aus
    # Musterbausteinen wäre die Musterrichtlinie, nicht diese Richtlinie — und er sähe
    # fertig aus, ohne es zu sein.
    if not werte:
        return "", {"uebersprungen": "keine bestätigten Angaben", "begruendungen": [],
                    "befunde": [], "modelle": []}

    prompt = loader.load(
        "richtlinie_abschnitt",
        baustein_nr=abschnitt_nr,
        baustein_titel=titel or f"Abschnitt {abschnitt_nr}",
        musterbausteine=_bausteine_text(bausteine),
        # Die Werte stammen aus einer Chat-Eingabe und sind damit Fremdtext im Prompt —
        # dieselbe Absicherung wie in vorschlag.py und rag_query.py.
        werte=sanitize_and_wrap(_werte_text(werte, felder), tag_name="angaben",
                                max_length=50000).wrapped_content,
    )
    t0 = time.monotonic()
    antwort, modell = chat([{"role": "system", "content": prompt.system},
                            {"role": "user", "content": prompt.user}],
                           temperature=0, mit_modell=True)
    dauer = round(time.monotonic() - t0, 1)

    try:
        daten = json.loads(re.sub(r"^```(?:json)?|```$", "", (antwort or "").strip(),
                                  flags=re.M))
    except json.JSONDecodeError as e:
        return "", {"fehler": f"Antwort war kein JSON: {e}", "begruendungen": [],
                    "befunde": [], "modelle": [modell], "dauer_s": dauer}

    text = (daten.get("text") or "").strip()
    return text, {
        "begruendungen": begruendungen(entwurf, abschnitt_nr),
        "verwendete_bausteine": daten.get("verwendete_bausteine") or [],
        "offene_platzhalter": daten.get("offene_platzhalter") or [],
        "befunde": (pruefe_text(text, bausteine, werte)
                    + pruefe_verworfene_optionen(text, felder, werte, bausteine)
                    + pruefe_fehlende_werte(text, felder, werte)
                    + pruefe_selbstbezeichnung(text, werte)),
        "modelle": [modell],
        "dauer_s": dauer,
    }


def bauen(entwurf, abschnitte=range(1, 9), titel=None, nur_landesrecht=True, felder=None):
    """Die ganze Richtlinie. Ergibt {abschnitte: [...], befunde: [...]}."""
    raus, alle_befunde = [], []
    for nr in abschnitte:
        text, nachweis = abschnitt_bauen(entwurf, nr, (titel or {}).get(nr),
                                         nur_landesrecht, (felder or {}).get(nr))
        raus.append({"nr": nr, "text": text, **nachweis})
        alle_befunde += [f"Abschnitt {nr}: {b}" for b in nachweis.get("befunde", [])]
    return {"abschnitte": raus, "befunde": alle_befunde}


def main():
    p = argparse.ArgumentParser(description="Richtlinie aus einem Entwurf bauen.")
    p.add_argument("--entwurf", required=True, help="JSON-Datei mit dem RichtlinieDraft")
    p.add_argument("--abschnitt", type=int, help="nur dieser Abschnitt")
    args = p.parse_args()

    entwurf = json.loads(Path(args.entwurf).read_text(encoding="utf-8"))
    nummern = [args.abschnitt] if args.abschnitt else range(1, 9)
    ergebnis = bauen(entwurf, nummern)

    for a in ergebnis["abschnitte"]:
        print(f"\n{'=' * 70}\nABSCHNITT {a['nr']}")
        if a.get("uebersprungen"):
            print(f"  übersprungen: {a['uebersprungen']}")
            continue
        print(a["text"] or "(kein Text)")
        if a.get("begruendungen"):
            print("\n  Begründungen:")
            for b in a["begruendungen"]:
                herkunft = b.get("herkunft") or "?"
                mb = f", Musterbaustein {b['musterbaustein']}" if b.get("musterbaustein") else ""
                fs = f", {b['fundstelle']}" if b.get("fundstelle") else ""
                print(f"    {b['feld']}: aus {herkunft}{mb}{fs}")
                if b.get("pruefungen"):
                    print(f"      geprüft: {', '.join(b['pruefungen'])}")
    if ergebnis["befunde"]:
        print(f"\n{'=' * 70}\nBEFUNDE")
        for b in ergebnis["befunde"]:
            print(f"  - {b}")


if __name__ == "__main__":
    main()
