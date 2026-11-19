"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownToLine, ArrowUpFromLine, CheckCircle, CloudOff, Database,
  HardDrive, MapPin, MessageSquare, Radio, RefreshCw, Send, ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SyncStatus } from "@/components/ui/sync-status";
import { Textarea } from "@/components/ui/textarea";
import { useConnectivity } from "@/lib/offline/connectivity";
import {
  FIELD_DATA_EVENT, exportFieldPacket, importFieldPacket, listFieldMessages,
  queueFieldMessage, type FieldMessage,
} from "@/lib/offline/field-store";
import { listAll, type QueuedReport } from "@/lib/offline/queue";
import { DATA_CHANGE_EVENT } from "@/lib/offline/mode";

type View = "messages" | "mesh" | "data";
type Location = { latitude: number; longitude: number };

const DEMO_NODES = [
  { x: 74, y: 150 }, { x: 220, y: 70 }, { x: 230, y: 230 },
  { x: 390, y: 110 }, { x: 510, y: 200 },
];
const DEMO_EDGES = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]];

function reportLocation(report: QueuedReport): string | null {
  const fields = report.formDataSerialized;
  const latitude = Number(fields.latitude);
  const longitude = Number(fields.longitude);
  if (fields.latitude !== "" && fields.latitude != null && fields.longitude !== "" && fields.longitude != null
    && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180) {
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }
  return typeof fields.locationText === "string" && fields.locationText ? fields.locationText : null;
}

