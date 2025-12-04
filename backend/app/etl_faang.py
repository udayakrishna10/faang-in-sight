import os
import pandas as pd
import yfinance as yf
from google.cloud import bigquery

# Config via environment variables (with defaults)
PROJECT_ID = os.environ.get("GCP_PROJECT", "faang-stock-analytics")
DATASET_ID = os.environ.get("GCP_DATASET", "faang_dataset")
TABLE_ID = os.environ.get("BRONZE_TABLE", "bronze")

FAANG_SYMBOLS = ["AAPL", "AMZN", "META", "NFLX", "GOOGL"]


def fetch_stock_data(symbols):
    """Fetch 6 months of hourly data for each symbol from Yahoo Finance."""
    frames = []
    for sym in symbols:
        data = yf.download(sym, period="6mo", interval="1h")
        data = data.reset_index()
        data["ticker"] = sym
        frames.append(
            data[["Datetime", "ticker", "Open", "High", "Low", "Close", "Volume"]]
            .rename(columns={"Datetime": "timestamp"})
        )
    return pd.concat(frames, ignore_index=True)


def load_to_bigquery(df: pd.DataFrame):
    """Append the fetched data into the bronze table in BigQuery."""
    client = bigquery.Client(project=PROJECT_ID)
    table_ref = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"

    job_config = bigquery.LoadJobConfig(
        write_disposition="WRITE_APPEND"
    )

    job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
    job.result()
    print(f"Loaded {len(df)} rows into {table_ref}")


if __name__ == "__main__":
    df = fetch_stock_data(FAANG_SYMBOLS)
    load_to_bigquery(df)
