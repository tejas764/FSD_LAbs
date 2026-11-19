"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  VolunteerProfile,
  VolunteerProfileInput,
} from "@/lib/volunteer-api";

export function readVolunteerProfile(
  form: HTMLFormElement,
): VolunteerProfileInput {
  const values = new FormData(form);
  return {
    ...(values.has("name")
      ? { name: String(values.get("name") || "").trim() }
      : {}),
    phone: String(values.get("phone") || "").trim(),
    location: String(values.get("location") || "").trim(),
    skills: [
      ...new Set(
        String(values.get("skills") || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ],
    bio: String(values.get("bio") || "").trim(),
    emergencyContactName: String(
      values.get("emergencyContactName") || "",
    ).trim(),
    emergencyContactPhone: String(
      values.get("emergencyContactPhone") || "",
    ).trim(),
  };
}

export function VolunteerProfileFields({
  profile,
  disabled = false,
  includeName = false,
}: {
  profile?: VolunteerProfile;
  disabled?: boolean;
  includeName?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="volunteer-profile-fields">
      <legend className="sr-only">Volunteer details</legend>
      {includeName && (
        <div className="form-field">
          <Label htmlFor="volunteer-name">Full name</Label>
          <Input
            id="volunteer-name"
            name="name"
            autoComplete="name"
            required
            maxLength={100}
            defaultValue={profile?.name ?? ""}
          />
        </div>
      )}
      <div className="volunteer-form-grid">
        <div className="form-field">
          <Label htmlFor="volunteer-phone">Phone number</Label>
          <Input
            id="volunteer-phone"
            name="phone"
            autoComplete="tel"
            type="tel"
            required
            maxLength={40}
            defaultValue={profile?.phone ?? ""}
            placeholder="Include your country code"
          />
        </div>
        <div className="form-field">
          <Label htmlFor="volunteer-location">Your location</Label>
          <Input
            id="volunteer-location"
            name="location"
            autoComplete="address-level2"
            required
            maxLength={200}
            defaultValue={profile?.location ?? ""}
            placeholder="City or area"
          />
        </div>
      </div>
      <div className="form-field">
        <Label htmlFor="volunteer-skills">Skills</Label>
        <Input
          id="volunteer-skills"
          name="skills"
          maxLength={1000}
          defaultValue={profile?.skills.join(", ") ?? ""}
          placeholder="e.g. First aid, Logistics, Translation"
          aria-describedby="volunteer-skills-help"
        />
        <p id="volunteer-skills-help" className="volunteer-field-help">
          Separate skills with commas. Coordinators match these to task
          requirements.
        </p>
      </div>
      <div className="form-field">
        <Label htmlFor="volunteer-bio">
          A little about you <span>(optional)</span>
        </Label>
        <Textarea
          id="volunteer-bio"
          name="bio"
          rows={3}
          maxLength={2000}
          defaultValue={profile?.bio ?? ""}
          placeholder="Experience, languages, or ways you would like to help…"
        />
      </div>
      <div className="volunteer-form-grid">
        <div className="form-field">
          <Label htmlFor="volunteer-contact-name">
            Emergency contact <span>(optional)</span>
          </Label>
          <Input
            id="volunteer-contact-name"
            name="emergencyContactName"
            maxLength={100}
            defaultValue={profile?.emergencyContactName ?? ""}
            placeholder="Contact name"
          />
        </div>
        <div className="form-field">
          <Label htmlFor="volunteer-contact-phone">
            Contact phone <span>(optional)</span>
          </Label>
          <Input
            id="volunteer-contact-phone"
            name="emergencyContactPhone"
            type="tel"
            maxLength={40}
            defaultValue={profile?.emergencyContactPhone ?? ""}
            placeholder="Contact phone number"
          />
        </div>
      </div>
    </fieldset>
  );
}