export function OfflineWorkspace() {
  const { t, i18n } = useTranslation();
  const connectivity = useConnectivity();
  const [view, setView] = useState<View>("messages");
  const [messages, setMessages] = useState<FieldMessage[]>([]);
  const [reports, setReports] = useState<QueuedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [location, setLocation] = useState<Location | undefined>();
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [packetBusy, setPacketBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [demoRunning, setDemoRunning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [storedMessages, storedReports] = await Promise.all([listFieldMessages(), listAll()]);
      if (!mounted.current) return;
      setMessages(storedMessages);
      setReports(storedReports);
    } catch {
      if (mounted.current) setError(t("field_workspace.load_failed", { defaultValue: "Local data could not be read. Check browser storage permissions and try again." }));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onData = () => { clearTimeout(timer); timer = setTimeout(() => { void refresh(); }, 80); };
    const onStorage = (event: StorageEvent) => { if (event.key === FIELD_DATA_EVENT) onData(); };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(DATA_CHANGE_EVENT) : undefined;
    channel?.addEventListener("message", onData);
    window.addEventListener(FIELD_DATA_EVENT, onData);
    window.addEventListener(DATA_CHANGE_EVENT, onData);
    window.addEventListener("storage", onStorage);
    return () => {
      mounted.current = false;
      clearTimeout(timer);
      channel?.close();
      window.removeEventListener(FIELD_DATA_EVENT, onData);
      window.removeEventListener(DATA_CHANGE_EVENT, onData);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  useEffect(() => { void refresh(); }, [connectivity.lastSync, connectivity.pendingCount, refresh]);

  const formatDate = (date: string) => new Date(date).toLocaleString(i18n.language);

  async function saveMessage(type: "TEXT" | "SOS") {
    const text = content.trim() || (type === "SOS"
      ? t("field_workspace.default_sos", { defaultValue: "SOS: assistance requested. Please review my location if attached." })
      : "");
    if (!text || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await queueFieldMessage(text, type, location);
      setContent("");
      setNotice(t("field_workspace.saved_notice", { defaultValue: "Saved on this device. Upload will be attempted in online mode; this does not confirm rescue or delivery to nearby devices." }));
      await refresh();
      if (connectivity.isOnline) void connectivity.syncNow();
    } catch {
      setError(t("field_workspace.save_failed", { defaultValue: "The message could not be saved. Free browser storage and try again." }));
    } finally {
      setSaving(false);
    }
  }

  function attachLocation() {
    if (!navigator.geolocation) {
      setError(t("field_workspace.location_failed", { defaultValue: "Location is unavailable. You can describe your location in the message instead." }));
      return;
    }
    setError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!mounted.current) return;
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setLocating(false);
      },
      () => {
        if (!mounted.current) return;
        setLocating(false);
        setError(t("field_workspace.location_failed", { defaultValue: "Location is unavailable. You can describe your location in the message instead." }));
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 },
    );
  }

  async function exportPacket() {
    setPacketBusy(true);
    setError("");
    try {
      const packet = await exportFieldPacket();
      const url = URL.createObjectURL(new Blob([packet], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `crisismap-field-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setNotice(t("field_workspace.exported_notice", { defaultValue: "Recovery packet downloaded. Keep it somewhere safe; it can contain messages and precise locations." }));
    } catch {
      setError(t("field_workspace.export_failed", { defaultValue: "The recovery packet could not be exported. Please try again." }));
    } finally {
      setPacketBusy(false);
    }
  }

  async function importPacket(file: File | undefined) {
    if (!file) return;
    setPacketBusy(true);
    setError("");
    setNotice("");
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("packet_too_large");
      const count = await importFieldPacket(await file.text());
      setNotice(t("field_workspace.imported_notice", { defaultValue: "Recovery packet imported: {{count}} new records. Existing records were preserved.", count }));
      await refresh();
      if (connectivity.isOnline) void connectivity.syncNow();
    } catch {
      setError(t("field_workspace.import_failed", { defaultValue: "The packet could not be imported. Select a valid CrisisMap recovery JSON file under 25 MB." }));
    } finally {
      setPacketBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="response-page mx-auto max-w-6xl space-y-5">
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="bg-gradient-to-br from-primary/10 via-transparent to-amber-500/10 p-5 sm:p-7">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5 px-2 py-1">
              <Radio aria-hidden="true" className="size-3.5" />
              {t("field_workspace.eyebrow", { defaultValue: "CrisisMap + MeshRelay" })}
            </Badge>
            <Badge variant={connectivity.isOnline ? "secondary" : "outline"}>
              {connectivity.isOnline
                ? t("field_workspace.connected", { defaultValue: "Online sync available" })
                : t("field_workspace.local_mode", { defaultValue: "Working locally" })}
            </Badge>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("field_workspace.title", { defaultValue: "Your offline field workspace" })}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("field_workspace.description", { defaultValue: "Keep reports and field messages together on this device. Switch online to synchronize with CrisisMap, or continue locally when the network is unavailable." })}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild><Link href="/report"><ShieldAlert aria-hidden="true" />{t("field_workspace.new_report", { defaultValue: "Create a damage report" })}</Link></Button>
            <Button variant="outline" disabled={!connectivity.isOnline || connectivity.syncing} onClick={() => { void connectivity.syncNow(); }}>
              <RefreshCw aria-hidden="true" className={connectivity.syncing ? "animate-spin motion-reduce:animate-none" : ""} />
              {t("field_workspace.sync_now", { defaultValue: "Sync now" })}
            </Button>
          </div>
          <p role="status" className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <HardDrive aria-hidden="true" className="size-3.5" />
            {connectivity.offlineReady
              ? t("connectivity_mode.prepare_ready", { defaultValue: "Offline reload ready" })
              : t("connectivity_mode.prepare_pending", { defaultValue: "Offline pages are being prepared. Keep this page open." })}
          </p>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-border border-t border-border bg-background/50">
          {[
            { label: t("field_workspace.saved_reports", { defaultValue: "Local reports" }), value: reports.length },
            { label: t("field_workspace.saved_messages", { defaultValue: "Field messages" }), value: messages.length },
            { label: t("field_workspace.pending_uploads", { defaultValue: "Pending uploads" }), value: connectivity.pendingCount + connectivity.failedCount },
          ].map(({ label, value }) => <div key={label} className="px-3 py-4 text-center"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{loading ? "—" : value}</dd></div>)}
        </dl>
      </section>

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm">{notice}</p>}

      <nav aria-label={t("field_workspace.views", { defaultValue: "Field workspace views" })} className="flex flex-wrap gap-2">
        <Button variant={view === "messages" ? "default" : "outline"} aria-pressed={view === "messages"} onClick={() => setView("messages")}><MessageSquare aria-hidden="true" />{t("field_workspace.messages_tab", { defaultValue: "Messages & SOS" })}</Button>
        <Button variant={view === "mesh" ? "default" : "outline"} aria-pressed={view === "mesh"} onClick={() => setView("mesh")}><Radio aria-hidden="true" />{t("field_workspace.mesh_tab", { defaultValue: "Mesh demonstration" })}</Button>
        <Button variant={view === "data" ? "default" : "outline"} aria-pressed={view === "data"} onClick={() => setView("data")}><Database aria-hidden="true" />{t("field_workspace.data_tab", { defaultValue: "Local data & recovery" })}</Button>
      </nav>

      {view === "messages" && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader><CardTitle>{t("field_workspace.compose_title", { defaultValue: "Save a field message" })}</CardTitle><CardDescription>{t("field_workspace.compose_description", { defaultValue: "Messages are stored locally first and uploaded to a server copy for this device when online. To share with another device, transfer a recovery packet." })}</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void saveMessage("TEXT"); }}>
              <div className="space-y-2"><Label htmlFor="field-message">{t("field_workspace.message_label", { defaultValue: "Message" })}</Label><Textarea id="field-message" rows={5} value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} placeholder={t("field_workspace.message_placeholder", { defaultValue: "Describe the situation, what is needed, and where…" })} aria-describedby="field-message-privacy" /></div>
              <p id="field-message-privacy" className="text-xs leading-relaxed text-muted-foreground">{t("field_workspace.privacy_notice", { defaultValue: "Messages stay in this device’s inbox. Share them deliberately using a recovery packet. An SOS record does not contact emergency services." })}</p>
              <div className="space-y-2">
                <Button type="button" variant="outline" size="sm" disabled={locating || saving} onClick={attachLocation}><MapPin aria-hidden="true" />{locating ? t("field_workspace.locating", { defaultValue: "Getting location…" }) : t("field_workspace.attach_location", { defaultValue: "Attach current location" })}</Button>
                {location && <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-mono">{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</span><Button type="button" variant="ghost" size="sm" onClick={() => setLocation(undefined)}>{t("field_workspace.remove_location", { defaultValue: "Remove location" })}</Button></div>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving || !content.trim()}><Send aria-hidden="true" />{saving ? t("field_workspace.saving", { defaultValue: "Saving…" }) : t("field_workspace.save_message", { defaultValue: "Save message" })}</Button>
                <Button type="button" variant="destructive" disabled={saving} onClick={() => { void saveMessage("SOS"); }}><ShieldAlert aria-hidden="true" />{t("field_workspace.save_sos", { defaultValue: "Save SOS" })}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("field_workspace.inbox_title", { defaultValue: "Field inbox" })}</CardTitle><CardDescription>{t("field_workspace.inbox_description", { defaultValue: "Local messages and this device’s messages downloaded during your last online sync. Server upload confirms storage, not delivery to a person." })}</CardDescription></CardHeader>
          <CardContent className="max-h-[38rem] space-y-3 overflow-auto" aria-busy={loading}>
            {loading ? <p className="text-sm text-muted-foreground">{t("field_workspace.loading", { defaultValue: "Reading local data…" })}</p> : messages.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center"><MessageSquare aria-hidden="true" className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">{t("field_workspace.no_messages", { defaultValue: "No field messages saved yet. Your first message will appear here." })}</p></div> : messages.slice(0, 100).map((message) => <article key={message.id} className={`rounded-xl border p-4 ${message.type === "SOS" ? "border-destructive/30 bg-destructive/5" : "border-border bg-background"}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><Badge variant={message.type === "SOS" ? "destructive" : "secondary"}>{message.type === "SOS" ? t("field_workspace.sos_badge", { defaultValue: "SOS" }) : t("field_workspace.message_badge", { defaultValue: "Field message" })}</Badge><span className="flex items-center gap-1 text-xs text-muted-foreground">{message.status === "synced" ? <CheckCircle aria-hidden="true" className="size-3.5" /> : <CloudOff aria-hidden="true" className="size-3.5" />}{message.status === "synced" ? t("field_workspace.uploaded", { defaultValue: "Stored on server" }) : message.status === "failed" ? t("field_workspace.upload_failed", { defaultValue: "Upload needs attention" }) : t("field_workspace.awaiting_upload", { defaultValue: "Saved locally · awaiting upload" })}</span></div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
              {message.latitude != null && message.longitude != null && <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin aria-hidden="true" className="size-3.5" /><span className="font-mono">{message.latitude.toFixed(5)}, {message.longitude.toFixed(5)}</span></p>}
              <time dateTime={message.createdAt} className="mt-3 block text-xs text-muted-foreground">{formatDate(message.createdAt)}</time>
            </article>)}
            {messages.length > 100 && <p className="text-xs text-muted-foreground">{t("field_workspace.latest_messages", { defaultValue: "Showing the latest 100 messages. Export a recovery packet to retain all local messages." })}</p>}
          </CardContent>
        </Card>
      </div>}

      {view === "mesh" && <Card>
        <CardHeader><div className="flex flex-wrap items-center gap-2"><CardTitle>{t("field_workspace.demo_title", { defaultValue: "How mesh relaying could work" })}</CardTitle><Badge variant="outline">{t("field_workspace.simulation_badge", { defaultValue: "Simulation only" })}</Badge></div><CardDescription>{t("field_workspace.demo_description", { defaultValue: "This retains the MeshRelay topology demonstration. The illustrated nodes and paths are examples; this browser has no active Bluetooth, Wi-Fi Direct, or LoRa transport." })}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
            <svg viewBox="0 0 600 310" role="img" aria-label={t("field_workspace.demo_diagram", { defaultValue: "Illustration of five example nodes connected through relay paths" })} className="mx-auto block w-full max-w-3xl">
              {DEMO_EDGES.map(([from, to]) => <line key={`${from}-${to}`} x1={DEMO_NODES[from].x} y1={DEMO_NODES[from].y} x2={DEMO_NODES[to].x} y2={DEMO_NODES[to].y} stroke="currentColor" strokeWidth={demoRunning ? 3 : 2} className={demoRunning ? "text-primary" : "text-muted-foreground/30"} strokeDasharray={demoRunning ? undefined : "6 5"} />)}
              {DEMO_NODES.map((node, index) => <g key={index}><circle cx={node.x} cy={node.y} r="24" className={index === 0 ? "fill-primary" : "fill-background"} stroke="currentColor" strokeWidth="2" /><text x={node.x} y={node.y + 5} textAnchor="middle" className={index === 0 ? "fill-primary-foreground text-sm font-semibold" : "fill-foreground text-sm font-semibold"}>{index + 1}</text></g>)}
            </svg>
          </div>
          <div className="flex flex-wrap items-center gap-3"><Button variant="outline" aria-pressed={demoRunning} onClick={() => setDemoRunning((value) => !value)}><Radio aria-hidden="true" />{demoRunning ? t("field_workspace.demo_reset", { defaultValue: "Reset demonstration" }) : t("field_workspace.demo_start", { defaultValue: "Show example relay paths" })}</Button><p className="text-xs text-muted-foreground">{t("field_workspace.demo_no_transmission", { defaultValue: "No message is transmitted by this demonstration." })}</p></div>
        </CardContent>
      </Card>}

      {view === "data" && <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>{t("field_workspace.recovery_title", { defaultValue: "Carry your messages with you" })}</CardTitle><CardDescription>{t("field_workspace.recovery_description", { defaultValue: "Export pending reports with their photos and field messages for backup or manual transfer to another device. Import preserves existing records and skips duplicates." })}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-xl border border-border bg-muted/40 p-4"><HardDrive aria-hidden="true" className="mb-2 size-5 text-primary" /><p className="text-sm leading-relaxed text-muted-foreground">{t("field_workspace.recovery_privacy", { defaultValue: "Recovery files may contain personal messages and exact locations. Share them only with intended recipients. Browser storage can be cleared by your device; keep a backup of important records." })}</p></div><div className="flex flex-wrap gap-2"><Button disabled={packetBusy || loading} onClick={() => { void exportPacket(); }}><ArrowDownToLine aria-hidden="true" />{t("field_workspace.export_packet", { defaultValue: "Export recovery packet" })}</Button><Button variant="outline" disabled={packetBusy} onClick={() => fileInput.current?.click()}><ArrowUpFromLine aria-hidden="true" />{t("field_workspace.import_packet", { defaultValue: "Import packet" })}</Button><input ref={fileInput} className="hidden" type="file" accept="application/json,.json" aria-label={t("field_workspace.packet_file", { defaultValue: "CrisisMap recovery packet file" })} onChange={(event) => { void importPacket(event.target.files?.[0]); }} /></div></CardContent></Card>
        <Card><CardHeader><CardTitle>{t("field_workspace.reports_title", { defaultValue: "Reports available on this device" })}</CardTitle><CardDescription>{t("field_workspace.reports_description", { defaultValue: "Coordinates and report details remain available locally. Online map tiles require a connection unless already cached." })}</CardDescription></CardHeader><CardContent className="max-h-[32rem] space-y-3 overflow-auto" aria-busy={loading}>
          {!loading && reports.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">{t("field_workspace.no_reports", { defaultValue: "No local reports yet. Create a report to save its details on this device." })}</p>}
          {reports.slice(0, 100).map((report) => <article key={report.id} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">{typeof report.formDataSerialized.infraName === "string" && report.formDataSerialized.infraName || typeof report.formDataSerialized.crisisName === "string" && report.formDataSerialized.crisisName || t("field_workspace.report_fallback", { defaultValue: "Damage report" })}</h3><SyncStatus status={report.status === "draft" ? "local" : report.status} /></div>{reportLocation(report) && <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin aria-hidden="true" className="size-3.5" />{reportLocation(report)}</p>}<time dateTime={report.createdAt} className="mt-2 block text-xs text-muted-foreground">{formatDate(report.createdAt)}</time></article>)}
          <Button asChild variant="outline" className="w-full"><Link href="/my-reports">{t("field_workspace.all_reports", { defaultValue: "View all my reports" })}</Link></Button>
        </CardContent></Card>
      </div>}
    </div>
  );
}
