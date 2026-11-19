"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AlertCircle, ArrowLeft, ArrowRight, HardDrive, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { DamageSelector } from "@/components/composed/damage-selector";
import { PhotoUpload } from "@/components/composed/photo-upload";
import { CrisisSearch } from "@/components/composed/crisis-search";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  apiClient,
  ApiError,
  type ModularSchemaData,
} from "@/lib/api/client"
import {
  clearDraftPhoto,
  enqueueReport,
  getById,
  getDraft,
  getPhotoBlob,
  loadDraftPhoto,
  patchReport,
  saveDraftPhoto,
  saveSyncedReport,
} from "@/lib/offline/queue";
import { getRetryDelayMs, registerBackgroundSync } from "@/lib/offline/sync";
import { useConnectivity } from "@/lib/offline/connectivity";
import { isOfflineMode } from "@/lib/offline/mode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MapPicker, type Coordinates } from "./map-picker";
import { ProgressIndicator } from "./progress-indicator";
import { DRAFT_STORAGE_KEY, getOrCreateReporterId } from "@/lib/wizard-draft";

type WizardStep = 0 | 1 | 2 | 3;
type InfraType =
  | "RESIDENTIAL"
  | "COMMERCIAL"
  | "GOVERNMENT"
  | "UTILITY"
  | "TRANSPORT_COMMUNICATION"
  | "COMMUNITY"
  | "PUBLIC_RECREATION"
  | "OTHER";

type CrisisType =
  | "EARTHQUAKE"
  | "FLOOD"
  | "TSUNAMI"
  | "HURRICANE_CYCLONE"
  | "WILDFIRE"
  | "EXPLOSION"
  | "CHEMICAL_INCIDENT"
  | "CONFLICT"
  | "CIVIL_UNREST";

type PressingNeed =
  | "FOOD_WATER"
  | "CASH_ASSISTANCE"
  | "HEALTHCARE_MEDICINES"
  | "SHELTER_REPAIR"
  | "LIVELIHOODS_RESTORATION"
  | "WASH"
  | "BASIC_SERVICES"
  | "PROTECTION_PSYCHOSOCIAL"
  | "LOCAL_AUTHORITY_SUPPORT"
  | "OTHER";

interface DraftState {
  step: WizardStep;
  crisisId: string;
  crisisName: string;
  damageLevel: "MINIMAL" | "PARTIAL" | "COMPLETE" | null;
  infraType: InfraType;
  crisisType: CrisisType;
  hasDebris: boolean;
  electricityCondition:
  | "NO_DAMAGE"
  | "MINOR_DAMAGE"
  | "MODERATE_DAMAGE"
  | "SEVERE_DAMAGE"
  | "COMPLETELY_DESTROYED"
  | "UNKNOWN";
  healthServicesFunctioning:
  | "FULLY_FUNCTIONAL"
  | "PARTIALLY_FUNCTIONAL"
  | "LARGELY_DISRUPTED"
  | "NOT_FUNCTIONING"
  | "UNKNOWN";
  pressingNeeds: PressingNeed[];
  pressingNeedsOther: string;
  description: string;
  descriptionLang: string;
  infraName: string;
  latitude: string;
  longitude: string;
  locationText: string;
  dynamicValues: Record<string, string>;
}

const INFRA_TYPES: InfraType[] = [
  "RESIDENTIAL",
  "COMMERCIAL",
  "GOVERNMENT",
  "UTILITY",
  "TRANSPORT_COMMUNICATION",
  "COMMUNITY",
  "PUBLIC_RECREATION",
  "OTHER",
];

const CRISIS_TYPES: CrisisType[] = [
  "EARTHQUAKE",
  "FLOOD",
  "TSUNAMI",
  "HURRICANE_CYCLONE",
  "WILDFIRE",
  "EXPLOSION",
  "CHEMICAL_INCIDENT",
  "CONFLICT",
  "CIVIL_UNREST",
];

const PRESSING_NEEDS: PressingNeed[] = [
  "FOOD_WATER",
  "CASH_ASSISTANCE",
  "HEALTHCARE_MEDICINES",
  "SHELTER_REPAIR",
  "LIVELIHOODS_RESTORATION",
  "WASH",
  "BASIC_SERVICES",
  "PROTECTION_PSYCHOSOCIAL",
  "LOCAL_AUTHORITY_SUPPORT",
  "OTHER",
];

