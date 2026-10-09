# Piano del fork: macOS prima, Windows dopo

Rilevazione: 9 ottobre 2026. Fork: https://github.com/alerunza/min.

## Stato iniziale

- Fork creato e clone locale pronto: Min 1.35.7, commit upstream c92079c. Ramo macos-baseline; origin sul fork, upstream sul progetto originale.
- Clone iniziale shallow (ultima revisione); recuperare la storia completa con `git fetch --unshallow upstream` quando utile.
- Dipendenze, build e avvio non ancora verificati; nessuna issue considerata risolta senza riproduzione e verifica.
- Node locale 24.10.0; .nvmrc upstream indica 15.7.0. Verificare e aggiornare il requisito dopo aver provato installazione e build, senza trattare il vecchio .nvmrc come prova di compatibilità.
- Le segnalazioni upstream spesso riguardano versioni molto precedenti al ramo master.
- La ricerca seleziona etichette OS/Mac e riferimenti macOS/Apple Silicon nel titolo o nel corpo, rimuovendo i commenti del template. Non è una classificazione esaustiva: può includere casi multipiattaforma o semplici menzioni.
- Le richieste di funzionalità vanno distinte da bug, duplicati e limiti di Electron.

## Ordine di lavoro

1. Baseline riproducibile: versione Node prevista dal repository, installazione dipendenze, build, lint e avvio con profilo separato dal Min originale.
2. Crash, perdita dei dati, ripristino di sessioni e aggiornamenti delle dipendenze: #2335, #2286, #2290, #1387.
3. Avvio Apple Silicon e distribuzione macOS: #2507, #1867, #1633; raggruppare i duplicati Gatekeeper #2613, #2606, #1939. Verificare firma Developer ID e notarizzazione per distribuire, senza disattivare le protezioni macOS.
4. Camera e microfono: #1907, #2032, #2043. Verificare permessi del sito, richieste TCC, chiavi Info.plist e app firmata.
5. Prestazioni e interazione: #2625 (profilare prima di intervenire), #2465 (tab non cliccabili), #2180 (Cmd+R), #2097 (scorciatoie), #2639 (opzione gesti).
6. PDF, download, browser predefinito, password manager e compatibilità dei siti; verificare anche le issue comuni a più piattaforme.
7. Rebranding: nome/logo propri, bundle identifier, profilo utente, URL degli aggiornamenti e attribuzioni.
8. Solo dopo la baseline macOS: Windows, installer, aggiornamenti, registrazione dei protocolli, scorciatoie e CI su Windows.

## Criterio di chiusura

Per ogni bug: caso riproducibile sul codice attuale, fix circoscritto, verifica del comportamento e della regressione, stato nel backlog e collegamento al commit. Una build riuscita o il lint non dimostrano che i bug utente siano risolti.

## Segnalazioni candidate

