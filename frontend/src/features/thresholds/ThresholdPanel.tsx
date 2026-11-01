/**
 * The `limits` region of the thresholds screen.
 *
 * Loads the stored thresholds through the contract, lets the operator change
 * one step at a time and shows both the current and the factory value. The
 * value displayed by a stepper only moves once the server has accepted the
 * change, so a rejected value keeps its old figure and reports the German
 * `ApiError` message. The humidity limit of the mockup has no threshold in the
 * contract, so it stays visible but disabled with a short hint.
 */

import { useCallback, useEffect, useState, type ReactElement } from "react";

import { ApiError, getThresholds, updateThreshold } from "../../lib/api";
import type { ThresholdKey, ThresholdOut } from "../../lib/types";
import { Banner, EmptyState, Stepper } from "../../ui";

interface LimitSpec {
  key: ThresholdKey;
  slug: string;
  name: string;
  stepperLabel: string;
  description: string;
  step: number;
  min: number;
  max: number;
  decimals: number;
}

const LIMITS: readonly LimitSpec[] = [
  {
    key: "min_temperature",
    slug: "cold",
    name: "Raum zu kalt",
    stepperLabel: "Raum zu kalt",
    description: "Unterschreitet ein Raum diesen Wert, entsteht eine Meldung „Raum zu kalt“.",
    step: 0.5,
    min: 5,
    max: 25,
    decimals: 1,
  },
  {
    key: "max_temperature",
    slug: "hot",
    name: "Raum zu warm",
    stepperLabel: "Raum zu warm",
    description: "Überschreitet ein Raum diesen Wert, entsteht eine Meldung „Raum zu warm“.",
    step: 0.5,
    min: 20,
    max: 35,
    decimals: 1,
  },
  {
    key: "max_co2",
    slug: "co2",
    name: "CO₂",
    stepperLabel: "CO₂-Grenze",
    description: "Steigt die Luftbelastung eines Raums über diesen Wert, meldet das Haus hohes CO₂.",
    step: 50,
    min: 500,
    max: 2500,
    decimals: 0,
  },
  {
    key: "max_power",
    slug: "power",
    name: "Leistung",
    stepperLabel: "Leistungsgrenze",
    description:
      "Zieht das Haus insgesamt mehr als diese Leistung, entsteht eine Meldung „hoher Verbrauch“.",
    step: 100,
    min: 500,
    max: 8000,
    decimals: 0,
  },
];

const HUMIDITY = {
  value: 70,
  min: 40,
  max: 95,
  step: 5,
  unit: "%",
} as const;

function formatValue(value: number, decimals: number, unit: string): string {
  const figured = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return `${figured} ${unit}`;
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

export function ThresholdPanel(): ReactElement {
  const [thresholds, setThresholds] = useState<ThresholdOut[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<ThresholdKey | null>(null);

  useEffect(() => {
    let active = true;

    getThresholds()
      .then((loaded) => {
        if (active) {
          setThresholds(loaded);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setLoadError(
            messageOf(cause, "Die Schwellwerte konnten nicht geladen werden."),
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleChange = useCallback(async (key: ThresholdKey, value: number) => {
    setChangeError(null);
    setPendingKey(key);
    try {
      const updated = await updateThreshold(key, value);
      setThresholds((current) =>
        current ? current.map((entry) => (entry.key === updated.key ? updated : entry)) : current,
      );
    } catch (cause) {
      setChangeError(
        messageOf(cause, "Der Schwellwert konnte nicht geändert werden."),
      );
    } finally {
      setPendingKey(null);
    }
  }, []);

  return (
    <>
      {loadError ? <Banner tone="error">{loadError}</Banner> : null}
      {changeError ? <Banner tone="error">{changeError}</Banner> : null}

      {thresholds === null && !loadError ? (
        <EmptyState>Schwellwerte werden geladen …</EmptyState>
      ) : null}

      {thresholds ? (
        <section className="limits" data-od-id="limits" aria-label="Grenzen der Meldungen">
          {LIMITS.map((spec) => {
            const threshold = thresholds.find((entry) => entry.key === spec.key);
            if (!threshold) {
              return null;
            }

            return (
              <div className="limit" data-od-id={`limit-${spec.slug}`} key={spec.key}>
                <div className="row">
                  <span className="name">{spec.name}</span>
                  <Stepper
                    value={threshold.value}
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    decimals={spec.decimals}
                    unit={threshold.unit}
                    label={spec.stepperLabel}
                    disabled={pendingKey === spec.key}
                    onChange={(value) => {
                      void handleChange(spec.key, value);
                    }}
                  />
                </div>
                <p>{spec.description}</p>
                <p className="limit-default">
                  Standard: {formatValue(threshold.default_value, spec.decimals, threshold.unit)}
                </p>
              </div>
            );
          })}

          <div className="limit" data-od-id="limit-humidity">
            <div className="row">
              <span className="name">Luftfeuchte</span>
              <Stepper
                value={HUMIDITY.value}
                min={HUMIDITY.min}
                max={HUMIDITY.max}
                step={HUMIDITY.step}
                decimals={0}
                unit={HUMIDITY.unit}
                label="Luftfeuchte-Grenze"
                onChange={() => undefined}
                disabled
              />
            </div>
            <p>
              Liegt die Luftfeuchte eines Raums darüber, meldet das Haus hohe Feuchte, etwa im Bad
              nach dem Duschen.
            </p>
            <p className="limit-default">Noch nicht verfügbar – folgt.</p>
          </div>
        </section>
      ) : null}
    </>
  );
}
