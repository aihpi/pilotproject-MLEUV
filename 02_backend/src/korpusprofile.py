"""Steckbrief je Korpusrichtlinie: welche Werte hat sie gewählt?

Von 48 Formularfeldern sind 27 strukturiert — Auswahl, Zahl oder Datum. Für die ist ein
Textzitat die falsche Antwort: Gefragt ist, was andere Richtlinien gewählt haben, und darauf
antwortet eine Tabelle besser als eine Fundstelle.

Die Profile dienen zwei Zwecken:

- EINGRENZEN. Nur Richtlinien vergleichen, bei denen die schon gesetzten Werte
  übereinstimmen. Dafür wandern sie als Payload in den Index und filtern vor der Suche.
- BEURTEILEN. Zu einer vorgeschlagenen Richtlinie die Kennzahlen zeigen, damit die
  Bearbeiterin die Quelle einschätzen kann, statt sie zu glauben.

Nichts wird geraten: Was sich nicht eindeutig auslesen lässt, bleibt leer. Eine Lücke ist
brauchbar, eine falsche Angabe nicht.

    python src/korpusprofile.py --probe    # zeigen, was erkannt würde
    python src/korpusprofile.py            # schreiben
"""
import argparse
import collections
import os
import re

import yaml

from qdrant_client import QdrantClient

from bmds_prompt_loader import PromptLoader
from bmds_prompt_security import sanitize_and_wrap
from pathlib import Path

from judge_antwort import json_aus
from llm import chat
from config import BASE, QDRANT_URL, COLLECTION, JUDGE_MODEL, JUDGE_FALLBACKS

loader = PromptLoader(Path(BASE) / "prompts", lang="de")

ZIEL = os.path.join(BASE, "korpusprofile_lokal.yaml")

# Auswahlwerte: Begriff -> Kennung. Gesucht wird im ganzen Dokument, nicht nur im zugehörigen
# Abschnitt — „als Anteilfinanzierung gewährt" steht oft schon in Abschnitt 1. Auf Abschnitt 5
# beschränkt lag die Abdeckung bei 19 von 44 Richtlinien, über das ganze Dokument bei 41.
BEGRIFFE = {
    "rechtsgrundlage": {
        "§ 44 LHO": "lho44", "§ 53 LHO": "lho53",
    },
    "finanzierungsart": {
        "Anteilfinanzierung": "share", "Fehlbedarfsfinanzierung": "deficit",
        "Festbetragsfinanzierung": "fixed", "Vollfinanzierung": "full",
    },
    "finanzierungsform": {
        "Zuschuss": "grant", "Zuweisung": "allocation",
    },
    "bemessungsgrundlage": {
        "Spitzabrechnung": "actual", "feste Beträge": "amounts",
        "Pauschalfinanzierung": "lumpsum",
    },
    # Breiter gefasst als die übrigen Listen: Der Empfängerkreis wird in jeder Richtlinie
    # anders benannt. Eine Liste nur mit den Formularbegriffen traf 19 von 44.
    "empfaengerkreis": {
        "Gemeinden": "municipal", "Gemeindeverband": "municipal", "Kommunen": "municipal",
        "kommunale": "municipal", "Landkreise": "municipal", "Ämter": "municipal",
        "juristische Personen des privaten Rechts": "private",
        "eingetragene Vereine": "private", "Vereine": "private", "Verbände": "private",
        "gemeinnützige": "private", "Stiftungen": "private", "Genossenschaften": "private",
        "juristische Personen des öffentlichen Rechts": "public",
        "Anstalten des öffentlichen Rechts": "public",
        "natürliche Personen": "natural", "Einzelunternehmen": "natural",
        "kleine und mittlere Unternehmen": "sme", "KMU": "sme",
        "Unternehmen der gewerblichen Wirtschaft": "sme",
        "Hochschulen": "research", "Forschungseinrichtungen": "research",
        "Universitäten": "research",
    },
    "auszahlung": {
        "Vorschussprinzip": "advance", "Vorschussverfahren": "advance",
        "Erstattungsprinzip": "refund", "Erstattungsverfahren": "refund",
    },
    "antragsverfahren": {
        "Antragsfrist": "deadline", "Windhund": "firstcome",
        "digitales Antragssystem": "digital",
    },
}

