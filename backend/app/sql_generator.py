from openai import OpenAI


def generate_sql(question: str) -> str:
    """
    Uses OpenAI to translate a natural language question into
    a BigQuery SQL query over the 'gold' table.
    """
    schema_hint = """
    Table: faang-stock-analytics.faang_dataset.gold
    Columns:
    - ticker (STRING)
    - trade_date (DATE)
    - open, high, low, close (FLOAT)
    - total_volume (INTEGER)
    - avg_ma_10, ma_20, ma_50 (FLOAT)
    - avg_return_1h, daily_return, cumulative_return (FLOAT)
    - rsi_14 (FLOAT)
    - bollinger_upper, bollinger_lower (FLOAT)
    - macd_line, signal_line, macd_histogram (FLOAT)
    """

    client = OpenAI()
    prompt = f"""
Generate a valid BigQuery SQL query (no comments, no explanations).

Use ONLY the table and columns described below:

{schema_hint}

The query should answer this question:

{question}
"""

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You generate only SQL for BigQuery."},
            {"role": "user", "content": prompt},
        ],
        temperature=0,
    )

    sql = resp.choices[0].message.content.strip()
    sql = sql.replace("```sql", "").replace("```", "").strip()
    return sql
