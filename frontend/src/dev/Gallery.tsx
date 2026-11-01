/**
 * Development gallery of the UI kit.
 *
 * Renders every component in every state the approved mockup set gives it.
 * The route is registered only in a development build (see App.tsx) and the
 * kit's test renders this gallery.
 */

import { useState, type ReactElement } from "react";

import { Header } from "../layout/Header";
import { Nav } from "../layout/Nav";
import {
  Badge,
  Banner,
  Button,
  Card,
  ChartFrame,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  Group,
  IconButton,
  JumpLinks,
  ListRow,
  PageHead,
  Prose,
  Reading,
  Readout,
  Select,
  SimClock,
  Slider,
  Split,
  Stat,
  Stepper,
  Toast,
  Toggle,
  View,
} from "../ui";

const TEMPERATURE_SERIES = [20.3, 20.4, 20.5, 20.6, 20.8, 21.1, 21.3, 21.2, 21.0, 21.1, 21.4];
const POWER_SERIES = [820, 640, 980, 1420, 1680, 2100, 1860, 1440, 1120, 960, 840];

function PlusIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M5 12h14m-7-7v14"
      />
    </svg>
  );
}

function MinusIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M5 12h14"
      />
    </svg>
  );
}

export function Gallery(): ReactElement {
  const [toggleOn, setToggleOn] = useState(true);
  const [toggleOff, setToggleOff] = useState(false);
  const [toggleSmall, setToggleSmall] = useState(true);
  const [sliderValue, setSliderValue] = useState(70);
  const [weather, setWeather] = useState("cloudy");
  const [seed, setSeed] = useState("4711");
  const [invalidSeed, setInvalidSeed] = useState("vier");
  const [resetAutomations, setResetAutomations] = useState(true);
  const [secondCheckbox, setSecondCheckbox] = useState(false);
  const [dialogNotify, setDialogNotify] = useState(false);
  const [setpoint, setSetpoint] = useState(22);
  const [brightness, setBrightness] = useState(64);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogWhen, setDialogWhen] = useState("window_open");
  const [dialogThen, setDialogThen] = useState("heating_off");
  const [lastAction, setLastAction] = useState<string | null>(null);

  return (
    <View className="gallery">
      <PageHead
        title="Komponenten-Galerie"
        description="Alle Bausteine des UI-Kits in jedem Zustand. Nur in Entwicklungs-Builds erreichbar."
      />

      <Group title="Rahmen" ariaLabel="Rahmen der Anwendung">
        <div className="gallery-preview gallery-stack">
          <Header
            simTime="2026-11-01T07:42:00"
            weekday="Dienstag"
            speed={60}
            paused={false}
            connected
            seed={4711}
          />
          <Header
            simTime="2026-11-01T07:42:00"
            weekday="Dienstag"
            speed={1}
            paused
            connected={false}
            seed={4711}
          />
          <Nav openMessages={2} label="Navigation (Vorschau)" />
          <Nav
            openMessages={2}
            activePath="/messages"
            label="Navigation (Vorschau, aktiv)"
          />
        </div>
        <Card heading="Simulierte Uhrzeit">
          <SimClock simTime="2026-11-01T07:42:00" weekday="Dienstag" />
        </Card>
      </Group>

      <Group title="Aktionen" ariaLabel="Schaltflächen">
        <div className="gallery-stage">
          <Button onClick={() => setLastAction("Simulation pausiert.")}>
            Simulation pausieren
          </Button>
          <Button variant="secondary" onClick={() => setLastAction("Zurücksetzen ausgelöst.")}>
            Zurücksetzen
          </Button>
          <Button size="sm" onClick={() => setLastAction("Meldung bestätigt.")}>
            Bestätigen
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setLastAction("Vorgang abgebrochen.")}
          >
            Abbrechen
          </Button>
          <Button disabled>Nicht verfügbar</Button>
          <Button variant="secondary" disabled>
            Gesperrt
          </Button>
        </div>
        <Button block onClick={() => setDialogOpen(true)}>
          Neue Automation
        </Button>
        <div className="gallery-stage">
          <IconButton
            label="Solltemperatur senken"
            onClick={() => {
              setSetpoint((current) => Math.max(5, current - 0.5));
              setLastAction("Solltemperatur gesenkt.");
            }}
          >
            <MinusIcon />
          </IconButton>
          <IconButton
            label="Solltemperatur erhöhen"
            onClick={() => {
              setSetpoint((current) => Math.min(28, current + 0.5));
              setLastAction("Solltemperatur erhöht.");
            }}
          >
            <PlusIcon />
          </IconButton>
          <IconButton label="Gesperrte Aktion" disabled>
            <PlusIcon />
          </IconButton>
          <IconButton label="Neue Automation" wide onClick={() => setDialogOpen(true)}>
            <PlusIcon />
          </IconButton>
        </div>
        <Banner>{lastAction ?? "Noch keine Aktion ausgelöst."}</Banner>
      </Group>

      <Group title="Anzeigen" ariaLabel="Anzeigebausteine">
        <div className="gallery-stage">
          <Badge tone="hi">hoch</Badge>
          <Badge tone="mid">mittel</Badge>
          <Badge tone="lo">info</Badge>
        </div>
        <div className="gallery-stage">
          <Stat label="Ist" value="21,4 °C" />
          <Stat label="Leistung" value="64" unit="%" />
          <Stat label="Verbrauch" value="340" unit="W" />
        </div>
        <div className="gallery-stage">
          <Reading value="21,4" unit="°C" size="sm" />
          <Reading value="21,4" unit="°C" size="md" />
          <Reading value="2,84" unit="kW" size="lg" />
          <Reading value="46" unit="%" variant="val" />
        </div>
        <Readout
          label="Netzbezug"
          value="2,84"
          unit="kW"
          entries={[
            { label: "Solar", value: "0,42 kW" },
            { label: "Haus", value: "3,26 kW" },
            { label: "Fenster", value: "offen", word: true },
          ]}
        />
        <Split>
          <Card heading="Sensoren · simuliert">
            <ul className="ledger">
              <li>
                <span className="k">Luftfeuchte</span>
                <span className="v">
                  46<small>%</small>
                </span>
              </li>
              <li>
                <span className="k">CO₂</span>
                <span className="v">
                  780<small>ppm</small>
                </span>
              </li>
            </ul>
          </Card>
        </Split>
        <EmptyState>Alles bestätigt — das Haus hat gerade nichts zu melden.</EmptyState>
      </Group>

      <Group title="Eingaben" ariaLabel="Bedienelemente">
        <div className="gallery-stage">
          <Toggle checked={toggleOn} onChange={setToggleOn} label="Licht Wohnzimmer" />
          <Toggle checked={toggleOff} onChange={setToggleOff} label="Steckdose Wohnzimmer" />
          <Toggle
            checked
            onChange={() => undefined}
            label="Rollladen gesperrt"
            disabled
          />
          <Toggle
            checked={false}
            onChange={() => undefined}
            label="Heizung gesperrt"
            disabled
          />
          <Toggle checked={toggleSmall} onChange={setToggleSmall} label="Heizung klein" size="sm" />
        </div>

        <div className="gallery-stack">
          <Slider
            label="Helligkeit Licht in Prozent"
            value={sliderValue}
            onChange={setSliderValue}
          />
          <Slider
            label="Rollladen gesperrt in Prozent"
            value={40}
            onChange={() => undefined}
            disabled
          />
        </div>

        <Select
          label="Wetter"
          value={weather}
          onChange={setWeather}
          options={[
            { value: "sunny", label: "Sonnig" },
            { value: "cloudy", label: "Bewölkt" },
            { value: "rain", label: "Regen" },
            { value: "storm", label: "Gewitter" },
          ]}
        />
        <Select
          label="Gesperrte Auswahl"
          value="cloudy"
          onChange={() => undefined}
          disabled
          options={[{ value: "cloudy", label: "Bewölkt" }]}
        />

        <Field
          label="Seed"
          value={seed}
          onChange={setSeed}
          inputMode="numeric"
          hint="Eine ganze Zahl, zum Beispiel 4711."
        />
        <Field
          label="Seed mit Fehler"
          value={invalidSeed}
          onChange={setInvalidSeed}
          inputMode="numeric"
          error="Der Seed muss eine ganze Zahl sein, zum Beispiel 4711."
        />
        <Field label="Gesperrtes Feld" value="4711" onChange={() => undefined} disabled />

        <Checkbox checked={resetAutomations} onChange={setResetAutomations}>
          Auch Automationen zurücksetzen
        </Checkbox>
        <Checkbox checked={secondCheckbox} onChange={setSecondCheckbox}>
          Nicht gewählt
        </Checkbox>
        <Checkbox checked={false} onChange={() => undefined} disabled>
          Gesperrt
        </Checkbox>

        <Stepper
          label="Solltemperatur"
          value={setpoint}
          min={5}
          max={28}
          step={0.5}
          decimals={1}
          unit="°C"
          onChange={setSetpoint}
        />
        <Stepper
          label="Heizleistung"
          value={brightness}
          min={0}
          max={100}
          step={5}
          unit="%"
          onChange={setBrightness}
        />
        <Stepper
          label="Gesperrter Wert"
          value={18}
          min={5}
          max={25}
          step={0.5}
          decimals={1}
          unit="°C"
          onChange={() => undefined}
          disabled
        />
      </Group>

      <Group title="Struktur" ariaLabel="Seitenstruktur">
        <PageHead
          crumb={{ to: "/", label: "Haus" }}
          title="Wohnzimmer"
          description="Alle Sensorwerte und Geräte des Raums."
        />
        <PageHead
          variant="room"
          name="Wohnzimmer"
          title="Zustand des Raums"
          description="Fenster offen — Heizung heizt gegen."
        />
        <JumpLinks
          links={[
            { to: "/devices/heating-living", label: "Heizung Wohnzimmer", hint: "Gerätedetail" },
            { to: "/thresholds", label: "Schwellwerte", hint: "Grenzen der Meldungen" },
            { to: "/settings", label: "Einstellungen", hint: "Wetter, Seed, Ereignisse" },
          ]}
        />
        <ListRow to="/history" hint="Verlauf">
          Verlauf ansehen
        </ListRow>
        <Prose>
          <p>
            Das Haus ist eine Simulation: Uhrzeit, Temperaturen und Verbrauch entstehen
            fortlaufend neu, ohne echte Hardware und ohne Internet.
          </p>
          <p>Alle Werte auf den Bildschirmen sind deshalb als simuliert gekennzeichnet.</p>
        </Prose>
        <Banner>Gilt sofort für neu entstehende Meldungen</Banner>
        <Banner tone="warning">Der Verlauf wird gerade neu aufgebaut.</Banner>
        <Banner tone="error">Die Verbindung zum Server ist fehlgeschlagen.</Banner>
        <div className="gallery-preview gallery-stack">
          <Toast message="Einstellungen gespeichert." />
          <Toast message="Der Seed muss eine ganze Zahl sein." tone="error" />
        </div>
        <Button onClick={() => setDialogOpen(true)}>Dialog öffnen</Button>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Neue Automation"
          actions={
            <>
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button onClick={() => setDialogOpen(false)}>Regel anlegen</Button>
            </>
          }
        >
          <Select
            label="Wenn"
            value={dialogWhen}
            onChange={setDialogWhen}
            options={[
              { value: "window_open", label: "Fenster offen" },
              { value: "temperature_below", label: "Temperatur unter 18 °C" },
              { value: "co2_above", label: "CO₂ über 1.000 ppm" },
              { value: "time_after", label: "ab 22:00" },
            ]}
          />
          <Select
            label="Dann"
            value={dialogThen}
            onChange={setDialogThen}
            options={[
              { value: "heating_off", label: "Heizung aus" },
              { value: "light_on", label: "Licht an" },
              { value: "shutter_close", label: "Rollladen schließen" },
            ]}
          />
          <Checkbox checked={dialogNotify} onChange={setDialogNotify}>
            Mit Meldung
          </Checkbox>
        </Dialog>
      </Group>

      <Group title="Diagramm" ariaLabel="Diagrammrahmen">
        <ChartFrame
          points={TEMPERATURE_SERIES}
          ariaLabel="Temperaturverlauf Wohnzimmer, letzte Stunde"
          axisLabels={["06:42", "07:12", "07:42"]}
          referenceValue={22}
          legend={[
            { label: "Raumtemperatur Ist" },
            { label: "Solllinie gestrichelt", dashed: true },
          ]}
        />
        <ChartFrame
          points={POWER_SERIES}
          ariaLabel="Leistungsverlauf Wohnzimmer, letzte Stunde"
          axisLabels={["06:42", "07:12", "07:42"]}
          tall
          right
          legend={[{ label: "Verbrauch" }]}
        />
        <ChartFrame points={[]} ariaLabel="Keine Messwerte" />
      </Group>
    </View>
  );
}