# Zahlen. Mehrere Schreibweisen je Größe; gefunden wird die Menge aller Nennungen, nicht ein
# einzelner Wert — eine Richtlinie kann je Fördergegenstand verschiedene Sätze führen.
ZAHLEN = {
    "foerdersatz": re.compile(
        r"(?:bis zu\s+)?(\d{1,3})(?:,\d+)?\s*(?:%|Prozent|v\.?\s?H\.?)", re.I),
    "hoechstbetrag": re.compile(
        r"(?:höchstens|maximal|nicht mehr als)\s+([\d.\s]{3,12})\s*Euro", re.I),
    "bagatellgrenze": re.compile(
        r"Bagatellgrenze[^.]{0,60}?([\d.\s]{3,12})\s*Euro", re.I),
}

# Fördersätze über 100 sind keine: der Ausdruck trifft auch Jahreszahlen und Nummern.
FOERDERSATZ_HOECHSTENS = 100

# Aus welchem Baustein eine ZAHL ausgelesen wird. Nur Zahlen sind mehrdeutig: „90 Prozent"
# kann der Fördersatz sein, eine Kofinanzierungsquote oder ein Schwellenwert. Die Begriffe
# dagegen bedeuten überall dasselbe und werden im ganzen Dokument gesucht — auf den Baustein
# eingegrenzt halbierte sich die Abdeckung, weil „Anteilfinanzierung" oft schon in der
# Präambel steht.
BAUSTEIN = {"foerdersatz": 5, "hoechstbetrag": 5, "bagatellgrenze": 5}


def _zahl(roh):
    ziffern = re.sub(r"[^\d]", "", roh or "")
    return int(ziffern) if ziffern else None


def baustein_von(nummer):
    """Führende Ziffer der Gliederungsnummer als Baustein unserer Struktur."""
    m = re.match(r"(\d+)", str(nummer or ""))
    return int(m.group(1)) if m else None


def text_je_richtlinie(client=None):
    """Text je Richtlinie und Baustein. Ergibt {quelle: {baustein: text}}.

    Baustein None sammelt, was keine Gliederungsnummer trägt — das ist der Rückfall, wenn ein
    Feld in seinem Baustein nicht gefunden wird.
    """
    client = client or QdrantClient(url=QDRANT_URL)
    teile = collections.defaultdict(lambda: collections.defaultdict(list))
    versatz = None
    while True:
        punkte, versatz = client.scroll(
            COLLECTION, limit=2000, offset=versatz,
            with_payload=["quelle", "art", "text", "chunk_index", "nummer"],
            with_vectors=False)
        for p in punkte:
            pl = p.payload or {}
            if pl.get("art") != "richtlinie":
                continue
            b = baustein_von(pl.get("nummer"))
            teile[pl["quelle"]][b].append((pl.get("chunk_index") or 0, pl.get("text") or ""))
        if versatz is None:
            break
    return {q: {b: " ".join(t for _, t in sorted(s)) for b, s in nach_b.items()}
            for q, nach_b in teile.items()}


def profil_aus(nach_baustein):
    """Steckbrief einer Richtlinie. Jedes Feld nur aus seinem Baustein. Lücken bleiben leer."""
    profil = {}
    ganz = " ".join(nach_baustein.values()).lower()
    for feld, begriffe in BEGRIFFE.items():
        klein = ganz
        gefunden = {kennung for wort, kennung in begriffe.items() if wort.lower() in klein}
        if gefunden:
            profil[feld] = sorted(gefunden)
    for feld, muster in ZAHLEN.items():
        text = nach_baustein.get(BAUSTEIN.get(feld)) or ""
        werte = {_zahl(m.group(1)) for m in muster.finditer(text)}
        werte = {w for w in werte if w}
        if feld == "foerdersatz":
            werte = {w for w in werte if w <= FOERDERSATZ_HOECHSTENS}
        if werte:
            profil[feld] = sorted(werte)
    return profil


