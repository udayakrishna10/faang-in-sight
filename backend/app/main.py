import os
import math
from datetime import date, datetime

import numpy as np
import pandas as pd
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.cloud import bigquery
from openai import OpenAI
from pydantic import BaseModel

from .sql_generator import generate_sql  # currently unused, but kept for future
from .ai_responder import respond_as_ai  # currently unused, but kept for future


# ===========================
# CONFIGURATION
# ===========================

PROJECT_ID = os.environ.get("GCP_PROJECT", "faang-stock-analytics")
DATASET = os.environ.get("GCP_DATASET", "faang_dataset")
GOLD_TABLE = os.environ.get("GOLD_TABLE", "gold")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
NEWS_API_KEY = os.getenv("NEWS_API_KEY")

# Map FAANG tickers to company names (for news)
# Map FAANG tickers to company names (for news)
TICKER_TO_COMPANY = {
    "AAPL": "Apple",
    "AMZN": "Amazon",
    "META": "Meta",
    "NFLX": "Netflix",
    "GOOGL": "Google",
}

# Restrict NewsAPI to well-known finance / business domains
FINANCE_DOMAINS = ",".join(
    [
        "bloomberg.com",
        "reuters.com",
        "wsj.com",
        "cnbc.com",
        "ft.com",
        "marketwatch.com",
        "finance.yahoo.com",
        "barrons.com",
        "fool.com",          # Motley Fool
        "seekingalpha.com",
        "investors.com",     # Investor's Business Daily
    ]
)

# Additional safety: only accept these source names from the API
REPUTED_SOURCES = {
    "Bloomberg",
    "Reuters",
    "The Wall Street Journal",
    "CNBC",
    "Financial Times",
    "MarketWatch",
    "Yahoo Finance",
    "Barron’s",
    "Barron's",
    "The Motley Fool",
    "Seeking Alpha",
    "Investor's Business Daily",
}

STOCK_KEYWORDS = [
    "stock",
    "shares",
    "earnings",
    "quarter",
    "q1",
    "q2",
    "q3",
    "q4",
    "guidance",
    "outlook",
    "revenue",
    "profit",
    "loss",
    "valuation",
    "price target",
    "analyst",
    "dividend",
]


def is_stock_related(title: str, description: str, company: str) -> bool:
    """
    Returns True if the article looks like it's about the company's stock/financial performance.
    """
    text = f"{title or ''} {description or ''}".lower()
    if company.lower() not in text:
        # Must at least mention the company
        return False
    return any(k in text for k in STOCK_KEYWORDS)



# ===========================
# CLIENTS
# ===========================

bq_client = bigquery.Client(project=PROJECT_ID)
openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


# ===========================
# FASTAPI APP
# ===========================

app = FastAPI(
    title="Faang-in-Sight API",
    description="LLM-powered insights + time-series analytics for FAANG stocks",
    version="1.0.0",
)

# CORS configuration
origins = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "https://faang-in-sight-uk.vercel.app",  
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,   
    allow_methods=["*"],       
    allow_headers=["*"],
)




app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===========================
# MODELS
# ===========================

class AskRequest(BaseModel):
    question: str

class CompareRequest(BaseModel):
    ticker1: str
    ticker2: str
    days: int = 60  # lookback window

# ===========================
# ROUTES
# ===========================

@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "faang-in-sight"}


@app.post("/ask")
def ask(request: AskRequest):
    """
    Take a natural language question, pull recent FAANG data from BigQuery,
    and have OpenAI generate a human-friendly insight.
    """
    question = (request.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question must not be empty.")

    if openai_client is None:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY environment variable is not set.",
        )

    # 1) Pull recent data from the gold table (last 60 days)
    query = f"""
        SELECT
          ticker,
          trade_date,
          close,
          daily_return,
          cumulative_return,
          rsi_14,
          ma_20,
          ma_50
        FROM `{PROJECT_ID}.{DATASET}.{GOLD_TABLE}`
        WHERE trade_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
        ORDER BY trade_date DESC
    """
    df = bq_client.query(query).to_dataframe()

    if df.empty:
        raise HTTPException(
            status_code=500,
            detail="No data available in gold table to answer the question.",
        )

    # Clean inf/NaN for safe string conversion
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.where(pd.notnull(df), None)

    df_preview = df.head(80)
    df_str = df_preview.to_string(index=False)

    prompt = f"""
You are a friendly financial analyst focusing on FAANG stocks
(Apple - AAPL, Amazon - AMZN, Meta - META, Netflix - NFLX, Google - GOOGL).

User question:
{question}

You have recent daily data from the FAANG gold table (preview):

{df_str}

Columns:
- ticker: stock symbol
- trade_date: date
- close: closing price
- daily_return: day-over-day return
- cumulative_return: compounded return
- rsi_14: 14-day RSI
- ma_20, ma_50: moving averages

Task:
- Answer the user's question in 2–3 short paragraphs.
- Focus on trends, momentum, and risk.
- If the user mentions specific tickers, focus on those.
- Do not invent exact numbers; speak qualitatively.
- Do NOT give explicit investment advice.
"""

    try:
        completion = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a clear, concise, neutral stock analyst. You do not give investment advice.",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.7,
        )
        answer = completion.choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI error: {str(e)}")

    return {"answer": answer}


