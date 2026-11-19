"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Boxes,
  CircleHelp,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  Tent,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useDeviceStore } from "@/hooks/use-device-store";
import {
  downloadText,
  RESOURCE_CATEGORIES,
  RESOURCES_KEY,
  ResourceSchema,
  ResourcesSchema,
  type Resource,
} from "@/lib/safety-plan";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_RESOURCES: Resource[] = [];
const ICONS = {
  Shelter: Tent,
  Medical: Stethoscope,
  "Food & water": UtensilsCrossed,
  Supplies: Boxes,
  Other: CircleHelp,
};

export default function ResourcesPage() {
  const store = useDeviceStore(RESOURCES_KEY, ResourcesSchema, EMPTY_RESOURCES);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All resources");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [editor, setEditor] = useState<Resource | "new" | null>(null);
  const [removing, setRemoving] = useState<Resource | null>(null);
  const [error, setError] = useState("");
  const [editorError, setEditorError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const disabled = !store.ready || !!store.error;
  const filtered = useMemo(
    () =>
      store.value.filter(
        (resource) =>
          (category === "All resources" || resource.category === category) &&
          (!availableOnly || resource.availability === "Available") &&
          [resource.name, resource.address, resource.notes].some((text) =>
            text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
          ),
      ),
    [store.value, category, availableOnly, query],
  );

  function saveResource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = ResourceSchema.safeParse({
      ...data,
      id: editor && editor !== "new" ? editor.id : crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    });
    if (!parsed.success) {
      setEditorError(
        parsed.error.issues[0]?.message || "Check the resource details.",
      );
      return;
    }
    try {
      store.save((items) =>
        editor === "new"
          ? [parsed.data, ...items]
          : items.map((item) =>
              item.id === parsed.data.id ? parsed.data : item,
            ),
      );
      setEditor(null);
      setNotice("Resource saved on this device.");
      setError("");
    } catch {
      setEditorError(
        "The resource could not be saved. Check device storage and try again.",
      );
    }
  }

  async function importResources(file: File) {
    setError("");
    setNotice("");
    try {
      if (file.size > 1024 * 1024)
        throw new Error("Choose a resource file smaller than 1 MB.");
      const parsed = ResourcesSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success)
        throw new Error(
          "This file is not a valid CrisisMap resource directory.",
        );
      store.save((items) => {
        const byId = new Map(items.map((item) => [item.id, item]));
        for (const item of parsed.data) {
          const existing = byId.get(item.id);
          if (!existing || item.updatedAt > existing.updatedAt)
            byId.set(item.id, item);
        }
        return [...byId.values()];
      });
      setNotice(
        "Resources imported. Existing entries were kept unless the file contained a newer version.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error && !(failure instanceof SyntaxError)
          ? failure.message
          : "This file could not be read. Choose a CrisisMap resource export.",
      );
    }
  }

  return (
    <div className="response-page resources-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <span className="tiny-dot" /> GOOD TO HAVE CLOSE BY
          </p>
          <h1>A place for your go-to places.</h1>
          <p>
            Keep useful shelters, care contacts, and supply points within reach.
          </p>
        </div>
        <Button
          disabled={disabled || store.value.length >= 250}
          onClick={() => {
            setEditor("new");
            setEditorError("");
          }}
        >
          <Plus aria-hidden="true" />
          Add a resource
        </Button>
      </div>
      <div className="resource-intro">
        <span className="feature-icon mint">
          <ShieldCheck aria-hidden="true" />
        </span>
        <p>
          <strong>Your directory. Available on this device.</strong>
          <span>
            Add places you know or information from local authorities.
            Availability is recorded by you; confirm details with the provider
            before travelling.
          </span>
        </p>
        <div className="resource-file-actions">
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => fileInput.current?.click()}
          >
            <ArrowUpFromLine aria-hidden="true" />
            Import
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || !store.value.length}
            onClick={() => {
              try {
                downloadText(
                  "crisismap-resources.json",
                  JSON.stringify(store.value, null, 2),
                  "application/json",
                );
              } catch {
                setError(
                  "The directory could not be downloaded. Try again in this browser.",
                );
              }
            }}
          >
            <ArrowDownToLine aria-hidden="true" />
            Export
          </Button>
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            aria-label="Import resource directory"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importResources(file);
              event.target.value = "";
            }}
          />
        </div>
      </div>
      {(store.error || error) && (
        <p role="alert" className="form-error">
          {store.error || error}
        </p>
      )}
      <p className="save-notice" role="status">
        {notice}
      </p>
      <div className="resource-toolbar">
        <div className="resource-search">
          <Search aria-hidden="true" />
          <Input
            aria-label="Search saved resources"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, place, or notes…"
          />
        </div>
        <label className="availability-filter">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(event) => setAvailableOnly(event.target.checked)}
          />
          Available only
        </label>
      </div>
      <div
        className="resource-categories"
        aria-label="Filter resource categories"
      >
        {["All resources", ...RESOURCE_CATEGORIES].map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
            className={category === item ? "selected" : ""}
          >
            {item}
            <span>
              {
                store.value.filter(
                  (resource) =>
                    item === "All resources" || resource.category === item,
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      <div className="resource-results-heading">
        <h2>Your saved resources</h2>
        <span>
          {filtered.length} {filtered.length === 1 ? "place" : "places"}
        </span>
      </div>
      {!store.ready ? (
        <div className="resource-empty" role="status">
          Loading your saved directory…
        </div>
      ) : filtered.length ? (
        <div className="resource-grid">
          {filtered.map((resource) => {
            const Icon = ICONS[resource.category];
            return (
              <article
                className="response-card resource-card"
                key={resource.id}
              >
                <div className="resource-card-top">
                  <span
                    className={`feature-icon ${resource.category === "Medical" ? "coral" : resource.category === "Shelter" ? "lavender" : "mint"}`}
                  >
                    <Icon aria-hidden="true" />
                  </span>
                  <span
                    className={`availability-badge availability-${resource.availability.toLowerCase()}`}
                  >
                    <span className="tiny-dot" />
                    {resource.availability}
                  </span>
                </div>
                <span className="resource-type">{resource.category}</span>
                <h3>{resource.name}</h3>
                <p className="resource-address">
                  <MapPin aria-hidden="true" />
                  {resource.address}
                </p>
                {resource.notes && (
                  <p className="resource-notes">{resource.notes}</p>
                )}
                <p className="resource-updated">
                  Updated {new Date(resource.updatedAt).toLocaleDateString()}
                </p>
                <div className="resource-card-actions">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(resource.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-link"
                  >
                    View on map
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                  {resource.phone && (
                    <a
                      href={`tel:${resource.phone.replace(/[^+\d]/g, "")}`}
                      aria-label={`Call ${resource.name}`}
                      className="resource-icon-button"
                    >
                      <Phone aria-hidden="true" />
                    </a>
                  )}
                  <button
                    type="button"
                    className="resource-icon-button"
                    aria-label={`Edit ${resource.name}`}
                    onClick={() => {
                      setEditor(resource);
                      setEditorError("");
                    }}
                    disabled={disabled}
                  >
                    <Pencil aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="resource-icon-button"
                    aria-label={`Remove ${resource.name}`}
                    onClick={() => setRemoving(resource)}
                    disabled={disabled}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="resource-empty">
          <div className="empty-resource-art" aria-hidden="true">
            <span>
              <Tent />
            </span>
            <span>
              <MapPin />
            </span>
            <span>
              <HeartIcon />
            </span>
          </div>
          <p className="eyebrow">A LITTLE LOCAL KNOWLEDGE GOES A LONG WAY</p>
          <h2>
            {store.value.length
              ? "No matching places"
              : "Your local knowledge belongs here."}
          </h2>
          <p>
            {store.value.length
              ? "Try another search or category to see more of your saved resources."
              : "Start with a community shelter, a medical centre, or a reliable supply point. Your saved details stay accessible in this browser."}
          </p>
          {store.value.length ? (
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setCategory("All resources");
                setAvailableOnly(false);
              }}
            >
              Clear filters
            </Button>
          ) : (
            <Button
              disabled={disabled}
              onClick={() => {
                setEditor("new");
                setEditorError("");
              }}
            >
              <Plus aria-hidden="true" />
              Save your first resource
            </Button>
          )}
        </div>
      )}
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent className="safety-dialog resource-editor">
          <DialogHeader>
            <DialogTitle>
              {editor === "new"
                ? "Keep a useful place close."
                : "Update resource details"}
            </DialogTitle>
            <DialogDescription>
              Save information you trust. You can update it whenever details
              change.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <form
              key={editor === "new" ? "new" : editor.id}
              onSubmit={saveResource}
              className="response-form"
            >
              <div className="form-field">
                <Label htmlFor="resource-name">
                  Place or organisation name
                </Label>
                <Input
                  id="resource-name"
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={editor === "new" ? "" : editor.name}
                  placeholder="e.g. Riverside community hall"
                />
              </div>
              <div className="form-two-columns">
                <div className="form-field">
                  <Label htmlFor="resource-category">Category</Label>
                  <select
                    id="resource-category"
                    name="category"
                    defaultValue={
                      editor === "new" ? "Shelter" : editor.category
                    }
                  >
                    {RESOURCE_CATEGORIES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <Label htmlFor="resource-availability">
                    Recorded availability
                  </Label>
                  <select
                    id="resource-availability"
                    name="availability"
                    defaultValue={
                      editor === "new" ? "Unknown" : editor.availability
                    }
                  >
                    {["Unknown", "Available", "Limited", "Unavailable"].map(
                      (value) => (
                        <option key={value}>{value}</option>
                      ),
                    )}
                  </select>
                </div>
              </div>
              <div className="form-field">
                <Label htmlFor="resource-address">Address or location</Label>
                <Input
                  id="resource-address"
                  name="address"
                  required
                  maxLength={300}
                  defaultValue={editor === "new" ? "" : editor.address}
                />
              </div>
              <div className="form-field">
                <Label htmlFor="resource-phone">
                  Phone{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="resource-phone"
                  name="phone"
                  type="tel"
                  maxLength={40}
                  defaultValue={editor === "new" ? "" : editor.phone}
                />
              </div>
              <div className="form-field">
                <Label htmlFor="resource-notes">
                  Useful notes{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="resource-notes"
                  name="notes"
                  maxLength={1000}
                  defaultValue={editor === "new" ? "" : editor.notes}
                  placeholder="Opening hours, accessibility, what to bring…"
                />
              </div>
              {editorError && (
                <p role="alert" className="form-error">
                  {editorError}
                </p>
              )}
              <Button type="submit" disabled={disabled}>
                Save resource
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this resource?</DialogTitle>
            <DialogDescription>
              {removing?.name} will be removed from this device’s directory.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Keep resource
            </Button>
            <Button
              variant="destructive"
              disabled={disabled}
              onClick={() => {
                try {
                  store.save((items) =>
                    items.filter((item) => item.id !== removing?.id),
                  );
                  setRemoving(null);
                  setNotice("Resource removed.");
                } catch {
                  setRemoving(null);
                  setError(
                    "The resource could not be removed. Check device storage.",
                  );
                }
              }}
            >
              Remove resource
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HeartIcon() {
  return <Stethoscope />;
}
