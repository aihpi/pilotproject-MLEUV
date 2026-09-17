"""Feld-Eval: landet der richtige Wert im richtigen Feld?

`eval.py` misst das Retrieval, `judge_antwort.py` die Antwortqualität. Beide sagen nichts
über die Schicht, die das Werkzeug tatsächlich braucht — den Vorschlag je Formularfeld. Der
kann falsch sein, während das Retrieval tadellos arbeitet: beim ersten Probelauf stand im
Zuwendungszweck eine Maßnahmenliste aus einer FREMDEN Richtlinie, sauber belegt, mit
Konfidenz 0,99. Kein Fall im Fragenkatalog hätte das gemeldet.

Geprüft wird über Eigenschaften, nicht über den Wortlaut — „Verbesserung des Tierschutzes"
und „Tierschutz verbessern" sind beide richtig. Kein bewertendes Modell: alle Prüfungen sind
Zeichenvergleiche. Das ist enger als ein Judge, dafür wiederholbar und ohne zweite
Fehlerquelle.

    python src/eval_feld.py                 # alle Fälle
    python src/eval_feld.py --fall F-02     # ein Fall
    python src/eval_feld.py --laeufe 3      # jeden Fall mehrfach (Streuung sichtbar machen)
"""
import argparse
from collections import Counter
import os

import yaml

import vorschlag
from vorschlag import UNKLAR, normalisieren, _norm, _woertlich_in
from config import BASE

FAELLE = os.path.join(BASE, "eval", "feldfaelle.yaml")


def laden(pfad=FAELLE):
    with open(pfad, encoding="utf-8") as f:
        daten = yaml.safe_load(f)
    return daten["felder"], daten["faelle"]


def pruefe_feld(erwartung, v, bloecke_text):
    """Ergibt [(bestanden, kennung, beobachtung), …] für ein Feld.

    Die `kennung` benennt die Prüfung und ist über Läufe hinweg gleich; die `beobachtung`
    trägt, was tatsächlich herauskam. Anfangs steckte beides in einem Text — dann bekam
    jeder abweichende Lauf einen eigenen Schlüssel, und die Auswertung meldete „0 von 1"
    statt „2 von 3".
    """
    ergebnisse = []
    wert = "" if v is None else str(v.get("wert") or "")
    ist_unklar = normalisieren(wert).lower() == UNKLAR.lower()

    if v is None:
        return [(False, "Vorschlag geliefert", "keiner")]

    if "unklar" in erwartung:
        soll = bool(erwartung["unklar"])
        ergebnisse.append((ist_unklar == soll, f"[Unklar] erwartet={soll}",
                           f"erhalten={ist_unklar}"))

    if "wert" in erwartung:
        ergebnisse.append((normalisieren(wert) == normalisieren(erwartung["wert"]),
                           f"Wert {erwartung['wert']!r}", f"erhalten {wert[:50]!r}"))

    for teil in erwartung.get("enthaelt", []):
        ergebnisse.append((_norm(teil) in _norm(wert), f"enthält {teil!r}", wert[:50]))

    for teil in erwartung.get("nicht", []):
        ergebnisse.append((_norm(teil) not in _norm(wert), f"enthält NICHT {teil!r}", wert[:50]))

    if erwartung.get("eigenstaendig"):
        # Der Kern: der Wert darf nicht wörtlich aus einer abgerufenen Passage stammen.
        #
        # Ohne Belegtext ist die Prüfung NICHT anwendbar, und sie darf dann auch nicht als
        # bestanden zählen. Sonst gewinnt ein Durchgang ohne Belege genau dort geschenkt, wo
        # der Vergleich hinschaut: es gibt nichts, woraus abgeschrieben werden könnte, also
        # besteht die Prüfung immer. Drei von zwanzig Prüfungen im Satz hängen daran.
        if not (bloecke_text or "").strip():
            ergebnisse.append((None, "eigenständig formuliert", "ohne Belege nicht prüfbar"))
        else:
            abgeschrieben = bool(wert) and not ist_unklar and _woertlich_in(wert, bloecke_text)
            ergebnisse.append((not abgeschrieben, "eigenständig formuliert",
                               "abgeschrieben" if abgeschrieben else "eigen"))

    if erwartung.get("gedeckt"):
        ergebnisse.append((bool(v.get("deckung")), "Deckung nachgewiesen",
                           str(v.get("deckung"))[:40]))

    k = v.get("konfidenz")
    if "min_konfidenz" in erwartung:
        ergebnisse.append((k is not None and k >= erwartung["min_konfidenz"],
                           f"Konfidenz >= {erwartung['min_konfidenz']}", f"ist {k}"))
    if "max_konfidenz" in erwartung:
        ergebnisse.append((k is not None and k <= erwartung["max_konfidenz"],
                           f"Konfidenz <= {erwartung['max_konfidenz']}", f"ist {k}"))
    return ergebnisse