@app.get("/chart-data")
def chart_data(ticker: str = "AAPL"):
    """
    Returns time-series charting data for price + moving averages.
    Cleans NaN/Inf values so JSON encoding does not fail.
    """
    query = f"""
        SELECT
          trade_date,
          open,
          high,
          low,
          close,
          total_volume,
          ma_20,
          ma_50
        FROM `{PROJECT_ID}.{DATASET}.{GOLD_TABLE}`
        WHERE ticker = @ticker
        ORDER BY trade_date
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("ticker", "STRING", ticker)]
    )

    df = bq_client.query(query, job_config=job_config).to_dataframe()

    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data found for ticker: {ticker}")

    # Replace inf with NaN
    df = df.replace([np.inf, -np.inf], np.nan)

    # Build a JSON-safe list of points
    points = []
    for _, row in df.iterrows():
        record = {}
        for col, val in row.items():
            # Handle pandas Timestamps / dates explicitly
            if isinstance(val, (pd.Timestamp, datetime, date)):
                record[col] = val.isoformat()
            # Handle floats that might be NaN/Inf
            elif isinstance(val, (float, np.floating)):
                if math.isfinite(val):
                    record[col] = float(val)
                else:
                    record[col] = None
            # Handle other types (including None)
            else:
                if pd.isna(val):
                    record[col] = None
                else:
                    record[col] = val
        points.append(record)

    return {
        "ticker": ticker.upper(),
        "points": points,
    }


@app.get("/news")
def get_news(ticker: str = "AAPL", limit: int = 10):
    """
    Fetch recent news for a ticker from reputable, finance-focused sources only.
    Filters:
      - Only domains in FINANCE_DOMAINS
      - Only sources in REPUTED_SOURCES (if present)
      - Only headlines that look stock/earnings related
    """
    symbol = ticker.upper()
    company = TICKER_TO_COMPANY.get(symbol, symbol)

    if not NEWS_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="NEWS_API_KEY is not set on the server.",
        )

    params = {
        "q": f'"{company}" AND (stock OR shares OR earnings OR guidance OR analyst)',
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": limit * 2,  # fetch extra, we'll filter down
        "apiKey": NEWS_API_KEY,
        "domains": FINANCE_DOMAINS,
    }

    resp = requests.get("https://newsapi.org/v2/everything", params=params)
    if resp.status_code != 200:
        raise HTTPException(
            status_code=500,
            detail=f"News API error: {resp.status_code} {resp.text}",
        )

    data = resp.json()
    articles = data.get("articles", [])

    filtered = []
    for a in articles:
        title = a.get("title") or ""
        description = a.get("description") or ""
        source_obj = a.get("source") or {}
        source_name = source_obj.get("name") or ""

        # Only keep from reputable sources (if name is available)
        if source_name and source_name not in REPUTED_SOURCES:
            continue

        # Only keep if it's clearly about the company's stock / earnings
        if not is_stock_related(title, description, company):
            continue

        filtered.append(
            {
                "title": title,
                "description": description,
                "source": source_name,
                "url": a.get("url"),
                "published_at": a.get("publishedAt"),
            }
        )

        if len(filtered) >= limit:
            break

    if not filtered:
        raise HTTPException(
            status_code=404, detail="No suitable stock-related news articles found."
        )

    return {
        "ticker": symbol,
        "company": company,
        "articles": filtered,
    }


@app.get("/news-sentiment")
def news_sentiment(ticker: str = "AAPL", limit: int = 10):
    """
    Fetch recent finance/stock news for a ticker and summarize sentiment with OpenAI.
    Only uses reputable, finance-focused sources.
    """
    symbol = ticker.upper()
    company = TICKER_TO_COMPANY.get(symbol, symbol)

    if not NEWS_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="NEWS_API_KEY is not set on the server.",
        )

    params = {
        "q": f'"{company}" AND (stock OR shares OR earnings OR guidance OR analyst)',
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": limit * 2,
        "apiKey": NEWS_API_KEY,
        "domains": FINANCE_DOMAINS,
    }

    resp = requests.get("https://newsapi.org/v2/everything", params=params)
    if resp.status_code != 200:
        raise HTTPException(
            status_code=500,
            detail=f"News API error: {resp.status_code} {resp.text}",
        )

    data = resp.json()
    articles = data.get("articles", [])
    if not articles:
        raise HTTPException(status_code=404, detail="No news articles found.")

    headlines_for_llm = []
    headlines_for_client = []

    for a in articles:
        title = a.get("title") or ""
        description = a.get("description") or ""
        source_obj = a.get("source") or {}
        source_name = source_obj.get("name") or ""
        url = a.get("url")

        # Reputable sources only
        if source_name and source_name not in REPUTED_SOURCES:
            continue

        # Stock-related only
        if not is_stock_related(title, description, company):
            continue

        headlines_for_llm.append(f"- [{source_name}] {title}")
        headlines_for_client.append(
            {
                "title": title,
                "source": source_name,
                "url": url,
                "published_at": a.get("publishedAt"),
            }
        )

        if len(headlines_for_client) >= limit:
            break

    if not headlines_for_client:
        raise HTTPException(
            status_code=404,
            detail="No suitable stock-related news articles found from reputable sources.",
        )

    headlines_text = "\n".join(headlines_for_llm)

    if openai_client is None:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY environment variable is not set.",
        )

    prompt = f"""
