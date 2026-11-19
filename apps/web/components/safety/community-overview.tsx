"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CloudCheck,
  Compass,
  HeartHandshake,
  MapPin,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Tent,
  WifiOff,
} from "lucide-react";
import { MapReporterView } from "@/components/composed/map-reporter-view";
import { CrisisSelector } from "@/components/composed/crisis-selector";
import { SafetyCheckIn } from "@/components/safety/safety-check-in";
import { Button } from "@/components/ui/button";
import type { ReportMapFeature } from "@/components/composed/leaflet-report-map";
import { apiClient, type Crisis, type DamageLevel } from "@/lib/api/client";
import { useConnectivity } from "@/lib/offline/connectivity";
import { useDeviceStore } from "@/hooks/use-device-store";
import {
  CHECKLIST,
  EMPTY_PLAN,
  PLAN_KEY,
  SafetyPlanSchema,
} from "@/lib/safety-plan";

export default function CommunityOverview() {
  const { t } = useTranslation();
  const connection = useConnectivity();
  const plan = useDeviceStore(PLAN_KEY, SafetyPlanSchema, EMPTY_PLAN);
  const [features, setFeatures] = useState<ReportMapFeature[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [crisisId, setCrisisId] = useState<string | null>(null);
  const [activeCrisis, setActiveCrisis] = useState<Crisis | null>(null);
  const [crises, setCrises] = useState<Crisis[] | null>(null);
  const [damageFilter, setDamageFilter] = useState<"all" | DamageLevel>("all");
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [date, setDate] = useState("");
  const handleFeatures = useCallback(
    (items: ReportMapFeature[]) => setFeatures(items),
    [],
  );
  const handleMeta = useCallback(
    (meta: { total: number }) => setTotal(meta.total),
    [],
  );
  const handleCrisis = useCallback(
    (crisis: Crisis | null) => setActiveCrisis(crisis),
    [],
  );
  const fitBounds = useMemo<[number, number, number, number] | null>(
    () =>
      activeCrisis?.extentBBox
        ? [
            activeCrisis.extentBBox[1],
            activeCrisis.extentBBox[0],
            activeCrisis.extentBBox[3],
            activeCrisis.extentBBox[2],
          ]
        : null,
    [activeCrisis],
  );
  const readiness = Math.round(
    (plan.value.checked.length / CHECKLIST.length) * 100,
  );

  useEffect(() => {
    setDate(
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date()),
    );
  }, []);
  useEffect(() => {
    let active = true;
    void apiClient.crises
      .list(true)
      .then((items) => {
        if (active) setCrises(items);
      })
      .catch(() => {
        if (active) setCrises(null);
      });
    return () => {
      active = false;
    };
  }, [connection.isOnline, connection.lastSync]);

  return (
    <div className="response-page home-page">
      <a href="#report-list" className="sr-only focus:not-sr-only">
        {t("map.skip_to_list")}
      </a>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <span className="tiny-dot" /> COMMUNITY RESPONSE HUB
          </p>
          <h1>
            A little more prepared.
            <br className="sm:hidden" /> A lot more connected.
          </h1>
          <p>Your community, your updates, and the tools to take action.</p>
        </div>
        <span className="date-label">{date}</span>
      </div>

      <section className="response-hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="hero-kicker">
            <ShieldCheck aria-hidden="true" /> READY WHEN IT MATTERS
          </span>
          <h2 id="hero-title">
            Stronger communities
            <br />
            start with <span>you.</span>
          </h2>
          <p>
            Stay aware. Report what you see. Keep your household ready, even
            when the connection isn’t.
          </p>
          <div className="hero-actions">
            <Button
              asChild
              className="coral-button"
              aria-label={t("reporter.actions.new_report")}
            >
              <Link href="/report">
                <Plus aria-hidden="true" />
                Report an incident
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
            <button
              type="button"
              className="hero-secondary"
              onClick={() => setCheckInOpen(true)}
            >
              <HeartHandshake aria-hidden="true" />
              Check in safely
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="hero-shield">
            <ShieldCheck strokeWidth={1.25} />
          </div>
          <span className="orbit-point point-one">
            <MapPin />
          </span>
          <span className="orbit-point point-two">
            <HeartHandshake />
          </span>
          <span className="orbit-point point-three">
            <Radio />
          </span>
          <span className="hero-coordinate">
            AWARENESS · ACTION · RESILIENCE
          </span>
        </div>
        <span className="hero-footnote">
          <span className="tiny-dot" /> Small actions. Shared resilience.
        </span>
      </section>

      <section className="overview-stats" aria-label="Community overview">
        {[
          {
            icon: Activity,
            tone: "coral",
            label: "Active crises",
            value: crises?.length ?? "—",
            detail: crises
              ? "From the crisis directory"
              : "Directory unavailable",
          },
          {
            icon: MapPin,
            tone: "mint",
            label: "Reports in view",
            value: total ?? "—",
            detail: "Updates within the map area",
          },
          {
            icon: CloudCheck,
            tone: "blue",
            label: "Waiting to sync",
            value: connection.pendingCount + connection.failedCount,
            detail: connection.failedCount
              ? `${connection.failedCount} need review`
              : "Reports & field notes on this device",
          },
          {
            icon: ShieldCheck,
            tone: "lavender",
            label: "My kit readiness",
            value: plan.ready && !plan.error ? `${readiness}%` : "—",
            detail: `${plan.value.checked.length} of ${CHECKLIST.length} essentials packed`,
          },
        ].map((stat) => (
          <article key={stat.label} className="overview-stat">
            <span className={`feature-icon ${stat.tone}`}>
              <stat.icon aria-hidden="true" />
            </span>
            <div>
              <span className="stat-label">{stat.label}</span>
              <strong>{stat.value}</strong>
              <span className="stat-detail">{stat.detail}</span>
            </div>
          </article>
        ))}
      </section>

      <div className="home-columns">
        <div className="home-primary">
          <section
            className="response-card map-card"
            aria-labelledby="situation-title"
          >
            <div className="section-header">
              <div>
                <p className="eyebrow">THE BIG PICTURE</p>
                <h2 id="situation-title">Community situation map</h2>
              </div>
              <Link className="text-link" href="/map">
                Explore map
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>
            <div className="map-toolbar">
              <div className="map-crisis-select">
                <CrisisSelector
                  selectedId={crisisId}
                  onSelect={(id) => {
                    setCrisisId(id);
                    setSelectedId(null);
                    setFeatures([]);
                    setTotal(null);
                  }}
                  onCrisisLoaded={handleCrisis}
                  variant="inline"
                />
              </div>
              <label className="filter-select-label">
                <span className="sr-only">Filter map by damage severity</span>
                <select
                  value={damageFilter}
                  onChange={(event) => {
                    setDamageFilter(event.target.value as "all" | DamageLevel);
                    setFeatures([]);
                    setTotal(null);
                  }}
                >
                  <option value="all">All severities</option>
                  <option value="MINIMAL">Minimal damage</option>
                  <option value="PARTIAL">Partial damage</option>
                  <option value="COMPLETE">Complete damage</option>
                </select>
              </label>
            </div>
            <div className="overview-map">
              <MapReporterView
                aria-label={t("reporter.map.interactive_label")}
                selectedId={selectedId}
                crisisId={crisisId}
                damageFilter={damageFilter}
                fitBounds={fitBounds}
                onSelectReport={setSelectedId}
                onFeaturesLoaded={handleFeatures}
                onMetaLoaded={handleMeta}
                onLiveStatusChange={setLive}
                role="REPORTER"
                legendClassName="bottom-4 start-4"
              />
              <span className="map-status">
                <span className={`tiny-dot ${live ? "" : "muted-dot"}`} />
                {live
                  ? "Live updates connected"
                  : connection.isOnline
                    ? "Browse community reports"
                    : "Offline map · cached tiles"}
              </span>
            </div>
            <div className="map-caption">
              <Compass aria-hidden="true" />
              <span>
                {activeCrisis?.name ||
                  "Select a crisis to focus the map and connect live updates."}
              </span>
            </div>
          </section>

          <section
            className="response-card"
            aria-labelledby="updates-title"
            id="report-list"
          >
            <div className="section-header">
              <div>
                <p className="eyebrow">FROM THE GROUND</p>
                <h2 id="updates-title">Reports in this area</h2>
              </div>
              <span className="count-pill">{features.length} loaded</span>
            </div>
            {features.length ? (
              <div className="incident-list">
                {features.slice(0, 4).map((feature) => (
                  <button
                    type="button"
                    key={feature.id}
                    onClick={() => {
                      setSelectedId(feature.id);
                      document
                        .getElementById("situation-title")
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                    }}
                    className={`incident-row ${selectedId === feature.id ? "selected" : ""}`}
                  >
                    <span
                      className={`feature-icon ${feature.damageLevel === "COMPLETE" ? "coral" : "mint"}`}
                    >
                      <MapPin aria-hidden="true" />
                    </span>
                    <span>
                      <strong>
                        {feature.infraName ||
                          feature.locationText ||
                          "Community damage report"}
                      </strong>
                      <small>
                        {feature.locationText ||
                          `${feature.lat.toFixed(3)}, ${feature.lng.toFixed(3)}`}
                      </small>
                    </span>
                    <span className="incident-severity">
                      {feature.damageLevel === "COMPLETE"
                        ? "Complete damage"
                        : feature.damageLevel === "PARTIAL"
                          ? "Partial damage"
                          : "Minimal damage"}
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="quiet-empty">
                <span className="feature-icon mint">
                  <MapPin aria-hidden="true" />
                </span>
                <div>
                  <h3>
                    {total === null
                      ? "Explore your community"
                      : "No reports in this view"}
                  </h3>
                  <p>
                    Select a crisis or move the map to find reports. New
                    observations help build a clearer picture.
                  </p>
                </div>
                <Link className="text-link" href="/report">
                  Add a report
                  <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            )}
          </section>
        </div>
        <aside className="home-secondary" aria-label="Your response tools">
          <section className="response-card quick-actions">
            <div className="section-header">
              <div>
                <p className="eyebrow">MAKE A DIFFERENCE</p>
                <h2>Take a quick action</h2>
              </div>
            </div>
            <button
              type="button"
              className="action-row"
              onClick={() => setCheckInOpen(true)}
            >
              <span className="feature-icon mint">
                <HeartHandshake aria-hidden="true" />
              </span>
              <span>
                <strong>Let us know you’re safe</strong>
                <small>Save a personal safety check-in</small>
              </span>
              <ArrowUpRight aria-hidden="true" />
            </button>
            <Link href="/resources" className="action-row">
              <span className="feature-icon coral">
                <Tent aria-hidden="true" />
              </span>
              <span>
                <strong>Find your saved resources</strong>
                <small>Shelters, supplies & care contacts</small>
              </span>
              <ArrowUpRight aria-hidden="true" />
            </Link>
            <Link href="/offline" className="action-row">
              <span className="feature-icon blue">
                <Radio aria-hidden="true" />
              </span>
              <span>
                <strong>Open the field workspace</strong>
                <small>Notes, SOS records & recovery files</small>
              </span>
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </section>

          <section className="preparedness-preview">
            <span className="feature-icon lavender">
              <ShieldCheck aria-hidden="true" />
            </span>
            <p className="eyebrow">PEACE OF MIND, PACKED</p>
            <h2>
              Your future self <br />
              will thank you.
            </h2>
            <p>A few essentials today can make a big difference tomorrow.</p>
            <div className="readiness-heading">
              <span>Emergency kit</span>
              <strong>
                {plan.error
                  ? "Unavailable"
                  : `${plan.value.checked.length}/${CHECKLIST.length} ready`}
              </strong>
            </div>
            <div
              className="readiness-track"
              role="progressbar"
              aria-label="Emergency kit preparedness"
              aria-valuenow={readiness}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${readiness}%` }} />
            </div>
            <div className="mini-checklist">
              {CHECKLIST.slice(0, 3).map((item) => (
                <span key={item.id}>
                  <span
                    className={`mini-check ${plan.value.checked.includes(item.id) ? "checked" : ""}`}
                  >
                    {plan.value.checked.includes(item.id) && (
                      <Check aria-hidden="true" />
                    )}
                  </span>
                  {item.label}
                </span>
              ))}
            </div>
            <Link className="text-link" href="/preparedness">
              Build my safety plan
              <ArrowRight aria-hidden="true" />
            </Link>
          </section>

          <section className="device-status">
            <span
              className={`feature-icon ${connection.isOnline ? "mint" : "coral"}`}
            >
              {connection.isOnline ? (
                <CloudCheck aria-hidden="true" />
              ) : (
                <WifiOff aria-hidden="true" />
              )}
            </span>
            <div>
              <h3>
                {connection.isOnline
                  ? "Connected & ready"
                  : "Your work stays with you"}
              </h3>
              <p>
                {connection.offlineReady
                  ? "Offline field workspace is prepared on this device."
                  : "Open the field workspace online to prepare offline access."}
              </p>
              <button
                type="button"
                className="text-link"
                disabled={!connection.isOnline || connection.syncing}
                onClick={() => {
                  void connection.syncNow();
                }}
              >
                <RefreshCw
                  aria-hidden="true"
                  className={connection.syncing ? "animate-spin" : ""}
                />
                {connection.syncing ? "Syncing…" : "Sync saved work"}
              </button>
            </div>
          </section>
        </aside>
      </div>
      <footer className="response-footer">
        <span>
          <ShieldCheck aria-hidden="true" />
          Built for communities. Ready for the unexpected.
        </span>
        <Link href="/offline">
          <ArrowDownToLine aria-hidden="true" />
          Back up field data
        </Link>
      </footer>
      <SafetyCheckIn open={checkInOpen} onOpenChange={setCheckInOpen} />
    </div>
  );
}
