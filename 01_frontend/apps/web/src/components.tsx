import type{ReactNode}from"react";import{Link,NavLink}from"react-router-dom";
export function Layout({children}:{children:ReactNode}){return <><a className="skip-link" href="#main">Zum Inhalt springen</a><header className="govbar"><div className="container govbar__inner"><span aria-hidden="true">◆</span><span>Öffentliche Verwaltung</span><span className="prototype">UX-Prototyp</span></div></header><header className="site-header"><div className="container header-row"><Link className="brand" to="/">Richtliniengenerator</Link><nav aria-label="Hauptnavigation"><NavLink to="/">Entwürfe</NavLink><a href="/hilfe">Hilfe</a></nav><span className="user">Dr. Alex Beispiel</span></div></header><main id="main" className="container main">{children}</main><footer><div className="container">KERN-UX-Prototyp · KI-Vorschläge müssen fachlich und rechtlich geprüft werden.</div></footer></>}
export function Alert({title,children,kind="info"}:{title:string;children:ReactNode;kind?:"info"|"warning"|"success"|"error"}){return <section className={`alert alert--${kind}`} role={kind==="error"?"alert":"status"}><strong>{title}</strong><div>{children}</div></section>}
export function Progress({value,label}:{value:number;label:string}){return <div className="progress"><div className="progress__row"><span>{label}</span><strong>{value} %</strong></div><progress max="100" value={value}>{value}%</progress></div>}
export function StatusBadge({status}:{status:string}){const labels:Record<string,string>={empty:"Nicht begonnen",suggested:"Durch Chat vorausgefüllt",warning:"Zu prüfen",invalid:"Unvollständig",confirmed:"Vollständig"};return <span className={`badge badge--${status}`}>{labels[status]??status}</span>}
export function PageHeader({eyebrow,title,children}:{eyebrow?:string;title:string;children?:ReactNode}){return <header className="page-header">{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{children}</header>}
export function ProcessSteps({stage}:{stage:1|2}){return <nav className="process" aria-label="Erstellungsprozess"><ol><li className={stage===1?"process__step process__step--current":"process__step process__step--done"} aria-current={stage===1?"step":undefined}><span className="process__number" aria-hidden="true">{stage===2?"✓":"1"}</span><span><strong>Inhalte erheben</strong><small>Chat, Bausteine und Vollständigkeit</small></span></li><li className={stage===2?"process__step process__step--current":"process__step"} aria-current={stage===2?"step":undefined}><span className="process__number" aria-hidden="true">2</span><span><strong>RL-Entwurf redigieren</strong><small>Prüfen, ändern und erneut prüfen lassen</small></span></li></ol></nav>}

/** Ein aufgeschlagenes Quelldokument im Seitenbereich. */
export type Beleg = { url: string; titel: string };

/**
 * Das Dokument neben dem Entwurf, an der richtigen Seite aufgeschlagen.
 *
 * Aus der Chat-Seite herausgelöst, weil das Formular dasselbe braucht: seit dort Vorschläge
 * geholt werden können, steht auch dort eine Fundstelle — und sie war nur Text, während sie
 * im Chat anklickbar ist. Dieselbe Angabe auf zwei Wegen verschieden nützlich zu machen,
 * wäre der Sorte Unterschied, den niemand erklären kann.
 *
 * Ein <iframe> auf das PDF, weil jeder Browser einen Betrachter mitbringt und `#page=N`
 * versteht. Ein eigener Betrachter im Bündel wäre mehrere hundert Kilobyte für eine Anzeige,
 * die das Betriebssystem schon kann.
 */
export function BelegPanel({
  beleg,
  onClose,
}: {
  beleg: Beleg;
  onClose: () => void;
}) {
  return (
    <aside className="beleg" aria-label={`Belegstelle ${beleg.titel}`}>
      <header className="beleg__kopf">
        <strong>{beleg.titel}</strong>
        <button type="button" className="button button--tertiary" onClick={onClose}>
          Schließen
        </button>
      </header>
      <iframe className="beleg__rahmen" src={beleg.url} title={beleg.titel} />
      <p className="beleg__fuss">
        {/* Für den Fall, dass der eingebaute Betrachter streikt — etwa weil der
            Vorschlagsdienst nicht läuft. */}
        Zeigt der Bereich nichts,{" "}
        <a href={beleg.url} target="_blank" rel="noreferrer">
          öffnen Sie das Dokument in einem neuen Tab
        </a>
        .
      </p>
    </aside>
  );
}
