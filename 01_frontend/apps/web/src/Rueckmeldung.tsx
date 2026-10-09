/**
 * Ein Rückmeldeknopf, überall dieselbe Geste.
 *
 * Der ORT entscheidet, welche Wörter zur Wahl stehen und was mitgeschickt wird — die
 * Bearbeiterin sagt nur, was nicht stimmt. Baustein, Feld, Suchtext, Profil, Dokument und
 * Programmstand setzt das Werkzeug selbst.
 *
 * Zwei Klicks bis zur Rückmeldung: Knopf, Wort. Die beiden Textfelder sind freiwillig —
 * braucht eine Rückmeldung mehr, wird sie beim dritten Mal nicht mehr gegeben.
 */
import { useEffect, useRef, useState } from "react";
import {
  RUECKMELDUNGSURTEILE,
  RUECKMELDUNG_MAX_ZEICHEN,
  type Rueckmeldung as Eintrag,
} from "@richtlinie/shared";
import { api } from "./api";

/** Ab hier zeigt das Textfeld, wie viel noch geht. */
const ZAEHLER_AB = RUECKMELDUNG_MAX_ZEICHEN - 200;

/**
 * Schalter für die Erhebung. `VITE_RUECKMELDUNG=false` nimmt sämtliche Knöpfe heraus, ohne
 * dass eine Aufrufstelle angefasst werden muss — die liegen über Formular, Chat und
 * Richtlinientext verteilt. Die Erhebung ist für eine begrenzte Phase gedacht; danach soll
 * sie sich abschalten lassen und nicht ausgebaut werden müssen.
 */
export const RUECKMELDUNG_AKTIV =
  import.meta.env.VITE_RUECKMELDUNG !== "false";

type Props = {
  entwurf: string;
  /** Was die Rückmeldung betrifft — ohne Zeit, Entwurf und Version, die setzt der Server. */
  bezug: Omit<Eintrag, "zeit" | "entwurf" | "version" | "urteil" | "text" | "besser">;
  /** Beschriftung für Hilfstechnik: worauf sich der Knopf bezieht. */
  was: string;
};

function Zaehler({ wert }: { wert: string }) {
  if (wert.length < ZAEHLER_AB) return null;
  const rest = RUECKMELDUNG_MAX_ZEICHEN - wert.length;
  return (
    <small className={rest <= 0 ? "error" : "help"}>
      {rest > 0
        ? `noch ${rest} Zeichen`
        : `Mehr als ${RUECKMELDUNG_MAX_ZEICHEN} Zeichen werden nicht gespeichert.`}
    </small>
  );
}

export function Rueckmeldung({ entwurf, bezug, was }: Props) {
  const [offen, setOffen] = useState(false);
  const [urteil, setUrteil] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [besser, setBesser] = useState("");
  const [stand, setStand] = useState<"offen" | "sendet" | "fertig" | "fehler">("offen");
  // Wie oft hier schon etwas gesagt wurde. Ohne diese Zahl sieht der Knopf nach dem
  // Verschwinden der Bestätigung aus, als wäre nie etwas gemeldet worden.
  const [gesendet, setGesendet] = useState(0);
  const zeitgeber = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(zeitgeber.current), []);

  if (!RUECKMELDUNG_AKTIV) return null;

  const urteile = RUECKMELDUNGSURTEILE[bezug.ort] ?? [];

  async function senden(gewaehlt: string | null) {
    setStand("sendet");
    try {
      const r = await api.rueckmeldung(entwurf, {
        ...bezug,
        ...(gewaehlt ? { urteil: gewaehlt } : {}),
        ...(text.trim() ? { text: text.trim() } : {}),
        ...(besser.trim() ? { besser: besser.trim() } : {}),
      });
      // Ein Schreibfehler im Dienst ist KEIN Fehler der Anfrage — er steht in der Antwort.
      // Wer glaubt, die Rückmeldung sei angekommen, notiert sie sich nicht anders.
      setStand(r.gespeichert ? "fertig" : "fehler");
      if (r.gespeichert) {
        setGesendet((n) => n + 1);
        setOffen(false);
        setUrteil(null);
        setText("");
        setBesser("");
        // Die Bestätigung verschwindet wieder, sonst wäre zum selben Feld nichts mehr zu
        // sagen — beim Durchgehen fällt oft erst später etwas Zweites auf.
        zeitgeber.current = setTimeout(() => setStand("offen"), 2500);
      }
    } catch {
      setStand("fehler");
    }
  }

  if (stand === "fertig")
    return <p className="rueckmeldung rueckmeldung--fertig">Danke, notiert.</p>;

  return (
    <div className="rueckmeldung">
      <button
        type="button"
        className={gesendet ? "rueckmeldung__knopf rueckmeldung__knopf--gesagt"
                            : "rueckmeldung__knopf"}
        aria-expanded={offen}
        onClick={() => setOffen(!offen)}
      >
        Rückmeldung<span className="sr-only">{` zu ${was}`}</span>
        {gesendet > 0 && (
          <>
            {" ✓"}
            {gesendet > 1 && ` ${gesendet}`}
            <span className="sr-only">
              {gesendet === 1 ? " — eine Rückmeldung gesendet"
                              : ` — ${gesendet} Rückmeldungen gesendet`}
            </span>
          </>
        )}
      </button>
      {offen && (
        <div className="rueckmeldung__kasten">
          {urteile.length > 0 && (
            <div className="rueckmeldung__urteile">
              {urteile.map((u) => (
                <button
                  type="button"
                  key={u}
                  className={u === urteil ? "chip chip--gewaehlt" : "chip"}
                  disabled={stand === "sendet"}
                  // Nur auswählen, nicht senden: Wer ein Wort anklickt, will oft noch
                  // etwas dazuschreiben. Abgeschickt wird erst mit „Absenden".
                  // Ein zweiter Klick auf dasselbe Wort nimmt die Auswahl zurück.
                  onClick={() => setUrteil(u === urteil ? null : u)}
                >
                  {u}
                </button>
              ))}
            </div>
          )}
          <label>
            Was stimmt nicht?
            <textarea
              rows={2}
              maxLength={RUECKMELDUNG_MAX_ZEICHEN}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <Zaehler wert={text} />
          <label>
            Wie wäre es richtig?
            <textarea
              rows={2}
              maxLength={RUECKMELDUNG_MAX_ZEICHEN}
              value={besser}
              onChange={(e) => setBesser(e.target.value)}
            />
          </label>
          <Zaehler wert={besser} />
          <div className="actions">
            <button
              type="button"
              disabled={stand === "sendet" || (!urteil && !text.trim() && !besser.trim())}
              onClick={() => void senden(urteil)}
            >
              {stand === "sendet" ? "Sendet …" : "Absenden"}
            </button>
            <button type="button" className="secondary" onClick={() => setOffen(false)}>
              Abbrechen
            </button>
          </div>
          {stand === "fehler" && (
            <p className="error" role="alert">
              Rückmeldung konnte nicht gespeichert werden. Bitte notieren Sie sie anders.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
