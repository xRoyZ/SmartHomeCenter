# SmartHomeCenter

SmartHomeCenter ist ein vollständig lokal laufender Smart-Home-Simulator für Vorführungen.
Ein Python-Backend simuliert ein bewohntes Haus mit sechs Räumen, Wetter, Tag/Nacht,
Sensoren und Geräten als fortlaufende, wiederholbare Simulation; eine deutschsprachige
Web-Oberfläche macht Hausübersicht, Raum- und Gerätedetails, Verläufe und Meldungen live
sichtbar und lässt Geräte, Automationen, Schwellwerte und Simulationsparameter bedienen —
auf Laptop und Handy gleichzeitig, ohne Hardware, Internet, externe Dienste oder
Benutzerkonten.

## Technik

- **Backend:** Python 3.12+, FastAPI, Uvicorn, WebSocket für die Live-Verteilung
- **Datenbank:** SQLite als Datei neben der Anwendung, SQLAlchemy, Schema-Erzeugung beim Start
- **Frontend:** React 18, TypeScript, Vite, Recharts für Verlaufsdiagramme
- **Styling:** eigenes CSS mit Design-Tokens
- **Tests:** pytest (Backend), Vitest (Frontend)
- **Betrieb:** ausschließlich lokal; CSV-Export mit der Python-Standardbibliothek

## Installation

Voraussetzungen: Python 3.12 oder neuer, Node.js 20 oder neuer.

```bash
# Backend
cd backend
python -m pip install -r requirements.txt

# Frontend
cd ../frontend
npm ci
```

## Entwicklung starten

Der kürzeste Weg startet Backend und Frontend gemeinsam aus dem Projektverzeichnis:

```bash
./dev.sh
```

Danach ist die Oberfläche unter <http://localhost:5173> erreichbar, die API unter
<http://localhost:8000>. Das Skript startet die beiden Dienste aus den folgenden
Abschnitten und beendet sie beim Abbrechen des Skripts wieder.

Alternativ lassen sich beide Dienste in zwei Terminals getrennt starten:

```bash
# Terminal 1 – API
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log --log-level warning

# Terminal 2 – Web-Oberfläche
cd frontend
npm run dev
```

Der Parameter `--no-access-log` hält die Protokolle frei von Browserdaten; die Anwendung
protokolliert nur Zeitstempel, HTTP-Methode, Pfad und Statuscode.

## Produktions-Build

```bash
# Frontend bauen (Ergebnis liegt in frontend/dist/)
cd frontend
npm run build

# Backend starten
cd ../backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log --log-level warning
```

Die gebauten Dateien aus `frontend/dist/` werden von einem statischen Webserver
ausgeliefert. Der API-Pfad wird beim Bauen über `VITE_API_BASE` gesetzt.

## Demo-Daten anlegen

Der Seed-Befehl legt das Demo-Haus mit Beispiel-Automationen und -Schwellwerten an,
sodass eine Vorführung ohne Vorbereitung startet:

```bash
cd backend
python -m app.seed
```

Es gibt keine Benutzerkonten und keine Anmeldung.

## Umgebungsvariablen

| Variable | Dienst | Standard | Bedeutung |
| --- | --- | --- | --- |
| `SMARTHOME_DB_PATH` | api | `backend/smarthome.db` | Pfad der SQLite-Datei; relative Pfade gelten ab dem Verzeichnis `backend/` |
| `SMARTHOME_TICK_SECONDS` | api | `1.0` | Reale Sekunden zwischen zwei Simulationsschritten |
| `SMARTHOME_CORS_ORIGINS` | api | `http://localhost:5173` | Kommagetrennte erlaubte Herkünfte der Web-Oberfläche |
| `VITE_API_BASE` | web | `http://localhost:8000` | Basis-URL der API; die WebSocket-URL wird daraus abgeleitet |

Die Konfiguration wird beim Start geprüft. Fehlt ein Pflichtwert oder ist er ungültig,
startet der Dienst nicht und nennt die betroffene Variable.

## Bedienung

Die Oberfläche hat sieben Seiten; die Navigation ist auf jeder Seite erreichbar und auf
schmalen Bildschirmen (ab 360 px) ohne horizontales Scrollen bedienbar:

1. **Hausübersicht** (`/`) – alle sechs Räume mit Temperatur, Luftfeuchte, CO₂,
   Fensterzustand und Klartext-Status, dazu die Summen für Verbrauch, Solar und Netz.
2. **Raumdetail** (`/rooms/:roomId`) – alle Sensorwerte, alle Geräte mit Reglern und der
   Zustand zusätzlich in Klartext („Fenster offen“, „Heizung heizt“).
3. **Gerätedetail** (`/devices/:deviceId`) – Gerätezustand, Verlaufsdiagramm und die letzte
   Aktion.
4. **Verlauf** (`/history`) – Temperatur, Luftfeuchte, CO₂ und Verbrauch für 15 Minuten,
   1 Stunde oder 1 Tag; der CSV-Export lädt die gerade gewählte Messreihe herunter.
5. **Meldungen** (`/messages`) – offene und bestätigte Meldungen mit Zeitpunkt, Raum und
   Schweregrad; offene Meldungen lassen sich bestätigen.
6. **Automationen** (`/automations`) – Automationen anlegen, ändern, aktivieren,
   deaktivieren und löschen sowie das Ausführungsprotokoll einsehen.
7. **Einstellungen** (`/settings`) – Wetterlage, Jahreszeit, Bewohnerverhalten,
   Geschwindigkeit (1×, 10×, 60×, 300×), Pause/Fortsetzen, Zurücksetzen, Schwellwerte und
   Ereignisse auslösen.