You are a neutral news sentiment analyst.

Here are recent *stock/finance* headlines for {company} ({symbol})
from reputable business/finance outlets:

{headlines_text}

Tasks:
- Summarize the overall sentiment (e.g., mostly positive, mostly negative, or mixed).
- Explicitly mention a few of the sources by name (for example, "According to Bloomberg and CNBC...").
- Highlight any recurring stock-related themes (earnings beats/misses, guidance, analyst rating changes, regulation, etc.).
- Keep it short: 2–3 paragraphs.
- Do NOT give trading or investment advice.
"""

    try:
        completion = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You summarize stock market news objectively and mention the outlets you reference.",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.4,
        )
        sentiment_summary = completion.choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI error: {str(e)}")

    return {
        "ticker": symbol,
        "company": company,
        "articles": headlines_for_client,
        "sentiment_summary": sentiment_summary,
    }
    
@app.post("/compare-stocks")
def compare_stocks(req: CompareRequest):
    """
    Compare two tickers over the last N days using the gold table + OpenAI.
    Returns:
      - small stats table per ticker
      - Apple-style 'card' analysis as markdown text
    """
    if openai_client is None:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY environment variable is not set.",
        )

    t1 = req.ticker1.upper()
    t2 = req.ticker2.upper()
    if t1 == t2:
        raise HTTPException(
            status_code=400,
            detail="Please provide two different tickers.",
        )

    days = max(7, min(req.days, 365))

    query = f"""
        SELECT
          ticker,
          trade_date,
          close,
          daily_return,
          cumulative_return,
          rsi_14,
          ma_20,
          ma_50
        FROM `{PROJECT_ID}.{DATASET}.{GOLD_TABLE}`
        WHERE trade_date >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
          AND ticker IN (@t1, @t2)
        ORDER BY trade_date DESC
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("days", "INT64", days),
            bigquery.ScalarQueryParameter("t1", "STRING", t1),
            bigquery.ScalarQueryParameter("t2", "STRING", t2),
        ]
    )

    df = bq_client.query(query, job_config=job_config).to_dataframe()
    if df.empty:
        raise HTTPException(
            status_code=404,
            detail="No data found for those tickers in the selected window.",
        )

    # Clean inf/nan
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.where(pd.notnull(df), None)

    # Simple per-ticker summary (most recent row per ticker)
    summary = (
        df.sort_values("trade_date", ascending=False)
        .groupby("ticker")
        .agg(
            last_close=("close", "first"),
            avg_daily_return=("daily_return", "mean"),
            last_cumulative_return=("cumulative_return", "first"),
            last_rsi=("rsi_14", "first"),
            last_ma20=("ma_20", "first"),
            last_ma50=("ma_50", "first"),
        )
        .reset_index()
    )

    summary_str = summary.to_string(index=False)
    preview_str = df.head(60).to_string(index=False)

    prompt = f"""
You are a neutral, professional equity analyst.

Your job is to produce an Apple-style card layout in MARKDOWN only.
Do NOT include JSON, just headings and bullet points / short sentences.

Context:
- We are comparing two FAANG stocks: {t1} and {t2}
- Lookback window: last {days} trading days

Here is a compact per-ticker summary table (one row per ticker):
{summary_str}

Sample of recent daily rows:
{preview_str}

Columns:
- last_close, avg_daily_return, last_cumulative_return
- last_rsi (rsi_14)
- last_ma20 (ma_20), last_ma50 (ma_50)
- daily_return and cumulative_return show recent momentum
- rsi_14 indicates overbought/oversold tendencies
- ma_20 vs ma_50 describes short vs medium-term trend

Write your answer as FIVE clearly separated 'cards' using markdown headings:

Momentum Overview
- Compare the recent momentum of {t1} vs {t2} using *relative* language.
- Mention who has stronger short-term trend and whether it is subtle or clearly stronger.

Overbought / Oversold (RSI)
- Explain which ticker is closer to the overbought side and which is closer to the oversold side.
- Use phrases like "closer to the hot zone" or "cooler, with more room to recover".
- Keep this educational and intuitive.

Moving Average Trend Check
- Compare ma_20 vs ma_50 for each stock.
- State which one has a cleaner bullish alignment (short MA above long MA with some separation) vs a flatter or more neutral trend.

Risk & Volatility Snapshot
- Comment on which stock's recent daily returns appear more volatile vs steadier.
- Frame this in neutral terms (not good or bad), e.g. "more movement" vs "smoother path".

Analyst Note (Not Financial Advice)
- One short paragraph that starts EXACTLY with:
  "This is not financial advice, but in general analysts may look at momentum, RSI, and moving averages to understand short-term behavior."
- Do NOT recommend buying, selling, or holding any stock.

Rules:
- Do NOT repeat any of the raw numeric values (no exact prices, no 0.0234, no 5.2%).
- Use only qualitative language: "slightly stronger", "meaningfully higher", "modest underperformance", etc.
- Keep each card to 2–4 short bullet points or 1–2 short sentences.
"""

    try:
        completion = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a neutral, professional equity analyst. You do not give investment advice.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.6,
        )
        analysis = completion.choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI error: {str(e)}")

    return {
        "ticker1": t1,
        "ticker2": t2,
        "days": days,
        "table": summary.to_dict(orient="records"),
        "analysis": analysis,
    }