def lauf(fall, felder_def, ausfuehrlich=False, konsens=False, mit_belegen=True):
    felder = [felder_def[i] for i in fall["felder"]]
    vorschlaege, nachweis = vorschlag.vorschlagen(
        fall["abschnitt_nr"], fall["eingabe"].strip(), felder, konsens=konsens,
        mit_belegen=mit_belegen)
    nach_feld = {v["feld"]: v for v in vorschlaege}
    # Derselbe Belegtext, den das Modell gesehen hat — aus dem Nachweis, nicht neu geholt.
    bloecke_text = nachweis.get("belegtext", "")

    zeilen, bestanden, gesamt, entfallen = [], 0, 0, 0
    for feld_id, erwartung in (fall.get("erwartet") or {}).items():
        for ok, kennung, beobachtung in pruefe_feld(
                erwartung, nach_feld.get(feld_id), bloecke_text):
            # `None` heißt „nicht anwendbar" — zählt weder als bestanden noch als Versuch,
            # sonst wäre die Quote zweier Durchgänge nicht vergleichbar.
            if ok is None:
                entfallen += 1
                zeilen.append((None, feld_id, kennung, beobachtung))
                continue
            gesamt += 1
            bestanden += ok
            zeilen.append((ok, feld_id, kennung, beobachtung))
    if ausfuehrlich:
        for v in vorschlaege:
            print(f"      {v['feld']:11} K{v['konfidenz']} {str(v['wert'])[:70]!r}")
        for b in nachweis.get("befunde", []):
            print(f"      ! {b}")
    return bestanden, gesamt, zeilen, nachweis.get("modelle") or [], entfallen


def main():
    p = argparse.ArgumentParser(description="Feld-Eval für die Vorschlagsnaht.")
    p.add_argument("--fall", help="nur dieser Fall (ID)")
    p.add_argument("--laeufe", type=int, default=3,
                   help="wie oft jeder Fall läuft. Vorgabe 3: ein Einzellauf ist bei diesem "
                        "Modell keine Aussage — derselbe Fall lieferte dreimal Verschiedenes")
    p.add_argument("--konsens", action="store_true",
                   help="Vorschlag je Lauf per Mehrheitsentscheid holen (dreifache Kosten)")
    p.add_argument("--ohne-belege", action="store_true",
                   help="ohne Fundstellen im Prompt — misst, ob die Suche beim Formulieren "
                        "etwas beiträgt (sie kostet die halbe Antwortzeit)")
    p.add_argument("--ausfuehrlich", action="store_true", help="Vorschläge und Befunde zeigen")
    args = p.parse_args()

    felder_def, faelle = laden()
    if args.fall:
        faelle = [f for f in faelle if f["id"] == args.fall]
        if not faelle:
            print(f"Kein Fall mit ID {args.fall}")
            return

    summe_b = summe_g = 0
    wackelig = []
    for fall in faelle:
        print(f"\n{fall['id']}")
        # Je Prüfung zählen, wie oft sie bestanden wurde. Eine Prüfung, die mal grün und mal
        # rot ist, ist etwas anderes als eine, die immer rot ist — und nur die Aufschlüsselung
        # zeigt den Unterschied.
        quoten, fehlgeschlagen, gesehene_modelle, nicht_pruefbar = {}, 0, [], set()
        for n in range(args.laeufe):
            try:
                b, g, zeilen, modelle, _entfallen = lauf(
                    fall, felder_def, args.ausfuehrlich, args.konsens,
                    mit_belegen=not args.ohne_belege)
            except Exception as e:                      # Endpunkt weg, Zeitlimit, JSON kaputt
                print(f"  Lauf {n + 1}: FEHLER {type(e).__name__}: {str(e)[:80]}")
                fehlgeschlagen += 1
                continue
            gesehene_modelle += modelle
            summe_b, summe_g = summe_b + b, summe_g + g
            for ok, feld_id, kennung, beobachtung in zeilen:
                if ok is None:                      # nicht anwendbar, siehe `lauf`
                    nicht_pruefbar.add(f"{feld_id}: {kennung} — {beobachtung}")
                    continue
                schluessel = (feld_id, kennung)
                treffer, versuche, gesehen = quoten.get(schluessel, (0, 0, []))
                if not ok:
                    gesehen.append(beobachtung)
                quoten[schluessel] = (treffer + ok, versuche + 1, gesehen)

        gueltige = args.laeufe - fehlgeschlagen
        for (feld_id, kennung), (treffer, versuche, gesehen) in quoten.items():
            if treffer == versuche:
                continue
            marke = "✗" if treffer == 0 else "~"
            print(f"      {marke} {feld_id}: {kennung}  [{treffer}/{versuche} Läufe]")
            for b in dict.fromkeys(gesehen):
                print(f"          {b}")
            if 0 < treffer < versuche:
                wackelig.append(f"{fall['id']} {feld_id}: {kennung}")
        stabil = sum(1 for t, v, _ in quoten.values() if t == v)
        print(f"  {stabil}/{len(quoten)} Prüfungen in allen {gueltige} Läufen bestanden")
        # Ausgewiesen, nicht verschwiegen: eine entfallene Prüfung ist kein Erfolg, und ein
        # Vergleich zweier Durchgänge ist nur mit dieser Zahl zu lesen.
        for n in sorted(nicht_pruefbar):
            print(f"  entfallen: {n}")
        # Welches Modell geantwortet hat, gehört neben jede Messung: wechselt der Cluster
        # still das Modell, verschieben sich die Zahlen ohne Zutun des Prompts.
        verteilung = Counter(gesehene_modelle)
        if verteilung:
            print("  Modell: " + ", ".join(f"{m} ×{n}" for m, n in verteilung.most_common()))

    if summe_g:
        print(f"\n{summe_b}/{summe_g} Einzelprüfungen bestanden "
              f"({100 * summe_b // summe_g} %)")
    if wackelig:
        print(f"\n{len(wackelig)} Prüfungen schwanken zwischen den Läufen — hier sagt eine "
              f"einzelne Messung nichts:")
        for w in wackelig:
            print(f"  ~ {w}")
    print("\nFreitext wird über Eigenschaften geprüft, nicht über den Wortlaut — "
          "die Quote misst Regeltreue, nicht Sprachqualität.")


if __name__ == "__main__":
    main()