# Felder ohne festen Wortschatz. Sie werden umschrieben statt benannt — kaum eine Richtlinie
# schreibt „Erstattungsprinzip", sondern „Die Auszahlung erfolgt gegen Nachweis". Über
# Begriffe lagen sie bei 1 bis 2 von 44.
PER_MODELL = {
    "bemessungsgrundlage": (5, {
        "actual": "Spitzabrechnung, Abrechnung der tatsächlichen Ausgaben",
        "amounts": "feste Beträge je Einheit",
        "lumpsum": "Pauschalen für Gemein- oder Restkosten",
    }),
    "auszahlung": (7, {
        "advance": "Vorschussprinzip — Auszahlung vor Verausgabung",
        "refund": "Erstattungsprinzip — Auszahlung gegen Nachweis bezahlter Rechnungen",
    }),
    "antragsverfahren": (7, {
        "schriftlich": "Anträge werden schriftlich eingereicht",
        "digital": "Anträge über ein digitales Antragssystem",
        "frist": "es gilt eine Antragsfrist",
        "windhund": "Bewilligung in der Reihenfolge des Eingangs",
        "kriterien": "Auswahl nach Kriterien oder Rangfolge",
    }),
}

# Wie viel Text dem Modell je Feld vorgelegt wird.
AUSSCHNITT_ZEICHEN = 6000


def per_modell(feld, nach_baustein):
    """Ein Profilfeld aus dem zugehörigen Abschnitt lesen lassen. Ergibt (werte, beleg)."""
    baustein, optionen = PER_MODELL[feld]
    text = (nach_baustein.get(baustein) or "").strip()
    if len(text) < 80:
        return [], ""
    prompt = loader.load(
        "profilfeld", feld=feld,
        optionen="\n".join(f"- {k}: {b}" for k, b in optionen.items()),
        ausschnitt=sanitize_and_wrap(text[:AUSSCHNITT_ZEICHEN], tag_name="abschnitt",
                                     max_length=AUSSCHNITT_ZEICHEN + 200).wrapped_content)
    antwort = chat([{"role": "system", "content": prompt.system},
                    {"role": "user", "content": prompt.user}],
                   model=JUDGE_MODEL, temperature=0, fallbacks=JUDGE_FALLBACKS)
    d = json_aus(antwort) or {}
    werte = [w for w in (d.get("werte") or []) if w in optionen]
    return sorted(set(werte)), (d.get("beleg") or "")[:200]


def schreiben(profile, pfad=ZIEL):
    kopf = ("# Steckbriefe der Korpusrichtlinien — ERZEUGT, nicht von Hand pflegen.\n"
            "# Quelle: src/korpusprofile.py. Nicht im Repo: die Dateinamen benennen Dokumente\n"
            "# aus den nicht zu veröffentlichenden Ordnern.\n"
            "#\n"
            "# Fehlende Felder heißen: nicht eindeutig auslesbar. Nichts ist geraten.\n\n")
    with open(pfad, "w", encoding="utf-8") as f:
        f.write(kopf)
        yaml.safe_dump({"profile": profile}, f, allow_unicode=True, sort_keys=True,
                       default_flow_style=False, width=100)
    return pfad


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--probe", action="store_true", help="nur zeigen, nichts schreiben")
    p.add_argument("--mit-modell", action="store_true",
                   help="die drei Felder ohne festen Wortschatz vom Modell lesen lassen")
    a = p.parse_args()

    texte = text_je_richtlinie()
    profile = {q: profil_aus(nach_b) for q, nach_b in texte.items()}
    if a.mit_modell:
        print(f"Lese {len(PER_MODELL)} Felder über das Modell …", flush=True)
        for i, (q, nach_b) in enumerate(sorted(texte.items()), 1):
            for feld in PER_MODELL:
                werte, beleg = per_modell(feld, nach_b)
                if werte:
                    profile[q][feld] = werte
                    profile[q].setdefault("belege", {})[feld] = beleg
            print(f"  {i}/{len(texte)}", flush=True)
    print(f"\n{len(profile)} Richtlinien.\n")

    felder = list(BEGRIFFE) + list(ZAHLEN)
    print(f"{'Feld':<22}{'erkannt':>9}{'von':>6}")
    for feld in felder:
        n = sum(1 for p_ in profile.values() if feld in p_)
        print(f"{feld:<22}{n:>9}{len(profile):>6}")

    luecken = collections.Counter(len(felder) - len(p_) for p_ in profile.values())
    print(f"\nFehlende Felder je Richtlinie: "
          f"{dict(sorted(luecken.items()))}")

    if a.probe:
        beispiel = next(iter(sorted(profile)))
        print(f"\nBeispiel — {beispiel[:46]}")
        for k, v in sorted(profile[beispiel].items()):
            print(f"  {k:<20} {v}")
        print("\nProbelauf, nichts geschrieben.")
        return
    print(f"\nGeschrieben: {schreiben(profile)}")


if __name__ == "__main__":
    main()