function createDefaultDraft(language: string): DraftState {
  return {
    step: 0,
    crisisId: "",
    crisisName: "",
    damageLevel: null,
    infraType: "RESIDENTIAL",
    crisisType: "EARTHQUAKE",
    hasDebris: false,
    electricityCondition: "UNKNOWN",
    healthServicesFunctioning: "UNKNOWN",
    pressingNeeds: ["FOOD_WATER"],
    pressingNeedsOther: "",
    description: "",
    descriptionLang: language || "en",
    infraName: "",
    latitude: "",
    longitude: "",
    locationText: "",
    dynamicValues: {},
  };
}

export function ReporterWizard() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentLanguage = i18n?.language || "en";

  // Always start from the server-safe default so SSR and client render
  // the same initial HTML (step 0 / "Step 1 of 4"). The sessionStorage
  // draft is restored in the useEffect below, after hydration.
  const [draft, setDraft] = useState<DraftState>(() =>
    createDefaultDraft(currentLanguage),
  );
  const [step, setStep] = useState<WizardStep>(0);
  const [schema, setSchema] = useState<ModularSchemaData | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [coords, setCoords] = useState<Coordinates | null>(null);

  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "success" | "queued" | "error"
  >("idle");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  // Always start `true` so server HTML matches the client's first render.
  // The effect below syncs the real value after hydration.
  const { isOnline } = useConnectivity();
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!photo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function handlePhotoChange(file: File | null) {
    setPhoto(file);
    if (file) {
      void saveDraftPhoto(file);
    } else {
      void clearDraftPhoto();
    }
  }

  // Restore sessionStorage draft after hydration (avoids SSR mismatch)
  useEffect(() => {
    const saved = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as DraftState;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDraft(parsed);
        if (typeof parsed.step === "number") {
          setStep(parsed.step as WizardStep);
        }
        // Restore photo from IndexedDB — File objects can't survive sessionStorage
        loadDraftPhoto()
          .then((blob) => {
            if (blob) {
              setPhoto(
                new File([blob], "draft-photo.webp", {
                  type: blob.type || "image/webp",
                }),
              );
            }
          })
          .catch(() => undefined);
      } catch {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    const fallback = createDefaultDraft(currentLanguage);

    async function loadIndexedDraft() {
      const requestedDraftId = searchParams.get("draftId");
      const queuedDraft = requestedDraftId
        ? await getById(requestedDraftId)
        : await getDraft();

      if (!active || !queuedDraft) return;

      const serialized = queuedDraft.formDataSerialized;
      const nextDraft: Partial<DraftState> = {
        crisisId:
          typeof serialized.crisisId === "string"
            ? serialized.crisisId
            : fallback.crisisId,
        crisisName:
          typeof serialized.crisisName === "string"
            ? serialized.crisisName
            : fallback.crisisName,
        damageLevel:
          serialized.damageLevel === "MINIMAL" ||
            serialized.damageLevel === "PARTIAL" ||
            serialized.damageLevel === "COMPLETE"
            ? serialized.damageLevel
            : fallback.damageLevel,
        infraType:
          typeof serialized.infraType === "string"
            ? (serialized.infraType as InfraType)
            : fallback.infraType,
        crisisType:
          typeof serialized.crisisType === "string"
            ? (serialized.crisisType as CrisisType)
            : fallback.crisisType,
        hasDebris: Boolean(serialized.hasDebris),
        description:
          typeof serialized.description === "string"
            ? serialized.description
            : fallback.description,
        descriptionLang:
          typeof serialized.descriptionLang === "string"
            ? serialized.descriptionLang
            : fallback.descriptionLang,
        infraName:
          typeof serialized.infraName === "string"
            ? serialized.infraName
            : fallback.infraName,
        locationText:
          typeof serialized.locationText === "string"
            ? serialized.locationText
            : fallback.locationText,
      };

      setDraft((prev) => ({ ...prev, ...nextDraft }));

      if (
        typeof serialized.latitude === "number" &&
        typeof serialized.longitude === "number"
      ) {
        const restored = {
          lat: serialized.latitude,
          lon: serialized.longitude,
        };
        setCoords(restored);
        setDraft((prev) => ({
          ...prev,
          latitude: String(restored.lat),
          longitude: String(restored.lon),
        }));
      }

      const blob = await getPhotoBlob(queuedDraft.photoBlobKey);
      if (blob && active) {
        const restoredPhoto = new File([blob], "queued-report-photo.webp", {
          type: blob.type || "image/webp",
        });
        setPhoto(restoredPhoto);
      }
    }

    loadIndexedDraft();

    return () => {
      active = false;
    };
  }, [currentLanguage, searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const nextDraft: DraftState = { ...draft, step };
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(nextDraft));
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, step]);

  useEffect(() => {
    let active = true;
    if (!draft.crisisId || !draft.infraType) return;

    async function loadSchema() {
      try {
        const data = await apiClient.crises.modularSchema(
          draft.crisisId,
          draft.infraType,
        );
        if (!active) return;
        setSchema(data);
      } catch {
        if (!active) return;
        setSchema(null);
      }
    }

    loadSchema();
    return () => {
      active = false;
    };
  }, [draft.crisisId, draft.infraType, isOnline]);

  const stepLabel = useMemo(() => {
    if (step === 0) return t("reporter.wizard.step.photo_location");
    if (step === 1) return t("reporter.wizard.step.damage");
    if (step === 2) return t("reporter.wizard.step.details");
    return t("reporter.wizard.step.review");
  }, [step, t]);

  const canMoveNext = useMemo(() => {
    if (step === 0) {
      return (
        Boolean(photo) &&
        (Boolean(coords) || draft.locationText.trim().length > 0)
      );
    }
    if (step === 1) {
      return Boolean(draft.crisisId) && draft.damageLevel !== null;
    }
    if (step === 2) {
      return (
        draft.infraName.trim().length > 0 &&
        draft.pressingNeeds.length > 0 &&
        (!draft.pressingNeeds.includes("OTHER") ||
          draft.pressingNeedsOther.trim().length > 0) &&
        Object.entries(schema?.dynamicFields ?? {}).every(
          ([key, field]) => {
            if (!field.required) return true;
            const val = draft.dynamicValues[key] ?? "";
            if (field.type === "boolean") return val === "true" || val === "false";
            return val.trim().length > 0;
          },
        )
      );
    }
    return true;
  }, [coords, draft, photo, schema, step]);

  function updateDraft<K extends keyof DraftState>(
    key: K,
    value: DraftState[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function togglePressingNeed(value: PressingNeed) {
    setDraft((prev) => {
      const exists = prev.pressingNeeds.includes(value);
      const next = exists
        ? prev.pressingNeeds.filter((item) => item !== value)
        : [...prev.pressingNeeds, value];
      return { ...prev, pressingNeeds: next };
    });
  }

  async function submit() {
    if (!photo || !draft.damageLevel) return;

    setSubmitState("submitting");

    const idempotencyKey = crypto.randomUUID();
    const collectedAt = new Date().toISOString();

    const reporterId = getOrCreateReporterId();

    const formData = new FormData();
    formData.set("photo", photo);
    formData.set("reporterId", reporterId);
    formData.set("crisisId", draft.crisisId);
    formData.set("damageLevel", draft.damageLevel);
    formData.set("infraType", draft.infraType);
    formData.set("crisisType", draft.crisisType);
    formData.set("hasDebris", String(draft.hasDebris));
    formData.set("collectedAt", collectedAt);
    formData.set("descriptionLang", draft.descriptionLang || "en");
    formData.set("electricityCondition", draft.electricityCondition);
    formData.set("healthServicesFunctioning", draft.healthServicesFunctioning);
    formData.set("pressingNeeds", JSON.stringify(draft.pressingNeeds));
    if (
      draft.pressingNeeds.includes("OTHER") &&
      draft.pressingNeedsOther.trim().length > 0
    ) {
      formData.set("pressingNeedsOther", draft.pressingNeedsOther.trim());
    }

    formData.set("infraName", draft.infraName.trim());

    if (draft.description.trim().length > 0) {
      formData.set("description", draft.description.trim());
    }

    if (coords) {
      formData.set("latitude", String(coords.lat));
      formData.set("longitude", String(coords.lon));
    } else if (draft.latitude && draft.longitude) {
      formData.set("latitude", draft.latitude);
      formData.set("longitude", draft.longitude);
    }

    if (draft.locationText.trim().length > 0) {
      formData.set("locationText", draft.locationText.trim());
    }

    const nonEmptyDynamic = Object.fromEntries(
      Object.entries(draft.dynamicValues).filter(
        ([, value]) => value.trim().length > 0,
      ),
    );
    if (Object.keys(nonEmptyDynamic).length > 0) {
      formData.set("extraFields", JSON.stringify(nonEmptyDynamic));
    }

    const serializedDraft = {
      reporterId,
      crisisName: draft.crisisName,
      crisisId: draft.crisisId,
      damageLevel: draft.damageLevel,
      infraType: draft.infraType,
      crisisType: draft.crisisType,
      hasDebris: draft.hasDebris,
      collectedAt,
      description: draft.description.trim() || undefined,
      descriptionLang: draft.descriptionLang || "en",
      electricityCondition: draft.electricityCondition,
      healthServicesFunctioning: draft.healthServicesFunctioning,
      pressingNeeds: draft.pressingNeeds,
      pressingNeedsOther: draft.pressingNeedsOther,
      infraName: draft.infraName,
      latitude: coords?.lat ?? (draft.latitude.trim() ? Number(draft.latitude) : undefined),
      longitude: coords?.lon ?? (draft.longitude.trim() ? Number(draft.longitude) : undefined),
      locationText: draft.locationText,
      extraFields: nonEmptyDynamic,
    };

    if (isOfflineMode()) {
      let queueId: string;
      try { queueId = await enqueueReport(serializedDraft, photo, idempotencyKey); }
      catch { toast.error(t("connectivity_mode.save_failed", { defaultValue: "Unable to save on this device. Keep this form open and check browser storage." })); setSubmitState("error"); return; }
      void registerBackgroundSync();
      setSubmitState("queued");
      sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      router.push(
        `/report/success?reportId=${encodeURIComponent(queueId)}&status=queued&offline=1`,
      );
      return;
    }

    try {
      const response = await apiClient.reports.submit(formData, idempotencyKey);
      setSubmitState("success");
      sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      await saveSyncedReport(
        response.id,
        { ...serializedDraft, crisisName: draft.crisisName },
        photo,
      );
      void clearDraftPhoto();
      router.push(
        `/report/success?reportId=${encodeURIComponent(response.id)}&status=synced&crisisId=${encodeURIComponent(draft.crisisId)}&reporterId=${encodeURIComponent(reporterId)}`,
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 400 || error.status === 422)
      ) {
        const message = error.message || t("error.submission_failed");
        toast.error(message);
        setSubmitState("error");
        return;
      }

      if (error instanceof ApiError && error.status === 429) {
        let queuedId: string;
        try {
          queuedId = await enqueueReport(serializedDraft, photo, idempotencyKey);
          await patchReport(queuedId, { lastError: error.code || "too_many_requests", retryCount: 1, nextRetryAt: Date.now() + getRetryDelayMs(1) });
        } catch {
          toast.error(t("connectivity_mode.save_failed", { defaultValue: "Unable to save on this device. Keep this form open and check browser storage." }));
          setSubmitState("error");
          return;
        }
        void registerBackgroundSync();
        setSubmitState("queued");
        toast.warning(t("error.too_many_requests"));
        router.push(
          `/report/success?reportId=${encodeURIComponent(queuedId)}&status=queued&offline=1`,
        );
        return;
      }

      let queueId: string;
      try { queueId = await enqueueReport(serializedDraft, photo, idempotencyKey); }
      catch { toast.error(t("connectivity_mode.save_failed", { defaultValue: "Unable to save on this device. Keep this form open and check browser storage." })); setSubmitState("error"); return; }
      void registerBackgroundSync();
      setSubmitState("queued");
      router.push(
        `/report/success?reportId=${encodeURIComponent(queueId)}&status=queued&offline=1`,
      );
    }
  }

  const stepTitles = [
    t("reporter.wizard.step.photo_location"),
    t("reporter.wizard.step.damage"),
    t("reporter.wizard.step.details"),
    t("reporter.wizard.step.review"),
  ];

  return (
    <div className="reporter-wizard flex min-h-[calc(100dvh-var(--header-height))] flex-col">
      {/* Sticky progress — always visible while scrolling */}
      <div className="sticky top-(--header-height) z-10 bg-background">
        <ProgressIndicator
          steps={stepTitles}
          currentStep={step}
          onStepClick={(i) => setStep(i as WizardStep)}
        />
      </div>

      {/* Scrollable step content */}
      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:px-6">

        {/* Step title */}
        <h2 className="mb-5 text-lg font-semibold text-foreground">
          {stepLabel}
        </h2>

        {step === 0 && (
          <div className="flex flex-col gap-5">
            <PhotoUpload value={photo} onChange={handlePhotoChange} required />
            <MapPicker
              onSelect={(value) => {
                if (!value) return;
                setCoords(value);
                updateDraft("latitude", String(value.lat));
                updateDraft("longitude", String(value.lon));
              }}
              initialCoordinates={coords}
            />
            <label className="flex flex-col gap-1 text-sm text-foreground">
              <span>{t("step.location.location_text_instructions")}</span>
              <Textarea
                value={draft.locationText}
                onChange={(event) =>
                  updateDraft("locationText", event.target.value)
                }
                placeholder={t("step.location.location_text_placeholder")}
                rows={3}
              />
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <DamageSelector
              value={draft.damageLevel}
              onChange={(value) => updateDraft("damageLevel", value)}
              required
              helpText={t("wizard.help.damage_level")}
            />

            {/* Active crisis — full width */}
            <label className="flex flex-col gap-1 text-sm text-foreground">
              <span className="flex items-center gap-1">
                {t("reporter.wizard.fields.crisis")}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={t("wizard.help.active_crisis")}
                        className="ms-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground"
                      >
                        <HelpCircle aria-hidden="true" className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="w-52 text-xs leading-relaxed">{t("wizard.help.active_crisis")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
              <CrisisSearch
                value={draft.crisisId}
                onChange={(id) => updateDraft("crisisId", id)}
                onSelect={(crisis) => updateDraft("crisisName", crisis?.name ?? "")}
                coords={coords ? { lat: coords.lat, lng: coords.lon } : undefined}
              />
            </label>

            {/* Infrastructure type + Crisis type — side by side */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-foreground">
                <span className="flex items-center gap-1">
                  {t("step.infraType.title")}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={t("wizard.help.infra_type")}
                          className="ms-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground"
                        >
                          <HelpCircle aria-hidden="true" className="size-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="w-52 text-xs leading-relaxed">{t("wizard.help.infra_type")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <Select
                  value={draft.infraType}
                  onValueChange={(value) => updateDraft("infraType", value as InfraType)}
                >
                  <SelectTrigger aria-label={t("step.infraType.title")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INFRA_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`wizard.option.infra.${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="flex flex-col gap-1 text-sm text-foreground">
                <span className="flex items-center gap-1">
                  {t("step.crisisType.title")}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={t("wizard.help.crisis_type")}
                          className="ms-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground"
                        >
                          <HelpCircle aria-hidden="true" className="size-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="w-52 text-xs leading-relaxed">{t("wizard.help.crisis_type")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <Select
                  value={draft.crisisType}
                  onValueChange={(value) => updateDraft("crisisType", value as CrisisType)}
                >
                  <SelectTrigger aria-label={t("step.crisisType.title")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRISIS_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`wizard.option.crisis.${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5">
            <label className="flex flex-col gap-1 text-sm text-foreground">
              <span>
                {t("step.details.infra_name_label")}
                <span aria-hidden="true" className="ms-0.5 text-destructive">*</span>
              </span>
              <Input
                value={draft.infraName}
                onChange={(event) => updateDraft("infraName", event.target.value)}
                placeholder={t("step.details.infra_name_placeholder")}
                required
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={draft.hasDebris}
                onCheckedChange={(checked) =>
                  updateDraft("hasDebris", checked === true)
                }
              />
              <span className="flex items-center gap-1">
                {t("step.details.has_debris_label")}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={t("report_detail.help_debris")}
                        className="ms-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground"
                      >
                        <HelpCircle aria-hidden="true" className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="w-52 text-xs leading-relaxed">{t("report_detail.help_debris")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            </label>

            {/* Electricity + Health services — side by side */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-foreground">
                <span className="flex items-center gap-1">
                  {t("reporter.wizard.fields.electricity")}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={t("report_detail.help_electricity")}
                          className="ms-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground"
                        >
                          <HelpCircle aria-hidden="true" className="size-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="w-52 text-xs leading-relaxed">{t("report_detail.help_electricity")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <Select
                  value={draft.electricityCondition}
                  onValueChange={(value) =>
                    updateDraft(
                      "electricityCondition",
                      value as DraftState["electricityCondition"],
                    )
                  }
                >
                  <SelectTrigger aria-label={t("reporter.wizard.fields.electricity")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NO_DAMAGE">{t("wizard.option.electricity.NO_DAMAGE")}</SelectItem>
                    <SelectItem value="MINOR_DAMAGE">{t("wizard.option.electricity.MINOR_DAMAGE")}</SelectItem>
                    <SelectItem value="MODERATE_DAMAGE">{t("wizard.option.electricity.MODERATE_DAMAGE")}</SelectItem>
                    <SelectItem value="SEVERE_DAMAGE">{t("wizard.option.electricity.SEVERE_DAMAGE")}</SelectItem>
                    <SelectItem value="COMPLETELY_DESTROYED">{t("wizard.option.electricity.COMPLETELY_DESTROYED")}</SelectItem>
                    <SelectItem value="UNKNOWN">{t("wizard.option.electricity.UNKNOWN")}</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="flex flex-col gap-1 text-sm text-foreground">
                <span className="flex items-center gap-1">
                  {t("reporter.wizard.fields.health")}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={t("report_detail.help_health_services")}
                          className="ms-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground"
                        >
                          <HelpCircle aria-hidden="true" className="size-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="w-52 text-xs leading-relaxed">{t("report_detail.help_health_services")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <Select
                  value={draft.healthServicesFunctioning}
                  onValueChange={(value) =>
                    updateDraft(
                      "healthServicesFunctioning",
                      value as DraftState["healthServicesFunctioning"],
                    )
                  }
                >
                  <SelectTrigger aria-label={t("reporter.wizard.fields.health")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULLY_FUNCTIONAL">{t("wizard.option.health.FULLY_FUNCTIONAL")}</SelectItem>
                    <SelectItem value="PARTIALLY_FUNCTIONAL">{t("wizard.option.health.PARTIALLY_FUNCTIONAL")}</SelectItem>
                    <SelectItem value="LARGELY_DISRUPTED">{t("wizard.option.health.LARGELY_DISRUPTED")}</SelectItem>
                    <SelectItem value="NOT_FUNCTIONING">{t("wizard.option.health.NOT_FUNCTIONING")}</SelectItem>
                    <SelectItem value="UNKNOWN">{t("wizard.option.health.UNKNOWN")}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>

            <fieldset>
              <legend className="mb-2 flex items-center gap-1 text-sm font-medium text-foreground">
                {t("reporter.wizard.fields.pressing_needs")}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={t("report_detail.help_pressing_needs")}
                        className="ms-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground"
                      >
                        <HelpCircle aria-hidden="true" className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="w-52 text-xs leading-relaxed">{t("report_detail.help_pressing_needs")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </legend>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {PRESSING_NEEDS.map((need) => (
                  <label
                    key={need}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <Checkbox
                      checked={draft.pressingNeeds.includes(need)}
                      onCheckedChange={() => togglePressingNeed(need)}
                    />
                    <span>{t(`wizard.option.pressing.${need}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {draft.pressingNeeds.includes("OTHER") && (
              <label className="flex flex-col gap-1 text-sm text-foreground">
                <span>{t("reporter.wizard.fields.pressing_other")}</span>
                <Input
                  value={draft.pressingNeedsOther}
                  onChange={(event) =>
                    updateDraft("pressingNeedsOther", event.target.value)
                  }
                />
              </label>
            )}

            <label className="flex flex-col gap-1 text-sm text-foreground">
              <span>{t("step.confirm.description_label")}</span>
              <Textarea
                value={draft.description}
                onChange={(event) =>
                  updateDraft("description", event.target.value)
                }
                placeholder={t("step.confirm.description_placeholder")}
                rows={4}
              />
            </label>

            {schema && Object.keys(schema.dynamicFields).length > 0 && (
              <>
                <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("reporter.wizard.fields.dynamic")}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={t("wizard.help.dynamic_fields")}
                          className="ms-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground"
                        >
                          <HelpCircle aria-hidden="true" className="size-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="w-52 text-xs leading-relaxed">{t("wizard.help.dynamic_fields")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(schema.dynamicFields).map(([fieldKey, field]) => (
                    <label
                      key={fieldKey}
                      className="flex flex-col gap-1 text-sm text-foreground"
                    >
                      <span>
                        {field.labels?.[currentLanguage] ||
                          field.labels?.en ||
                          fieldKey}
                        {field.required && (
                          <span aria-hidden="true" className="ms-0.5 text-destructive">*</span>
                        )}
                      </span>
                      {field.type === "boolean" ? (
                        <Select
                          value={draft.dynamicValues[fieldKey] ?? ""}
                          onValueChange={(value) =>
                            updateDraft("dynamicValues", {
                              ...draft.dynamicValues,
                              [fieldKey]: value,
                            })
                          }
                        >
                          <SelectTrigger
                            aria-label={
                              (field.labels?.[currentLanguage] ??
                                field.labels?.en ??
                                fieldKey) +
                              (field.required ? " *" : "")
                            }
                          >
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">{t("common.yes")}</SelectItem>
                            <SelectItem value="false">{t("common.no")}</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={field.type === "number" ? "number" : "text"}
                          value={draft.dynamicValues[fieldKey] ?? ""}
                          onChange={(event) =>
                            updateDraft("dynamicValues", {
                              ...draft.dynamicValues,
                              [fieldKey]: event.target.value,
                            })
                          }
                          required={Boolean(field.required)}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            {photo && photoPreviewUrl && (
              <div className="overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreviewUrl}
                  alt={t("reporter.photo.captured_photo_alt")}
                  className="h-48 w-full rounded-xl object-cover"
                />
              </div>
            )}
            <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-sm">
              {draft.crisisName && (
                <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                  <dt className="shrink-0 text-muted-foreground">
                    {t("reporter.wizard.fields.crisis")}:
                  </dt>
                  <dd className="text-end text-foreground font-medium">{draft.crisisName}</dd>
                </div>
              )}
              <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-muted-foreground">
                  {t("step.confirm.damage_label")}:
                </dt>
                <dd className="text-end text-foreground font-medium">
                  {draft.damageLevel
                    ? t(`damage_${draft.damageLevel.toLowerCase()}`)
                    : "-"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-muted-foreground">
                  {t("step.infraType.title")}:
                </dt>
                <dd className="text-end text-foreground font-medium">
                  {t(`wizard.option.infra.${draft.infraType}`)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-muted-foreground">
                  {t("step.crisisType.title")}:
                </dt>
                <dd className="text-end text-foreground font-medium">
                  {t(`wizard.option.crisis.${draft.crisisType}`)}
                </dd>
              </div>
              {draft.infraName && (
                <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                  <dt className="shrink-0 text-muted-foreground">
                    {t("step.details.infra_name_label")}:
                  </dt>
                  <dd className="text-end text-foreground font-medium">{draft.infraName}</dd>
                </div>
              )}
              <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-muted-foreground">
                  {t("step.confirm.location_label")}:
                </dt>
                <dd className="text-end text-foreground font-medium">
                  {coords
                    ? `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`
                    : draft.locationText || "-"}
                </dd>
              </div>
              {draft.locationText && coords && (
                <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                  <dt className="shrink-0 text-muted-foreground">
                    {t("step.confirm.location_text_label")}:
                  </dt>
                  <dd className="text-end text-foreground font-medium">{draft.locationText}</dd>
                </div>
              )}
              <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-muted-foreground">
                  {t("step.details.has_debris_label")}:
                </dt>
                <dd className="text-end text-foreground font-medium">
                  {t(draft.hasDebris ? "common.yes" : "common.no")}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-muted-foreground">
                  {t("reporter.wizard.fields.electricity")}:
                </dt>
                <dd className="text-end text-foreground font-medium">
                  {t(`wizard.option.electricity.${draft.electricityCondition}`)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-muted-foreground">
                  {t("reporter.wizard.fields.health")}:
                </dt>
                <dd className="text-end text-foreground font-medium">
                  {t(`wizard.option.health.${draft.healthServicesFunctioning}`)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-muted-foreground">
                  {t("reporter.wizard.fields.pressing_needs")}:
                </dt>
                <dd className="text-end text-foreground font-medium">
                  {draft.pressingNeeds
                    .map((n) => t(`wizard.option.pressing.${n}`))
                    .join(", ")}
                </dd>
              </div>
              {draft.pressingNeeds.includes("OTHER") && draft.pressingNeedsOther && (
                <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                  <dt className="shrink-0 text-muted-foreground">
                    {t("reporter.wizard.fields.pressing_other")}:
                  </dt>
                  <dd className="text-end text-foreground font-medium">{draft.pressingNeedsOther}</dd>
                </div>
              )}
              {draft.description && (
                <div className="flex items-start justify-between gap-4 px-4 py-2.5">
                  <dt className="shrink-0 text-muted-foreground">
                    {t("step.confirm.description_label")}:
                  </dt>
                  <dd className="text-end text-foreground font-medium">{draft.description}</dd>
                </div>
              )}
              {schema &&
                Object.entries(schema.dynamicFields).some(
                  ([k]) => draft.dynamicValues[k],
                ) && (
                  <>
                    <div className="border-t border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("reporter.wizard.fields.dynamic")}
                    </div>
                    {Object.entries(schema.dynamicFields).map(
                      ([fieldKey, field]) => {
                        const value = draft.dynamicValues[fieldKey];
                        if (!value) return null;
                        return (
                          <div key={fieldKey} className="flex items-start justify-between gap-4 px-4 py-2.5">
                            <dt className="shrink-0 text-muted-foreground">
                              {field.labels?.[currentLanguage] ||
                                field.labels?.en ||
                                fieldKey}
                              :
                            </dt>
                            <dd className="text-end text-foreground font-medium">{value}</dd>
                          </div>
                        );
                      },
                    )}
                  </>
                )}
            </dl>
          </div>
        )}

      </div>

      {/* Submit confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("wizard.confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("wizard.confirm.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("wizard.confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={submit}>{t("wizard.confirm.submit")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sticky bottom action bar — always accessible without scrolling */}
      <div className="wizard-actions sticky bottom-0 z-10 bg-background/95 shadow-[0_-4px_16px_rgba(0,0,0,0.07)] backdrop-blur-sm">
        <div className="mx-auto flex max-w-xl items-center gap-2 border-t border-border/40 px-4 py-3 sm:px-6">
          {/* Left area — step counter or offline notice */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {!isOnline ? (
              <>
                <HardDrive aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs text-muted-foreground">{t("reporter.my_reports.local_notice")}</span>
              </>
            ) : !canMoveNext && step < 3 ? (
              <>
                <AlertCircle aria-hidden="true" className="size-3 shrink-0 text-amber-500" />
                <span className="truncate text-xs text-amber-600 dark:text-amber-400">
                  {step === 0
                    ? t("wizard.hint.step0")
                    : step === 1
                      ? t("wizard.hint.step1")
                      : draft.infraName.trim().length === 0
                        ? t("wizard.hint.step2_infra")
                        : draft.pressingNeeds.length === 0 ||
                          (draft.pressingNeeds.includes("OTHER") &&
                            draft.pressingNeedsOther.trim().length === 0)
                          ? t("wizard.hint.step2")
                          : t("wizard.hint.step2_required_fields")}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("step_n_of_total", { current: step + 1, total: stepTitles.length })}
              </span>
            )}
          </div>

          {/* Nav buttons */}
          <div className="flex shrink-0 items-center gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() =>
                  setStep((prev) => (prev > 0 ? ((prev - 1) as WizardStep) : prev))
                }
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                {t("button.back")}
              </Button>
            )}

            {step < 3 ? (
              <Button
                type="button"
                size="sm"
                className="min-w-28"
                onClick={() =>
                  setStep((prev) => (prev < 3 ? ((prev + 1) as WizardStep) : prev))
                }
                disabled={!canMoveNext}
              >
                {t("button.next")}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="min-w-28"
                onClick={submit}
                disabled={submitState === "submitting"}
              >
                {submitState === "submitting"
                  ? t("submitting")
                  : t("button.submit")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
