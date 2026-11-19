"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  Clipboard,
  FileJson,
  FileText,
  MessageSquareText,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AI_LOG_SCOPE,
  AI_REQUEST_LOG,
  exportAiRequestLogJson,
  exportAiRequestLogText,
  type AiRequestCategory,
} from "@/lib/ai-request-log";
import { downloadText } from "@/lib/safety-plan";
import styles from "./page.module.css";

export default function AiLogsPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AiRequestCategory | "All requests">(
    "All requests",
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return AI_REQUEST_LOG.filter(
      (entry) =>
        (category === "All requests" || entry.category === category) &&
        `${entry.title}\n${entry.category}\n${entry.request}`
          .toLocaleLowerCase()
          .includes(search),
    );
  }, [query, category]);

  async function copy(id: string, request: string) {
    setError("");
    setNotice("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("unavailable");
      await navigator.clipboard.writeText(request);
      setCopied(id);
      setNotice("The full user request was copied to the clipboard.");
    } catch {
      setError(
        "Clipboard access is unavailable. Select the request text or download the log instead.",
      );
    }
  }

  function download(format: "json" | "text") {
    setError("");
    setNotice("");
    try {
      downloadText(
        format === "json" ? "resqnet-ai-logs.json" : "resqnet-ai-logs.txt",
        format === "json" ? exportAiRequestLogJson() : exportAiRequestLogText(),
        format === "json" ? "application/json" : "text/plain",
      );
      setNotice("The complete request log has been prepared for download.");
    } catch {
      setError("The log could not be downloaded. Try again in this browser.");
    }
  }

  return (
    <div className={`response-page ${styles.page}`}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <span className="tiny-dot" /> PROJECT EVALUATION
          </p>
          <h1>The conversation behind the build.</h1>
          <p>
            Available conversation requests, preserved in the user’s own words.
          </p>
        </div>
        <span className={`count-pill ${styles.total}`}>
          <MessageSquareText aria-hidden="true" /> {AI_REQUEST_LOG.length}{" "}
          requests
        </span>
      </div>

      <section
        className={styles.introduction}
        aria-labelledby="log-scope-title"
      >
        <span className="feature-icon lavender">
          <FileText aria-hidden="true" />
        </span>
        <div>
          <h2 id="log-scope-title">AI logs</h2>
          <p>{AI_LOG_SCOPE}</p>
          <p className={styles.scopeNote}>
            Request titles and categories help you browse. The request text
            itself is unchanged. Exports always include every recorded request.
          </p>
        </div>
        <div className={styles.exportActions}>
          <Button variant="outline" onClick={() => download("json")}>
            <FileJson aria-hidden="true" /> Export all JSON
          </Button>
          <Button variant="outline" onClick={() => download("text")}>
            <ArrowDownToLine aria-hidden="true" /> Export all text
          </Button>
        </div>
      </section>

      <div className={styles.searchRow}>
        <div className={styles.search}>
          <Search aria-hidden="true" />
          <Input
            aria-label="Search AI request logs"
            placeholder="Search the original requests…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className={styles.categories} aria-label="Filter request category">
          {(
            [
              "All requests",
              "Interface",
              "Volunteer platform",
              "Delivery",
            ] as const
          ).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
              className={category === value ? styles.selected : undefined}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="save-notice" role="status">
        {notice}
      </p>
      <p className={styles.resultCount} aria-live="polite">
        Showing {filtered.length} of {AI_REQUEST_LOG.length} requests
      </p>

      <div className={styles.entries}>
        {filtered.map((entry) => (
          <article key={entry.id} className="response-card">
            <div className={styles.entryHeading}>
              <span className={styles.sequence}>
                {String(entry.sequence).padStart(2, "0")}
              </span>
              <div>
                <p className="eyebrow">{entry.category}</p>
                <h2>{entry.title}</h2>
              </div>
              <Button
                variant="ghost"
                onClick={() => void copy(entry.id, entry.request)}
                aria-label={`Copy request ${entry.sequence}`}
              >
                {copied === entry.id ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Clipboard aria-hidden="true" />
                )}
                {copied === entry.id ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className={styles.requestBody}>
              <p className={styles.requestLabel}>Verbatim user request</p>
              <pre>{entry.request}</pre>
            </div>
          </article>
        ))}
        {!filtered.length && (
          <div className={`response-card ${styles.empty}`}>
            <Search aria-hidden="true" />
            <h2>No matching requests</h2>
            <p>Try another phrase or clear the selected category.</p>
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setCategory("All requests");
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
