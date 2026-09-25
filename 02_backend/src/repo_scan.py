"""Steht vertraulicher Wortlaut im Repo? — der Scan vor jedem Push.

Zwei Bestände dürfen nicht ins Repo: die DATEINAMEN aus den Ordnern 05 bis 07 und der
WORTLAUT aus den erzeugten `*_lokal.yaml`. Beides ist von Hand kaum zu prüfen — die
Begründungen in den Kommentaren zitieren gern, und genau dort rutscht es durch. Am
24.09.2026 standen elf Fragmente der Musterrichtlinie in frisch geschriebenen Kommentaren
und Tests, alle als erklärendes Beispiel gemeint.

    python src/repo_scan.py              # nur die uncommitteten Änderungen
    python src/repo_scan.py --alles      # der gesamte versionierte Bestand

WAS DER SCAN NICHT KANN, und das ist wichtiger als das, was er kann:

Er findet Überschneidungen, keine Preisgabe. Drei Sorten Fehlalarm sind unvermeidlich, weil
der Vergleich rein mechanisch ist:

1. UNSERE EIGENEN KOPFZEILEN. `musterbausteine.py` schreibt einen Kommentarkopf in die
   erzeugte Datei; der Scan findet ihn dort wieder und meldet die Quelle.
2. ÖFFENTLICHER RECHTSTEXT. „Das Land Brandenburg gewährt nach Maßgabe dieser Richtlinie und
   der Verwaltungsvorschriften zu § 44 der LHO" steht in Dutzenden veröffentlichter
   Richtlinien. Die Vorlage zitiert es, wir zitieren es — aus derselben offenen Quelle.
3. GLEICHE SACHE, EIGENE WORTE. Eine selbst geschriebene Erwartungsantwort trifft den
   Wortlaut der Vorlage, weil beide dieselbe Regelung beschreiben.

Der Scan ersetzt das Urteil also nicht, er engt es ein. Ein Treffer ist eine Frage, keine
Feststellung — und die Frage lautet: steht das hier, WEIL es in der Vorlage steht?
"""
import argparse
import glob
import os
import pathlib
import re
import subprocess

from config import BASE

# Ab wie vielen Zeichen eine Übereinstimmung als Übernahme gilt.
#
# 45. Kürzere Fenster treffen Formeln, die jeder Rechtstext führt („im Sinne von Artikel"),
# längere lassen eine umgestellte Halbzeile durch. Der Wert ist an den elf echten Funden vom
# 24.09.2026 geeicht: sie alle liegen deutlich darüber.
FENSTER = 45

# Wie viele Buchstaben ein Fenster mindestens tragen muss.
#
# Sonst meldet der Scan Trennlinien, Tabellenrahmen und JSON-Gerüst — im ersten Lauf waren
# das 45 der 123 Treffer, und eine Liste, die zu einem Drittel aus Strichen besteht, liest
# niemand zu Ende.
MINDESTBUCHSTABEN = 30

VERTRAULICHE_ORDNER = ("05", "06", "07")

# Dateien, deren Inhalt nicht zeichenweise zu vergleichen ist.
UEBERSPRINGEN = (".png", ".jpg", ".jpeg", ".pdf", ".ico", ".lock", ".svg", ".woff2")


def _norm(s):
    return re.sub(r"\s+", " ", s).strip()


def lokaler_wortlaut():
    """Der Wortlaut aller erzeugten `*_lokal.yaml`, normalisiert."""
    teile = []
    for p in sorted(glob.glob(os.path.join(BASE, "*_lokal.yaml"))):
        teile.append(pathlib.Path(p).read_text(encoding="utf-8", errors="ignore"))
    return _norm("\n".join(teile))


