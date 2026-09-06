"use client";

import { useState } from "react";
import { PageHeader } from "@/components/admin/ui";
import { useCancelJobRun, useJobRun, useRetryJobRun } from "./hooks";

function actionMessage(result: unknown, action: "Retry" | "Cancel") {
  if (!result || typeof result !== "object") return `${action} requested.`;
  if ("status" in result && typeof result.status === "string") return `${action} ${result.status}.`;
  if ("outcome" in result && result.outcome && typeof result.outcome === "object" && "message" in result.outcome && typeof result.outcome.message === "string") return result.outcome.message;
  return `${action} requested.`;
}

export function JobRunDetailView({ jobRunId }: { jobRunId: string }) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const detail = useJobRun(jobRunId);
  const retry = useRetryJobRun(jobRunId);
  const cancel = useCancelJobRun(jobRunId);
  if (detail.isPending) return <div className="page"><div className="state-box" role="status">Loading job run...</div></div>;
  if (detail.isError) return <div className="page"><div className="state-box error" role="alert">Unable to load job run.</div></div>;
  const data = detail.data;
  const actionRequest = {
    jobRunId,
    expectedVersion: data.run.version,
    reason,
    submissionKey: "SUB-DEMO-ACTION",
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="Jobs / Run detail"
        title={data.run.id}
        description={`${data.run.name} · ${data.run.state} · Correlation ${data.run.correlationId}`}
      />
      <section className="section-grid">
        <article className="card">
          <h2>Summary</h2>
          <dl className="detail-grid">
            <div className="detail-item"><dt>Queue</dt><dd>{data.run.queue}</dd></div>
            <div className="detail-item"><dt>Attempt</dt><dd>{data.run.attempt}</dd></div>
            <div className="detail-item"><dt>Version</dt><dd>{data.run.version}</dd></div>
            <div className="detail-item"><dt>Correlation</dt><dd className="ltr">{data.run.correlationId}</dd></div>
          </dl>
        </article>
        <article className="card">
          <h2>Allowed actions</h2>
          <p>{data.allowedActions.length ? data.allowedActions.join(", ") : "None"}</p>
          {data.allowedActions.length > 0 && (
            <div className="form-stack">
              <label>
                Action reason
                <textarea aria-label="Action reason" value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              <div className="page-actions">
                {data.allowedActions.includes("retry") && (
                  <button
                    className="button"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate(actionRequest, { onSuccess: (result) => setMessage(actionMessage(result, "Retry")) })}
                    type="button"
                  >
                    Retry job
                  </button>
                )}
                {data.allowedActions.includes("cancel") && (
                  <button
                    className="button secondary"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(actionRequest, { onSuccess: (result) => setMessage(actionMessage(result, "Cancel")) })}
                    type="button"
                  >
                    Cancel job
                  </button>
                )}
              </div>
              {message && <p role="status">{message}</p>}
            </div>
          )}
        </article>
      </section>
      <article className="card">
        <h2>Metadata</h2>
        <dl className="detail-grid">
          {data.metadata.map((item) => <div className="detail-item" key={item.key}><dt>{item.label}</dt><dd>{String(item.value)}</dd></div>)}
        </dl>
      </article>
      <article className="card">
        <h2>Timeline</h2>
        <ol>
          {data.timeline.map((item) => <li key={`${item.event}-${item.at}`}>{item.at}: {item.event} — {item.summary}</li>)}
        </ol>
      </article>
    </div>
  );
}
