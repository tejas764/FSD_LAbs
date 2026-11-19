"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  Backpack,
  Check,
  CheckCheck,
  Heart,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useDeviceStore } from "@/hooks/use-device-store";
import {
  CHECKLIST,
  downloadText,
  EMPTY_PLAN,
  formatSafetyPlan,
  PLAN_KEY,
  SafetyPlanSchema,
  type SafetyPlan,
} from "@/lib/safety-plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function PreparednessPage() {
  const store = useDeviceStore(PLAN_KEY, SafetyPlanSchema, EMPTY_PLAN);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const percentage = Math.round(
    (store.value.checked.length / CHECKLIST.length) * 100,
  );
  const disabled = !store.ready || !!store.error;

  function update(
    next: (plan: SafetyPlan) => SafetyPlan,
    message = "Saved on this device.",
  ) {
    try {
      store.save(next);
      setError("");
      setNotice(message);
      return true;
    } catch {
      setError(
        "The plan could not be saved. Check device storage and try again.",
      );
      setNotice("");
      return false;
    }
  }

  function addContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const contact = { id: crypto.randomUUID(), name, phone };
    const validation = SafetyPlanSchema.shape.contacts
      .unwrap()
      .element.safeParse(contact);
    if (!validation.success) {
      setError(
        validation.error.issues[0]?.message || "Check the contact details.",
      );
      return;
    }
    if (
      update(
        (plan) => ({ ...plan, contacts: [...plan.contacts, validation.data] }),
        "Emergency contact saved on this device.",
      )
    )
      form.reset();
  }

  return (
    <div className="response-page safety-plan-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <span className="tiny-dot" /> YOUR PERSONAL TOOLKIT
          </p>
          <h1>Prepared feels better.</h1>
          <p>A practical plan for the people and places that matter to you.</p>
        </div>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => {
            try {
              downloadText(
                "crisismap-safety-plan.txt",
                formatSafetyPlan(store.value),
              );
            } catch {
              setError(
                "The plan could not be downloaded. Try again in this browser.",
              );
            }
          }}
        >
          <ArrowDownToLine aria-hidden="true" />
          Download my plan
        </Button>
      </div>
      {(store.error || error) && (
        <p role="alert" className="form-error">
          {store.error || error}
        </p>
      )}
      <p role="status" className="save-notice">
        {notice}
      </p>
      <section className="plan-banner">
        <span className="plan-banner-icon">
          <Backpack aria-hidden="true" strokeWidth={1.4} />
        </span>
        <div>
          <p className="eyebrow">ONE SMALL STEP AT A TIME</p>
          <h2>Your household, a little more ready.</h2>
          <p>
            Pack the essentials, save your contacts, and agree on a place to
            meet.
          </p>
        </div>
        <div
          className="readiness-ring"
          style={{ "--progress": `${percentage}%` } as React.CSSProperties}
        >
          <span>
            <strong>{percentage}%</strong>
            <small>kit ready</small>
          </span>
        </div>
      </section>
      <div className="plan-layout">
        <section className="response-card kit-card" aria-labelledby="kit-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">GRAB & GO</p>
              <h2 id="kit-title">Your emergency kit</h2>
            </div>
            <span className="count-pill">
              {store.value.checked.length} / {CHECKLIST.length}
            </span>
          </div>
          <div className="kit-list">
            {["Essentials", "Equipment", "Your household"].map((category) => (
              <fieldset key={category}>
                <legend>{category}</legend>
                {CHECKLIST.filter((item) => item.category === category).map(
                  (item) => (
                    <label
                      key={item.id}
                      className={`kit-item ${store.value.checked.includes(item.id) ? "is-checked" : ""}`}
                    >
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={store.value.checked.includes(item.id)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          update((plan) => ({
                            ...plan,
                            checked: checked
                              ? [...new Set([...plan.checked, item.id])]
                              : plan.checked.filter((id) => id !== item.id),
                          }));
                        }}
                      />
                      <span className="kit-checkbox" aria-hidden="true">
                        {store.value.checked.includes(item.id) && <Check />}
                      </span>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.detail}</small>
                      </span>
                    </label>
                  ),
                )}
              </fieldset>
            ))}
          </div>
          <div className="card-bottom-note">
            <CheckCheck aria-hidden="true" />
            Your checklist saves as you go.
          </div>
        </section>
        <div className="plan-secondary">
          <section className="response-card" aria-labelledby="household-title">
            <div className="section-header">
              <div>
                <p className="eyebrow">MAKE A PLAN TOGETHER</p>
                <h2 id="household-title">Your meeting place</h2>
              </div>
              <span className="feature-icon mint">
                <MapPin aria-hidden="true" />
              </span>
            </div>
            {store.ready && (
              <form
                key={`${store.value.meetingPlace}:${store.value.householdNotes}`}
                className="response-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  update(
                    (plan) => ({
                      ...plan,
                      meetingPlace: String(data.get("meetingPlace") || ""),
                      householdNotes: String(data.get("householdNotes") || ""),
                    }),
                    "Household plan saved on this device.",
                  );
                }}
              >
                <div className="form-field">
                  <Label htmlFor="meeting-place">Where will you meet?</Label>
                  <Input
                    id="meeting-place"
                    name="meetingPlace"
                    placeholder="e.g. The community hall on Hill Road"
                    defaultValue={store.value.meetingPlace}
                    maxLength={500}
                    disabled={disabled}
                  />
                </div>
                <div className="form-field">
                  <Label htmlFor="household-notes">Household notes</Label>
                  <Textarea
                    id="household-notes"
                    name="householdNotes"
                    placeholder="Accessibility needs, pets, an alternative meeting point…"
                    defaultValue={store.value.householdNotes}
                    maxLength={2000}
                    rows={3}
                    disabled={disabled}
                  />
                </div>
                <Button type="submit" disabled={disabled}>
                  <ShieldCheck aria-hidden="true" />
                  Save household plan
                </Button>
              </form>
            )}
          </section>
          <section className="response-card" aria-labelledby="contacts-title">
            <div className="section-header">
              <div>
                <p className="eyebrow">KEEP YOUR PEOPLE CLOSE</p>
                <h2 id="contacts-title">Emergency contacts</h2>
              </div>
              <span className="feature-icon lavender">
                <Users aria-hidden="true" />
              </span>
            </div>
            {store.value.contacts.length ? (
              <ul className="contact-list">
                {store.value.contacts.map((contact) => (
                  <li key={contact.id}>
                    <span className="contact-avatar">
                      {contact.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <strong>{contact.name}</strong>
                      <a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}>
                        <Phone aria-hidden="true" />
                        {contact.phone}
                      </a>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={disabled}
                      aria-label={`Remove ${contact.name}`}
                      onClick={() =>
                        update(
                          (plan) => ({
                            ...plan,
                            contacts: plan.contacts.filter(
                              (person) => person.id !== contact.id,
                            ),
                          }),
                          "Contact removed.",
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="contact-empty">
                <Heart aria-hidden="true" />
                <p>Add someone you can reach in an emergency.</p>
              </div>
            )}
            <form onSubmit={addContact} className="response-form contact-form">
              <div className="form-field">
                <Label htmlFor="contact-name">Contact name</Label>
                <Input
                  id="contact-name"
                  name="name"
                  required
                  maxLength={100}
                  autoComplete="off"
                  placeholder="e.g. A family member"
                  disabled={disabled}
                />
              </div>
              <div className="form-field">
                <Label htmlFor="contact-phone">Phone number</Label>
                <Input
                  id="contact-phone"
                  name="phone"
                  type="tel"
                  required
                  maxLength={40}
                  placeholder="Include the country code"
                  disabled={disabled}
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={disabled || store.value.contacts.length >= 30}
              >
                <Plus aria-hidden="true" />
                Add contact
              </Button>
            </form>
          </section>
        </div>
      </div>
      <div className="privacy-strip">
        <ShieldCheck aria-hidden="true" />
        <p>
          Your plan and contacts stay in this browser. Download a copy for
          safekeeping. During an emergency, follow instructions from local
          authorities.
        </p>
      </div>
    </div>
  );
}
