"use client";

import { useState } from "react";
import { Check, HeartHandshake, LocateFixed, MapPin, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { queueFieldMessage } from "@/lib/offline/field-store";
import { useConnectivity } from "@/lib/offline/connectivity";

export function SafetyCheckIn({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const connection = useConnectivity();
  const [status, setStatus] = useState<"safe" | "help">("safe");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  }>();
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function locate() {
    if (!navigator.geolocation) {
      setError("Location is unavailable. Describe your location in the note.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setLocating(false);
      },
      () => {
        setError(
          "Location could not be accessed. You can still save your check-in.",
        );
        setLocating(false);
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await queueFieldMessage(
        `${status === "safe" ? "Safety check-in: I am safe." : "SOS: I need assistance."}${notes.trim() ? ` ${notes.trim()}` : ""}`,
        status === "safe" ? "TEXT" : "SOS",
        location,
      );
      setSaved(true);
      if (connection.isOnline) void connection.syncNow();
    } catch {
      setError(
        "Your check-in could not be saved. Check device storage and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) {
          onOpenChange(next);
          if (!next) {
            setSaved(false);
            setError("");
            setNotes("");
            setLocation(undefined);
            setStatus("safe");
          }
        }
      }}
    >
      <DialogContent className="safety-dialog">
        <DialogHeader>
          <span className="feature-icon mint">
            <HeartHandshake aria-hidden="true" />
          </span>
          <DialogTitle>
            {saved
              ? "Check-in saved"
              : "A little update. A lot of reassurance."}
          </DialogTitle>
          <DialogDescription>
            {saved
              ? "Your check-in is saved on this device. View its upload status in the field workspace."
              : "Record how you are doing, with an optional note and location."}
          </DialogDescription>
        </DialogHeader>
        {saved ? (
          <div className="checkin-success">
            <span className="feature-icon mint">
              <Check aria-hidden="true" />
            </span>
            <p>
              Saved locally
              {connection.isOnline
                ? "; upload will be attempted."
                : "; waiting for a connection."}
            </p>
            <Button
              onClick={() => {
                onOpenChange(false);
                setSaved(false);
                setNotes("");
                setLocation(undefined);
                setStatus("safe");
              }}
            >
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <fieldset className="checkin-choices">
              <legend className="sr-only">Safety status</legend>
              {(["safe", "help"] as const).map((value) => (
                <label
                  key={value}
                  className={`checkin-choice ${status === value ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="safety-status"
                    value={value}
                    checked={status === value}
                    onChange={() => setStatus(value)}
                  />
                  <span>
                    {value === "safe" ? "I am safe" : "I need assistance"}
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="checkin-note">
                Add a note{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="checkin-note"
                maxLength={1800}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Where you are, who is with you, or what you need…"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={locate}
                disabled={locating}
              >
                <LocateFixed aria-hidden="true" />
                {locating
                  ? "Finding location…"
                  : location
                    ? "Update location"
                    : "Attach my location"}
              </Button>
              {location && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin aria-hidden="true" className="size-3" />
                  {location.latitude.toFixed(4)},{" "}
                  {location.longitude.toFixed(4)}
                  <button
                    type="button"
                    className="underline ml-2"
                    onClick={() => setLocation(undefined)}
                  >
                    Remove
                  </button>
                </span>
              )}
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <p className="subtle-note">
              This records a field note. It does not contact emergency services
              or notify your contacts.
            </p>
            <Button type="submit" className="w-full" disabled={saving}>
              <Send aria-hidden="true" />
              {saving ? "Saving…" : "Save check-in"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