def vertrauliche_namen(datenordner=None):
    """Dateinamen aus den Ordnern 05 bis 07, ohne Endung.

    Ohne Endung, weil im Text meist der Titel steht und nicht der Dateiname mit `.pdf`.
    """
    wurzel = datenordner or os.path.join(BASE, "data", "Daten des MLEUV")
    namen = set()
    if not os.path.isdir(wurzel):
        return namen
    for eintrag in os.listdir(wurzel):
        if not eintrag[:2] in VERTRAULICHE_ORDNER:
            continue
        for w, _, dateien in os.walk(os.path.join(wurzel, eintrag)):
            for d in dateien:
                stamm = os.path.splitext(d)[0].strip()
                # Sehr kurze Namen träfen zu oft zufällig.
                if len(stamm) >= 12:
                    namen.add(stamm)
    return namen


def _zeilen(nur_diff):
    """(datei, zeilennummer, text) — entweder die Änderungen oder der ganze Bestand."""
    if nur_diff:
        diff = subprocess.run(["git", "diff", "HEAD"], capture_output=True, text=True,
                              cwd=os.path.dirname(BASE) or ".").stdout
        datei = "(Änderung)"
        for zeile in diff.splitlines():
            if zeile.startswith("+++ b/"):
                datei = zeile[6:]
            elif zeile.startswith("+") and not zeile.startswith("+++"):
                yield datei, None, zeile[1:]
        return
    wurzel = os.path.dirname(BASE) or "."
    dateien = subprocess.run(["git", "ls-files"], capture_output=True, text=True,
                             cwd=wurzel).stdout.split()
    for f in dateien:
        if f.endswith(UEBERSPRINGEN) or f.endswith("_lokal.yaml"):
            continue
        try:
            inhalt = pathlib.Path(wurzel, f).read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for nr, zeile in enumerate(inhalt.splitlines(), 1):
            yield f, nr, zeile


def scannen(nur_diff=True):
    """Ergibt (wortlaut_treffer, namen_treffer)."""
    lokal = lokaler_wortlaut()
    namen = vertrauliche_namen()
    wortlaut, dateinamen = [], []

    for datei, nr, roh in _zeilen(nur_diff):
        # Kommentarzeichen und Listenstriche weg: sie stehen in der Vorlage nicht und
        # würden ein Fenster sonst um ihre Breite verschieben.
        z = _norm(roh.lstrip("#/*|- \t"))
        for name in namen:
            if name.lower() in z.lower():
                dateinamen.append((datei, nr, name))
        if not lokal or len(z) < FENSTER:
            continue
        for i in range(len(z) - FENSTER + 1):
            fenster = z[i:i + FENSTER]
            if len(re.findall(r"[A-Za-zÄÖÜäöüß]", fenster)) < MINDESTBUCHSTABEN:
                continue
            if fenster in lokal:
                wortlaut.append((datei, nr, fenster))
                break
    return wortlaut, dateinamen


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--alles", action="store_true",
                   help="den ganzen versionierten Bestand prüfen, nicht nur die Änderungen")
    a = p.parse_args()

    wortlaut, dateinamen = scannen(nur_diff=not a.alles)
    umfang = "der gesamte versionierte Bestand" if a.alles else "die uncommitteten Änderungen"
    print(f"Geprüft: {umfang}\n")

    if dateinamen:
        print(f"DATEINAMEN aus den Ordnern 05–07 ({len(dateinamen)}) — diese gehören nie ins Repo:")
        for datei, nr, name in dateinamen:
            ort = f"{datei}:{nr}" if nr else datei
            print(f"  {ort}\n      {name!r}")
        print()
    else:
        print("Dateinamen aus den Ordnern 05–07: keine\n")

    if wortlaut:
        print(f"WORTLAUT aus den lokalen Dateien ({len(wortlaut)}) — jeder Treffer ist eine "
              f"Frage, keine Feststellung:")
        for datei, nr, fenster in wortlaut:
            ort = f"{datei}:{nr}" if nr else datei
            print(f"  {ort}\n      {fenster!r}")
        print("\nSteht das dort, WEIL es in der Vorlage steht? Dann umschreiben. Ist es "
              "öffentlicher\nRechtstext oder unsere eigene Formulierung, darf es bleiben — "
              "siehe Modulkopf.")
    else:
        print("Wortlaut aus den lokalen Dateien: keiner")

    raise SystemExit(1 if dateinamen else 0)


if __name__ == "__main__":
    main()
