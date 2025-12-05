import { useState, useEffect } from "react";
import Plot from "react-plotly.js";
import axios from "axios";
import "./App.css";
import logo from "./assets/CROWN.png";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "https://faang-backend-1007680875469.us-central1.run.app";

function App() {
  const [question, setQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [chartData, setChartData] = useState(null);
  const [selectedTicker, setSelectedTicker] = useState("AAPL");

  const [newsSummary, setNewsSummary] = useState("");
  const [newsArticles, setNewsArticles] = useState([]);
  const [loadingNews, setLoadingNews] = useState(false);

  const [dashboard, setDashboard] = useState(null);

  const [compareTickers, setCompareTickers] = useState({
    left: "AAPL",
    right: "AMZN",
  });
  const [compareAnalysis, setCompareAnalysis] = useState("");
  const [loadingCompare, setLoadingCompare] = useState(false);

  const TICKERS = ["AAPL", "AMZN", "META", "NFLX", "GOOGL"];

  // ---------- AI Question ----------
  const askAI = async () => {
    if (!question.trim()) {
      setAiAnswer("Please type a question first.");
      return;
    }

    try {
      const response = await axios.post(`${API_BASE}/ask`, { question });
      setAiAnswer(response.data.answer);
    } catch (e) {
      console.error("Ask AI error:", e);
      const backendDetail =
        e?.response?.data?.detail ||
        e?.message ||
        "Unknown error talking to backend.";
      setAiAnswer(`Error: ${backendDetail}`);
    }
  };

  // ---------- Chart + News ----------
  const loadChart = async (ticker) => {
    try {
      const response = await axios.get(
        `${API_BASE}/chart-data?ticker=${ticker}`
      );
      setChartData(response.data);
    } catch (e) {
      console.error("Chart load error:", e);
      alert("Error loading chart data");
    }
  };

  const loadNews = async (ticker) => {
    try {
      setLoadingNews(true);
      setNewsSummary("");
      setNewsArticles([]);

      const response = await axios.get(
        `${API_BASE}/news-sentiment?ticker=${ticker}`
      );
      setNewsSummary(response.data.sentiment_summary || "");
      setNewsArticles(response.data.articles || []);
    } catch (e) {
      console.error("News load error:", e);
      const backendDetail =
        e?.response?.data?.detail ||
        e?.message ||
        "Unknown error loading news sentiment.";
      setNewsSummary(`Error loading news sentiment: ${backendDetail}`);
    } finally {
      setLoadingNews(false);
    }
  };

  const handleSelectTicker = (ticker) => {
    setSelectedTicker(ticker);
    loadChart(ticker);
    loadNews(ticker);
  };

  // ---------- Dashboard ----------
  const loadDashboard = async () => {
    try {
      const res = await axios.get(`${API_BASE}/faang-dashboard?days=30`);
      setDashboard(res.data);
    } catch (e) {
      console.error("Dashboard load error:", e);
    }
  };

  // ---------- Compare ----------
  const compareStocks = async () => {
    const left = compareTickers.left;
    const right = compareTickers.right;

    if (left === right) {
      setCompareAnalysis("Please choose two different tickers to compare.");
      return;
    }

    try {
      setLoadingCompare(true);
      setCompareAnalysis("Analyzing…");

      const res = await axios.post(`${API_BASE}/compare-stocks`, {
        ticker1: left,
        ticker2: right,
        days: 60,
      });

      setCompareAnalysis(res.data.analysis || "No analysis returned.");
    } catch (e) {
      console.error("Compare error:", e);
      const backendDetail =
        e?.response?.data?.detail ||
        e?.message ||
        "Unknown error comparing stocks.";
      setCompareAnalysis(`Error: ${backendDetail}`);
    } finally {
      setLoadingCompare(false);
    }
  };

  // ---------- On mount ----------
  useEffect(() => {
    loadDashboard();
    handleSelectTicker("AAPL");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page-root">
      {/* Top Nav */}
      <header className="site-header">
        <div className="shell">
          <div className="nav">
            <div className="nav-left">
              <img src={logo} alt="FAANG in Sight logo" className="nav-logo" />
              <div className="nav-title-block">
                <span className="nav-title">FAANG in Sight</span>
                <span className="nav-subtitle">
                  Real-time AI lens on Apple, Amazon, Meta, Netflix & Google
                </span>
              </div>
            </div>
            <div className="nav-right">
              <span className="nav-pill">Beta</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="site-main">
        {/* Hero / Ask AI */}
        <section className="hero">
          <div className="shell">
            <div className="hero-inner">
              <div className="hero-copy">
                <h1>
                  Your AI co-pilot
                  <br />
                  for FAANG market moves.
                </h1>
                <p>
                  Ask natural-language questions about momentum, relative
                  strength and risk across the FAANG complex — no terminals, no
                  spreadsheets.
                </p>

                <div className="hero-ai-box">
                  <label className="hero-label">Ask the AI analyst</label>
                  <textarea
                    rows="3"
                    className="hero-input"
                    placeholder='Ex: “How has Apple traded vs Amazon over the last month?”'
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                  <button className="btn btn-primary" onClick={askAI}>
                    🚀 Ask AI
                  </button>

                  {aiAnswer && (
                    <div className="hero-answer">
                      <div className="hero-answer-label">AI insight</div>
                      <p>{aiAnswer}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="hero-side">
                <div className="hero-highlight">
                  <p className="hero-highlight-label">Today&apos;s lens</p>
                  <p className="hero-highlight-body">
                    Select a FAANG ticker to see price action, moving averages
                    and curated news in one clean view.
                  </p>
                  <div className="hero-ticker-row">
                    {TICKERS.map((t) => (
                      <button
                        key={t}
                        onClick={() => handleSelectTicker(t)}
                        className={
                          t === selectedTicker
                            ? "ticker-chip ticker-chip-active"
                            : "ticker-chip"
                        }
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <p className="hero-ticker-caption">
                    Currently focused on <strong>{selectedTicker}</strong>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Analytics section */}
        <section className="section section-analytics">
          <div className="shell">
            <div className="section-grid">
              {/* Left: Chart + News */}
              <div className="section-col">
                <div className="panel panel-chart">
                  <div className="panel-header">
                    <h2>Price & moving averages</h2>
                    <span className="panel-meta">
                      20-day & 50-day trend for {selectedTicker}
                    </span>
                  </div>

                  {!chartData && (
                    <div className="chart-placeholder">
                      <p>Waiting for market data…</p>
                    </div>
                  )}

                  {chartData && (
                    <div className="chart-wrapper">
                      <Plot
                        data={[
                          {
                            x: chartData.points.map((p) => p.trade_date),
                            y: chartData.points.map((p) => p.close),
                            type: "scatter",
                            mode: "lines",
                            name: `${chartData.ticker} close`,
                          },
                          {
                            x: chartData.points.map((p) => p.trade_date),
                            y: chartData.points.map((p) => p.ma_20),
                            type: "scatter",
                            mode: "lines",
                            name: "20-day MA",
                          },
                          {
                            x: chartData.points.map((p) => p.trade_date),
                            y: chartData.points.map((p) => p.ma_50),
                            type: "scatter",
                            mode: "lines",
                            name: "50-day MA",
                          },
                        ]}
                        layout={{
                          title: "",
                          autosize: true,
                          legend: { orientation: "h" },
                          margin: { t: 10, l: 40, r: 10, b: 40 },
                        }}
                        style={{ width: "100%", height: "360px" }}
                      />
                    </div>
                  )}
                </div>

                <div className="panel panel-news">
                  <div className="panel-header">
                    <h2>Curated news & sentiment</h2>
                    <span className="panel-meta">
                      Finance-only sources for {selectedTicker}
                    </span>
                  </div>

                  {loadingNews && (
                    <p className="muted">Pulling recent headlines…</p>
                  )}

                  {!loadingNews && newsSummary && (
                    <div className="news-summary">
                      <h3>Sentiment snapshot</h3>
                      <p>{newsSummary}</p>
                    </div>
                  )}

                  {!loadingNews && newsArticles.length > 0 && (
                    <div className="news-list">
                      <h4>Recent headlines</h4>
                      <ul>
                        {newsArticles.map((a, idx) => (
                          <li key={idx}>
                            <span className="news-source">
                              {a.source ? `${a.source} · ` : ""}
                            </span>
                            {a.url ? (
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className="news-link"
                              >
                                {a.title}
                              </a>
                            ) : (
                              a.title
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!loadingNews &&
                    !newsSummary &&
                    newsArticles.length === 0 && (
                      <p className="muted">
                        No recent, stock-focused headlines surfaced yet for{" "}
                        {selectedTicker}.
                      </p>
                    )}
                </div>
              </div>

              {/* Right: Snapshot + Compare */}
              <div className="section-col">
                <div className="panel panel-snapshot">
                  <div className="panel-header">
                    <h2>FAANG snapshot</h2>
                    <span className="panel-meta">Last 30 trading days</span>
                  </div>

                  {!dashboard && (
                    <p className="muted">Loading FAANG overview…</p>
                  )}

                  {dashboard && dashboard.tickers && (
                    <div className="snapshot-list">
                      {dashboard.tickers.map((t) => (
                        <div
                          key={t.ticker}
                          className={
                            t.last_daily_return > 0
                              ? "snapshot-row snapshot-row-up"
                              : "snapshot-row snapshot-row-down"
                          }
                        >
                          <div className="snapshot-main">
                            <span className="snapshot-ticker">
                              {t.ticker}
                            </span>
                            <span className="snapshot-price">
                              {t.last_close != null
                                ? `$${t.last_close.toFixed(2)}`
                                : "—"}
                            </span>
                          </div>
                          <div className="snapshot-sub">
                            <span
                              className={
                                t.last_daily_return >= 0
                                  ? "snapshot-change up-text"
                                  : "snapshot-change down-text"
                              }
                            >
                              {t.last_daily_return != null
                                ? `${(t.last_daily_return * 100).toFixed(2)}%`
                                : "—"}
                            </span>
                            <span className="snapshot-rsi">
                              RSI 14{" "}
                              {t.last_rsi != null
                                ? t.last_rsi.toFixed(1)
                                : "—"}
                            </span>
                            <span className="snapshot-date">
                              {t.last_date}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="panel panel-compare">
                  <div className="panel-header">
                    <h2>Compare two names</h2>
                    <span className="panel-meta">
                      AI-written, Apple-style summary. No price targets.
                    </span>
                  </div>

                  <div className="compare-row">
                    <div className="compare-select">
                      <label>Stock A</label>
                      <select
                        value={compareTickers.left}
                        onChange={(e) =>
                          setCompareTickers((prev) => ({
                            ...prev,
                            left: e.target.value,
                          }))
                        }
                      >
                        {TICKERS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="compare-select">
                      <label>Stock B</label>
                      <select
                        value={compareTickers.right}
                        onChange={(e) =>
                          setCompareTickers((prev) => ({
                            ...prev,
                            right: e.target.value,
                          }))
                        }
                      >
                        {TICKERS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    className="btn btn-secondary"
                    onClick={compareStocks}
                    disabled={loadingCompare}
                  >
                    {loadingCompare ? "Comparing…" : "Run comparison"}
                  </button>

                  {compareAnalysis && (
                    <div className="compare-output">
                      <h3>AI comparison</h3>
                      <p>{compareAnalysis}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer (outside main to stick to bottom nicely) */}
      <footer className="site-footer">
        <div className="shell">
          <div className="footer-inner">
            © {new Date().getFullYear()} FAANG in Sight · Crafted by Udaya
            Krishna Karanam
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
