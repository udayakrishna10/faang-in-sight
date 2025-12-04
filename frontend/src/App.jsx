import { useState, useEffect } from "react";
import Plot from "react-plotly.js";
import axios from "axios";
import "./App.css";
import logo from "./assets/faang-logo.png"; 

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

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
      setAiAnswer("Error: Could not fetch AI response.");
    }
  };

  // ---------- Chart + News ----------
  const loadChart = async (ticker) => {
    try {
      const response = await axios.get(`${API_BASE}/chart-data?ticker=${ticker}`);
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
      setNewsSummary("Error loading news sentiment.");
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
      setCompareAnalysis("Error comparing these stocks.");
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
    <div className="app-root">
      {/* HEADER */}
      <header className="app-header">
        <img src={logo} alt="FAANG in Sight logo" className="app-logo" />
        <p className="app-tagline">
          AI-powered insights for Apple, Amazon, Meta, Netflix & Google
        </p>
      </header>

      {/* MAIN CONTENT */}
      <main className="app-main">
        {/* LEFT COLUMN */}
        <div className="app-column app-column-main">
          {/* Ask AI */}
          <section className="card card-full">
            <h2 className="card-title">💬 Ask the AI Analyst</h2>
            <p className="card-subtitle">
              Ask about trends, momentum, or how two FAANG names compare.
            </p>
            <textarea
              rows="3"
              className="text-input"
              placeholder="Example: Compare recent performance between Apple and Amazon."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button className="btn btn-primary" onClick={askAI}>
              🚀 Ask AI
            </button>

            {aiAnswer && (
              <div className="card card-nested">
                <h3 className="nested-title">🤖 AI says</h3>
                <p className="nested-body">{aiAnswer}</p>
              </div>
            )}
          </section>

          {/* Chart */}
          <section className="card card-full">
            <div className="card-header-row">
              <h2 className="card-title">📈 Price & Moving Averages</h2>
            </div>
            <div className="pill-row">
              {TICKERS.map((t) => (
                <button
                  key={t}
                  onClick={() => handleSelectTicker(t)}
                  className={
                    t === selectedTicker ? "pill pill-active" : "pill pill-idle"
                  }
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="card-subtitle small">
              Selecting a ticker updates the chart and sentiment below.
            </p>

            {chartData && (
              <div className="chart-wrapper">
                <Plot
                  data={[
                    {
                      x: chartData.points.map((p) => p.trade_date),
                      y: chartData.points.map((p) => p.close),
                      type: "scatter",
                      mode: "lines",
                      name: `${chartData.ticker} Close`,
                    },
                    {
                      x: chartData.points.map((p) => p.trade_date),
                      y: chartData.points.map((p) => p.ma_20),
                      type: "scatter",
                      mode: "lines",
                      name: "MA 20",
                    },
                    {
                      x: chartData.points.map((p) => p.trade_date),
                      y: chartData.points.map((p) => p.ma_50),
                      type: "scatter",
                      mode: "lines",
                      name: "MA 50",
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
          </section>

          {/* News & Sentiment */}
          <section className="card card-full">
            <h2 className="card-title">📰 News Sentiment</h2>
            <p className="card-subtitle small">
              Stock-focused headlines from reputable finance outlets for{" "}
              <strong>{selectedTicker}</strong>.
            </p>

            {loadingNews && <p className="muted">Loading news…</p>}

            {!loadingNews && newsSummary && (
              <div className="card card-nested">
                <h3 className="nested-title">Sentiment summary</h3>
                <p className="nested-body">{newsSummary}</p>
              </div>
            )}

            {!loadingNews && newsArticles.length > 0 && (
              <div className="news-list">
                <h4 className="nested-title">Top headlines</h4>
                <ul>
                  {newsArticles.map((a, idx) => (
                    <li key={idx}>
                      <span className="news-source">
                        {a.source ? `[${a.source}] ` : ""}
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

            {!loadingNews && !newsSummary && newsArticles.length === 0 && (
              <p className="muted">
                Select a ticker above to load its latest news and sentiment.
              </p>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN */}
        <div className="app-column app-column-side">
          {/* FAANG Snapshot */}
          <section className="card">
            <h2 className="card-title">📊 FAANG Snapshot (30 days)</h2>
            <p className="card-subtitle small">
              Quick view of price, return, and RSI for each name.
            </p>

            <div className="grid-cards">
              {dashboard &&
                dashboard.tickers &&
                dashboard.tickers.map((t) => (
                  <div
                    key={t.ticker}
                    className={
                      t.last_daily_return > 0
                        ? "mini-card mini-card-up"
                        : "mini-card mini-card-down"
                    }
                  >
                    <div className="mini-header">
                      <span className="mini-ticker">{t.ticker}</span>
                      <span className="mini-date">{t.last_date}</span>
                    </div>
                    <div className="mini-body">
                      <div className="mini-line">
                        Close:{" "}
                        <strong>
                          {t.last_close != null
                            ? `$${t.last_close.toFixed(2)}`
                            : "—"}
                        </strong>
                      </div>
                      <div className="mini-line">
                        Daily:{" "}
                        <span
                          className={
                            t.last_daily_return >= 0 ? "up-text" : "down-text"
                          }
                        >
                          {t.last_daily_return != null
                            ? `${(t.last_daily_return * 100).toFixed(2)}%`
                            : "—"}
                        </span>
                      </div>
                      <div className="mini-line muted">
                        RSI 14:{" "}
                        {t.last_rsi != null
                          ? t.last_rsi.toFixed(1)
                          : "—"}
                      </div>
                    </div>
                  </div>
                ))}
              {!dashboard && (
                <p className="muted">Loading FAANG snapshot…</p>
              )}
            </div>
          </section>

          {/* Compare Two Stocks */}
          <section className="card">
            <h2 className="card-title">⚖️ Compare Two FAANG Stocks</h2>
            <p className="card-subtitle small">
              Choose any two tickers and let the AI craft a side-by-side view.
            </p>

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
              {loadingCompare ? "Comparing…" : "Compare"}
            </button>

            {compareAnalysis && (
              <div className="card card-nested compare-output">
                <h3 className="nested-title">AI comparison</h3>
                <p className="nested-body">{compareAnalysis}</p>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="app-footer">
        <span>© {new Date().getFullYear()} FAANG in Sight · Built by Udaya Krishna Karanam</span>
      </footer>
    </div>
  );
}

export default App;
