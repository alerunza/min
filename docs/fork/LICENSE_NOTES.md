# Licenze e identità del fork

Verifica iniziale: 9 ottobre 2026. Non è ancora un inventario completo delle dipendenze e degli asset della release.

## Versione personale e distribuzione

La licenza principale di Min è Apache-2.0. Permette fork, modifiche, distribuzione e uso commerciale. Non impone di pubblicare le modifiche ai file Apache né di contribuire upstream. Non serve aggirare la licenza.

Quando si distribuisce il codice o un'app derivata:

- Allegare Apache-2.0 e conservare gli avvisi di copyright e attribuzione pertinenti.
- Inserire avvisi evidenti nei file modificati.
- Conservare le attribuzioni di un eventuale NOTICE upstream; nessun NOTICE principale risulta nell'albero esaminato.
- Usare nome e logo propri per una nuova identità: Apache-2.0 non concede diritti sui marchi. Descrivere l'origine come fork di Min è consentito nei limiti indicati dalla licenza.

È possibile scegliere termini propri per le proprie modifiche rispettando gli obblighi sul codice ricevuto. Il fork pubblico GitHub rimane pubblico; un'eventuale copia privata separata non elimina gli obblighi quando viene distribuita.

## Componenti inclusi

| Componente | Licenza riscontrata | Azione |
| --- | --- | --- |
| Min | Apache-2.0, LICENSE.txt | Conservare licenza e avvisi; indicare modifiche |
| ext/readability-master | Apache-2.0; copyright Arc90 | Conservare attribuzione anche nella distribuzione compilata |
| ext/abp-filter-parser-modified | MPL-2.0 | Conservare licenza; quando distribuito, rendere disponibili i sorgenti coperti e le modifiche sotto MPL, indicando dove ottenerli |

MPL applica il copyleft ai file coperti: non obbliga a pubblicare tutti i file indipendenti dell'app. Uso e modifiche soltanto personali non richiedono pubblicazione.

Prima della prima release completare l'inventario di Electron/Chromium, dipendenze npm transitive, PDF.js, traduttore e modelli, font/icone, bundle vendorizzati e liste EasyList/EasyPrivacy. La licenza principale non sostituisce le licenze dei componenti.

Se un componente ha condizioni incompatibili con la distribuzione desiderata, le alternative sono rispettarle, ottenere una licenza alternativa dal titolare oppure sostituirlo con un'implementazione indipendente con licenza compatibile. Rimuovere gli avvisi o cambiare nome non elimina gli obblighi.

## Packaging da verificare

scripts/createPackage.js esclude i file Markdown: verificare che le attribuzioni come ext/readability-master/LICENSE.md siano incluse in un file di avvisi distribuito con l'app. Fare questa verifica sull'artefatto effettivo.

## Fonti

- [Licenza di Min](https://github.com/minbrowser/min/blob/master/LICENSE.txt)
- [Apache-2.0, sezioni 2, 4 e 6](https://www.apache.org/licenses/LICENSE-2.0)
- [Licenza del parser](https://github.com/minbrowser/min/blob/master/ext/abp-filter-parser-modified/LICENSE)
- [Licenza Readability](https://github.com/minbrowser/min/blob/master/ext/readability-master/LICENSE.md)
- [Mozilla FAQ MPL-2.0, domande 5–11](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
