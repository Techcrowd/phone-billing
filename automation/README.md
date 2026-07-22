# Phone Bills — Gmail watcher

Automatizace: T-Mobile vyúčtování z e-mailu → aplikace → PDF vyúčtování per skupina → souhrnný e-mail k přeposlání.

## Jak to funguje

1. Denně v 9:00 (launchd na Macu) prohledá Gmail: `from:t-mobile.cz filename:pdf newer_than:60d`
2. PDF přílohy odpovídající `vyuctovani|faktura` nahraje do aplikace (`POST /api/invoices/upload`, `X-Api-Key`, `source=email`)
   - dedup podle čísla daňového dokladu — opakované spuštění nic nerozbije
3. Pro každé nově nahrané období vygeneruje PDF vyúčtování všech (nezaplacených) skupin
4. Pošle jeden e-mail na `notify_email` s PDF v příloze — stačí je přeposlat jednotlivým lidem

## T-Mobile fakturační cyklus (zákazník 56401952)

- Období: 6. dne měsíce – 5. dne následujícího měsíce
- Vystavení vyúčtování: **6. v měsíci**, splatnost 20.
- E-mail s vyúčtováním tedy chodí cca 6.–8. v měsíci; denní běh watcheru to spolehlivě pokryje

⚠️ **Prerekvizita:** V portálu Moje firma (t-mobile.cz) musí být zapnuté zasílání vyúčtování e-mailem
na novak@techcrowd.cz. K 07/2026 vyúčtování e-mailem NECHODILA (jen notifikace) — PDF se stahovala ručně z portálu.

## Konfigurace

- `~/.claude/phone-bills-automation.json` — `{ "api_base", "api_key", "notify_email" }`
  - `api_key` musí odpovídat Fly secretu `AUTOMATION_API_KEY` aplikace `phone-bills-tc`
- `~/.claude/gmail-oauth/` — sdílené Gmail OAuth credentials (scope readonly + compose)
- `~/.claude/phone-bills-automation-state.json` — zpracované Gmail message ids (vzniká automaticky)

## Instalace launchd jobu

```bash
cp automation/cz.techcrowd.phone-bills-watcher.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/cz.techcrowd.phone-bills-watcher.plist
```

## Ruční spuštění / debug

```bash
node automation/watcher.mjs --dry-run   # jen vypíše, co by udělal
node automation/watcher.mjs             # ostrý běh
tail -f ~/Library/Logs/phone-bills-watcher.log
```