@app.get("/faang-dashboard")
def faang_dashboard(days: int = 30):
    """
    Returns compact metrics for all FAANG names for UI dashboard cards.
    """
    days = max(7, min(days, 180))

    query = f"""
        SELECT
          ticker,
          trade_date,
          close,
          daily_return,
          cumulative_return,
          rsi_14
        FROM `{PROJECT_ID}.{DATASET}.{GOLD_TABLE}`
        WHERE trade_date >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
          AND ticker IN ("AAPL", "AMZN", "META", "NFLX", "GOOGL")
        ORDER BY trade_date DESC
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("days", "INT64", days),
        ]
    )

    df = bq_client.query(query, job_config=job_config).to_dataframe()
    if df.empty:
        raise HTTPException(status_code=404, detail="No FAANG data found.")

    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.where(pd.notnull(df), None)

    # One latest row per ticker
    latest = (
        df.sort_values("trade_date", ascending=False)
        .groupby("ticker")
        .agg(
            last_date=("trade_date", "first"),
            last_close=("close", "first"),
            last_daily_return=("daily_return", "first"),
            last_cumulative_return=("cumulative_return", "first"),
            last_rsi=("rsi_14", "first"),
        )
        .reset_index()
    )

    return {
        "days": days,
        "tickers": latest.to_dict(orient="records"),
    }