Der Simulationshinweis und die simulierte Uhrzeit sind auf jeder Seite sichtbar.

## API

Alle Antworten sind JSON. Fehler haben immer dieselbe Form:

```json
{ "error": { "code": "unknown_device", "message": "Das Gerät wurde nicht gefunden." } }
```

Die Meldung ist deutsch; ein Stacktrace, ein Dateipfad, SQL-Text oder eine rohe
Exception-Meldung wird nie ausgeliefert.

| Methode | Pfad | Anfrage | Antwort |
| --- | --- | --- | --- |
| GET | `/api/health` | – | `{"status":"ok","sim_time":"2026-06-15T08:00:00"}` |
| GET | `/api/state` | – | `HouseState` |
| GET | `/api/rooms/{room_id}` | – | `RoomDetail` |
| GET | `/api/devices/{device_id}` | – | `DeviceDetail` |
| PUT | `/api/devices/{device_id}/state` | `{"is_on":true}` / `{"level":60}` / `{"target_temp":21.5}` | `DeviceDetail` |
| GET | `/api/history?room_id=living_room&metric=temperature&window=1h` | – | `HistorySeries` |
| GET | `/api/history/export?room_id=living_room&metric=all&window=1h` | – | CSV-Datei als Download |
| GET | `/api/messages?status=open` | – | `MessageOut[]` |
| POST | `/api/messages/{message_id}/ack` | – | `MessageOut` |
| GET | `/api/thresholds` | – | `ThresholdOut[]` |
| PUT | `/api/thresholds/{key}` | `{"value":19.5}` | `ThresholdOut` |
| GET | `/api/automations` | – | `AutomationOut[]` |
| POST | `/api/automations` | `AutomationInput` | `AutomationOut` (201) |
| PUT | `/api/automations/{automation_id}` | `AutomationInput` | `AutomationOut` |
| DELETE | `/api/automations/{automation_id}` | – | 204 |
| GET | `/api/automations/{automation_id}/executions` | – | `ExecutionOut[]` |
| GET | `/api/settings` | – | `SettingsOut` |
| PUT | `/api/settings` | Teile von `{"weather":"rain","speed":60,"seed":7}` | `SettingsOut` |
| POST | `/api/simulation/control` | `{"action":"pause"}` oder `{"action":"resume"}` | `SettingsOut` |
| POST | `/api/simulation/reset` | `{"reset_automations":false,"reset_thresholds":false}` | `{"state":HouseState,"settings":SettingsOut}` |
| POST | `/api/events/{event_type}` | `{"room_id":"kitchen"}` | `{"message":MessageOut,"state":HouseState}` (201) |

`event_type` ist eines von `forgotten_window`, `water_damage`, `power_spike`,
`smoke_alarm`, `occupant_rush`. Messgrößen sind `temperature`, `humidity`, `co2` und
`power`; Zeitfenster sind `15m`, `1h` und `1d`.

### Beispiel: Gerät schalten

```bash
curl -X PUT http://localhost:8000/api/devices/living_room_light/state \
  -H "Content-Type: application/json" \
  -d '{"is_on": true}'
```

```json
{
  "device": {
    "id": "living_room_light",
    "room_id": "living_room",
    "name": "Licht",
    "type": "light",
    "is_on": true,
    "level": 100,
    "target_temp": null,
    "power_w": 40.0,
    "state_text": "Licht an"
  },
  "room_name": "Wohnzimmer",
  "series": [],
  "last_action": { "sim_time": "2026-06-15T08:05:00", "text": "Licht eingeschaltet" }
}
```

### Live-Verbindung

`ws://localhost:8000/ws` sendet beim Verbinden und nach jedem Simulationsschritt einen
Snapshot `{"type":"snapshot","payload":HouseState}`. Der Client darf
`{"type":"ping"}` senden und erhält `{"type":"pong","sim_time":"..."}`. Jede andere,
ungültige oder zu große Nachricht beantwortet der Server mit
`{"type":"error","error":{"code":"validation_error","message":"..."}}`, ohne die
Verbindung oder andere Clients zu schließen.

## Funktionsumfang

- Sechs Räume mit Heizung, Licht, Rollladen sowie Steckdosen und Haushaltsgeräten
- Fortlaufende Simulation von Uhrzeit, Wochentag, Wetter, Jahreszeit, Tag/Nacht und Solarertrag
- Physik für Raumtemperatur, Luftfeuchte, CO₂ und Stromverbrauch inklusive Fenstereinfluss
- Automatisches Bewohnerverhalten (Fenster, Türen, Bewegung, Gerätenutzung)
- Automationen mit Bedingungen (Fenster, Temperatur, CO₂, Uhrzeit) und Aktionen
- Schwellwert-Meldungen und manuell auslösbare Ereignisse mit Bestätigung
- Verlaufsaufzeichnung, Diagramme und CSV-Export pro Raum, Messgröße und Zeitraum
- Live-Synchronisation mehrerer Browser über WebSocket
- Pause, Geschwindigkeiten 1×/10×/60×/300× und vollständiges Zurücksetzen
- Wiederholbarkeit über einen sichtbaren, einstellbaren Seed
- Speicherung von Zustand, Automationen, Schwellwerten und Verlauf in SQLite
- Fehlerantworten ohne interne Details; Protokolle ohne IP-Adresse, User-Agent,
  Cookie- oder Sitzungskennung

## Tests und Prüfungen

```bash
# Backend
cd backend
PYTHONPATH=. python -m pytest
python -m ruff format --check .
python -m ruff check .

# Frontend
cd ../frontend
npm test
npm run build
```
