import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "../auth/AuthContext";
import {
  generateReport,
  generateSeasonOverview,
  getReport,
  listReports,
  type ReportDetail,
  type ReportSummary,
} from "../api/apiClient";

export function ReportsView() {
  const { idToken } = useAuth();
  const [topic, setTopic] = useState("");
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [selected, setSelected] = useState<ReportDetail | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingSeason, setGeneratingSeason] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshList() {
    if (!idToken) return;
    setReports(await listReports(idToken));
  }

  useEffect(() => {
    refreshList().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idToken]);

  async function handleGenerate() {
    if (!topic.trim() || !idToken) return;
    setGenerating(true);
    setError(null);
    try {
      const report = await generateReport(idToken, topic);
      setSelected(report);
      setTopic("");
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function openReport(reportId: string) {
    if (!idToken) return;
    setSelected(await getReport(idToken, reportId));
  }

  async function handleGenerateSeasonOverview() {
    if (!idToken) return;
    setGeneratingSeason(true);
    setError(null);
    try {
      const report = await generateSeasonOverview(idToken);
      setSelected(report);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingSeason(false);
    }
  }

  return (
    <div className="reports-view">
      <div className="reports-sidebar">
        <button
          className="season-overview-button"
          onClick={handleGenerateSeasonOverview}
          disabled={generatingSeason}
        >
          {generatingSeason ? "Scoring 2025 season..." : "Generate 2025 Season Overview"}
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleGenerate();
          }}
        >
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Augusta National"
            disabled={generating}
          />
          <button type="submit" disabled={generating || !topic.trim()}>
            {generating ? "Generating..." : "Generate one-pager"}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <ul className="reports-list">
          {reports.map((r) => (
            <li key={r.reportId}>
              <button onClick={() => openReport(r.reportId)}>
                {r.topic}
                <span className="reports-date">
                  {new Date(r.generatedAt).toLocaleDateString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="report-detail">
        {selected ? (
          <ReactMarkdown>{selected.body}</ReactMarkdown>
        ) : (
          <p>Select a report, or generate a new one-pager for a topic.</p>
        )}
      </div>
    </div>
  );
}
