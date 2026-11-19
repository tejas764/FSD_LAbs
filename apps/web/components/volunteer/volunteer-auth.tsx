"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  HeartHandshake,
  ShieldCheck,
  Users,
  UserRoundCheck,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { volunteerApi, volunteerError } from "@/lib/volunteer-api";
import { CrisisBrand } from "@/components/shared/crisis-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  readVolunteerProfile,
  VolunteerProfileFields,
} from "./volunteer-profile-fields";

export function VolunteerAuth({ mode }: { mode: "login" | "register" }) {
  const registering = mode === "register";
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [pending, setPending] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [error, setError] = useState("");
  const signedIn = !!session?.user || accountCreated;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const profile = registering ? readVolunteerProfile(form) : null;
    setPending(true);
    setError("");
    try {
      if (registering) {
        if (!signedIn) {
          const result = await authClient.signUp.email({
            name: String(values.get("name") || "").trim(),
            email: String(values.get("email") || "").trim(),
            password: String(values.get("password") || ""),
          });
          if (result.error)
            throw new Error(
              result.error.message ||
                "Registration could not be completed. Check your details and retry.",
            );
          setAccountCreated(true);
        }
        await volunteerApi.enroll(profile!);
      } else {
        const result = await authClient.signIn.email({
          email: String(values.get("email") || "").trim(),
          password: String(values.get("password") || ""),
        });
        if (result.error)
          throw new Error(
            result.error.message ||
              "Sign-in failed. Check your email and password.",
          );
      }
      window.location.assign("/volunteer");
    } catch (failure) {
      setError(volunteerError(failure));
      setPending(false);
    }
  }

  return (
    <main
      id="main-content"
      className={`volunteer-auth-page ${registering ? "is-registration" : ""}`}
    >
      <div className="volunteer-auth-top">
        <Link href="/" aria-label="CrisisMap home">
          <CrisisBrand />
        </Link>
        <Link href="/" className="volunteer-back-link">
          <ArrowLeft aria-hidden="true" />
          Back to community hub
        </Link>
      </div>
      <div className="volunteer-auth-layout">
        <section
          className="volunteer-auth-story"
          aria-labelledby="volunteer-story-title"
        >
          <span className="volunteer-story-kicker">
            <HeartHandshake aria-hidden="true" /> THE PEOPLE WHO SHOW UP
          </span>
          <h1 id="volunteer-story-title">
            Your time.{" "}
            <br />
            Your skills.{" "}
            <br />
            <span>A stronger community.</span>
          </h1>
          <p>
            Be part of a coordinated response. Find the work that fits your
            skills, know where you are needed, and see the difference you make.
          </p>
          <div className="volunteer-story-points">
            <span>
              <ShieldCheck aria-hidden="true" />
              <span>
                <strong>Know your role</strong>
                <small>Clear assignments, shifts, and progress.</small>
              </span>
            </span>
            <span>
              <Users aria-hidden="true" />
              <span>
                <strong>Be part of the response</strong>
                <small>Stay connected with your coordinator.</small>
              </span>
            </span>
            <span>
              <UserRoundCheck aria-hidden="true" />
              <span>
                <strong>Make your hours count</strong>
                <small>Completion reports reviewed by coordinators.</small>
              </span>
            </span>
          </div>
          <span className="volunteer-story-footnote">
            Small commitments. Meaningful impact.
          </span>
        </section>
        <section
          className="volunteer-auth-card"
          aria-labelledby="volunteer-auth-title"
        >
          <p className="eyebrow">
            {registering ? "STEP FORWARD" : "GOOD TO HAVE YOU BACK"}
          </p>
          <h2 id="volunteer-auth-title">
            {registering
              ? signedIn
                ? "Complete your volunteer profile"
                : "Join as a volunteer"
              : "Sign in to your workspace"}
          </h2>
          <p className="volunteer-auth-subtitle">
            {registering
              ? "Tell us how you can help. A coordinator will review your profile before verification."
              : "Your assignments, your people, and your next step."}
          </p>
          {registering && signedIn && (
            <p className="volunteer-info-note">
              {accountCreated
                ? "Your account has been created. Complete your profile below; you can retry this step without creating another account."
                : `You are signed in${session?.user?.email ? ` as ${session.user.email}` : ""}. Complete or recover your volunteer enrollment below.`}
            </p>
          )}
          <form
            onSubmit={submit}
            className="volunteer-auth-form"
            aria-label={
              registering ? "Volunteer registration" : "Volunteer sign in"
            }
          >
            {!(registering && signedIn) && (
              <fieldset disabled={pending} className="volunteer-profile-fields">
                <legend className="sr-only">Account details</legend>
                {registering && (
                  <div className="form-field">
                    <Label htmlFor="account-name">Full name</Label>
                    <Input
                      id="account-name"
                      name="name"
                      required
                      autoComplete="name"
                      maxLength={100}
                    />
                  </div>
                )}
                <div className="form-field">
                  <Label htmlFor="account-email">Email address</Label>
                  <Input
                    id="account-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                  />
                </div>
                <div className="form-field">
                  <div className="volunteer-password-label">
                    <Label htmlFor="account-password">Password</Label>
                    {!registering && (
                      <Link href="/forgot-password">Forgot password?</Link>
                    )}
                  </div>
                  <PasswordInput
                    id="account-password"
                    name="password"
                    required
                    minLength={8}
                    autoComplete={
                      registering ? "new-password" : "current-password"
                    }
                  />
                  {registering && (
                    <p className="volunteer-field-help">
                      Use at least 8 characters.
                    </p>
                  )}
                </div>
              </fieldset>
            )}
            {registering && <VolunteerProfileFields disabled={pending} />}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={pending || (registering && sessionPending)}
              className="volunteer-auth-submit"
            >
              {pending
                ? registering
                  ? "Saving your registration…"
                  : "Signing in…"
                : registering
                  ? signedIn
                    ? "Save volunteer profile"
                    : "Create volunteer account"
                  : "Sign in"}
              <ArrowRight aria-hidden="true" />
            </Button>
          </form>
          <p className="volunteer-auth-switch">
            {registering ? "Already registered?" : "New to the volunteer team?"}{" "}
            <Link
              href={registering ? "/volunteer/login" : "/volunteer/register"}
            >
              {registering ? "Sign in" : "Become a volunteer"}
            </Link>
          </p>
          {!registering && signedIn && (
            <Link href="/volunteer" className="volunteer-existing-session">
              You are already signed in. Open your dashboard
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
          <p className="volunteer-auth-footer">
            Your personal details are available to your coordinators for
            volunteer management.
          </p>
        </section>
      </div>
    </main>
  );
}