| Issue | Titolo upstream | Etichette | Stato nel fork |
| --- | --- | --- | --- |
| [#2639](https://github.com/minbrowser/min/issues/2639) | (Re-)Add setting to disable swipe gestures for navigation | feature request | Da classificare e riprodurre |
| [#2625](https://github.com/minbrowser/min/issues/2625) | Min running painfully slowly after update to 1.35.1 | bug | Da classificare e riprodurre |
| [#2616](https://github.com/minbrowser/min/issues/2616) | Incorporating URL Filters from List-KR into Min Browser: Guidance on Custom Filters Setup | — | Da classificare e riprodurre |
| [#2613](https://github.com/minbrowser/min/issues/2613) | Can't open | status/duplicate, OS/Mac | Da classificare e riprodurre |
| [#2606](https://github.com/minbrowser/min/issues/2606) | Min needs security update | status/duplicate, OS/Mac | Da classificare e riprodurre |
| [#2596](https://github.com/minbrowser/min/issues/2596) | Access to this site has been restricted | bug | Da classificare e riprodurre |
| [#2507](https://github.com/minbrowser/min/issues/2507) | Cannot Run Dev Mode with Mac Arm Processor | bug | Da classificare e riprodurre |
| [#2501](https://github.com/minbrowser/min/issues/2501) | Dark mode is not working in develepor console | bug, electron | Da classificare e riprodurre |
| [#2480](https://github.com/minbrowser/min/issues/2480) | All open tabs adopt selected tab colour.  | bug | Da classificare e riprodurre |
| [#2466](https://github.com/minbrowser/min/issues/2466) | Installing dependencies  | bug | Da classificare e riprodurre |
| [#2465](https://github.com/minbrowser/min/issues/2465) | open tabs stop being clickable after some time | bug | Da classificare e riprodurre |
| [#2335](https://github.com/minbrowser/min/issues/2335) | A JavaScript error occurred in the main process | bug | Da classificare e riprodurre |
| [#2290](https://github.com/minbrowser/min/issues/2290) | Version 1.28.1 on MacOS 10.14 crashed on page reload and deleted all my tasks | bug | Da classificare e riprodurre |
| [#2286](https://github.com/minbrowser/min/issues/2286) | A Javascript error accured in the main process | bug | Da classificare e riprodurre |
| [#2180](https://github.com/minbrowser/min/issues/2180) | cmd+r strange behavior | bug | Da classificare e riprodurre |
| [#2097](https://github.com/minbrowser/min/issues/2097) | Cannot unset keyboard shortcuts | bug | Da classificare e riprodurre |
| [#2043](https://github.com/minbrowser/min/issues/2043) | Camera and mic on Mac Os not working | — | Da classificare e riprodurre |
| [#2032](https://github.com/minbrowser/min/issues/2032) | Microphone permission can't working with google meeting. | bug | Da classificare e riprodurre |
| [#2027](https://github.com/minbrowser/min/issues/2027) | Min 1.25 is not compatbile with MacOS 15 Catalina  | — | Da classificare e riprodurre |
| [#1994](https://github.com/minbrowser/min/issues/1994) | Running multiple min browser instances on intel mac | — | Da classificare e riprodurre |
| [#1939](https://github.com/minbrowser/min/issues/1939) | Issue with malware protection | — | Da classificare e riprodurre |
| [#1924](https://github.com/minbrowser/min/issues/1924) | Browser default | feature request | Da classificare e riprodurre |
| [#1916](https://github.com/minbrowser/min/issues/1916) | Feedback for two-finger swipe gesture to go back/forward | feature request | Da classificare e riprodurre |
| [#1915](https://github.com/minbrowser/min/issues/1915) | Pinch to zoom - trackpad | feature request | Da classificare e riprodurre |
| [#1912](https://github.com/minbrowser/min/issues/1912) | Right-click menu's open new tab not work | bug | Da classificare e riprodurre |
| [#1911](https://github.com/minbrowser/min/issues/1911) | Min showing notification badge in OSX - what for and how to see notification? | — | Da classificare e riprodurre |
| [#1907](https://github.com/minbrowser/min/issues/1907) | Can't grant access to camera and microphone (Google Meet example) | bug | Da classificare e riprodurre |
| [#1867](https://github.com/minbrowser/min/issues/1867) | Darwin ARM64 build won't launch | bug | Da classificare e riprodurre |
| [#1865](https://github.com/minbrowser/min/issues/1865) | Not downloading file from website | bug | Da classificare e riprodurre |
| [#1817](https://github.com/minbrowser/min/issues/1817) | Inspect element doesn't bring devTools to foreground | bug | Da classificare e riprodurre |
| [#1800](https://github.com/minbrowser/min/issues/1800) | Settings error | bug | Da classificare e riprodurre |
| [#1775](https://github.com/minbrowser/min/issues/1775) | Translation feedback for https://github.com/minbrowser/min/issues/868 | — | Da classificare e riprodurre |
| [#1633](https://github.com/minbrowser/min/issues/1633) | Apple Silicon version doesn't work | bug, help wanted | Da classificare e riprodurre |
| [#1571](https://github.com/minbrowser/min/issues/1571) | can't import bookmarks from safari  | bug | Da classificare e riprodurre |
| [#1500](https://github.com/minbrowser/min/issues/1500) | Can't Debug in VSCode | enhancement, contribution welcome | Da classificare e riprodurre |
| [#1454](https://github.com/minbrowser/min/issues/1454) | Tabs closed when not wanted to | bug | Da classificare e riprodurre |
| [#1439](https://github.com/minbrowser/min/issues/1439) | Dictionary opened on tabs | bug | Da classificare e riprodurre |
| [#1408](https://github.com/minbrowser/min/issues/1408) | "Upgrade to more modern browser" message with MOTU interface | — | Da classificare e riprodurre |
| [#1387](https://github.com/minbrowser/min/issues/1387) | Min opens to a new, empty task | bug | Da classificare e riprodurre |
| [#1354](https://github.com/minbrowser/min/issues/1354) | Question: Set Min as Default browser on Mac | OS/Mac | Da classificare e riprodurre |
| [#1317](https://github.com/minbrowser/min/issues/1317) | Support apple silicon | enhancement | Da classificare e riprodurre |
| [#1234](https://github.com/minbrowser/min/issues/1234) | Min Crash on MacOS Big Sur | OS/Mac | Da classificare e riprodurre |
| [#1204](https://github.com/minbrowser/min/issues/1204) | Implement custom scrollbars for Windows | enhancement, electron | Da classificare e riprodurre |
| [#1193](https://github.com/minbrowser/min/issues/1193) | Prompt() actions on websites lead to unexpected and silent failures | bug, electron | Da classificare e riprodurre |
| [#1128](https://github.com/minbrowser/min/issues/1128) | FAQ | — | Da classificare e riprodurre |
| [#1028](https://github.com/minbrowser/min/issues/1028) | 1password helper installation frozen | bug, OS/Mac | Da classificare e riprodurre |
| [#878](https://github.com/minbrowser/min/issues/878) | macOS shows accessibility permission prompt when playing video | bug, help wanted, OS/Mac | Da classificare e riprodurre |
| [#733](https://github.com/minbrowser/min/issues/733) | For Mac: Please add a YouTube downloader for MP4 + Function so Min is default browser | feature request | Da classificare e riprodurre |
| [#644](https://github.com/minbrowser/min/issues/644) | Inspect browser unable to drag min window | bug, OS/Mac, electron | Da classificare e riprodurre |
| [#643](https://github.com/minbrowser/min/issues/643) | Inspect browser dock to left side overlap | bug | Da classificare e riprodurre |
| [#605](https://github.com/minbrowser/min/issues/605) | v1.8.0-beta1: Portions of previous page are still visible after moving to a different site | bug, OS/Mac | Da classificare e riprodurre |
| [#599](https://github.com/minbrowser/min/issues/599) | ⌘+Shift+N Closes All Tabs In Current Task | enhancement, OS/Mac | Da classificare e riprodurre |
| [#309](https://github.com/minbrowser/min/issues/309) | Feature Request: Ditch the custom title bar and colors | feature request | Da classificare e riprodurre |
| [#88](https://github.com/minbrowser/min/issues/88) | use Safari bookmarks | — | Da classificare e riprodurre |
| [#27](https://github.com/minbrowser/min/issues/27) | On OSX natural/inverted scrolling changes swipe up/down to dismiss tab | bug, OS/Mac | Da classificare e riprodurre |
