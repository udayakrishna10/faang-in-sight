import pandas as pd
from openai import OpenAI


def respond_as_ai(client: OpenAI, question: str, df: pd.DataFrame) -> str:
    """
    Take the user's question + top rows of the BigQuery result and return
    a natural-language explanation of the trend.
    """
    if df.empty:
        df_str = "(No rows returned from query.)"
    else:
        df_str = df.head(10).to_string(index=False)

    prompt = f"""
You are a friendly, clear stock market AI assistant.

The user asked:
{question}

Here is the data you may use (first few rows of the result):
{df_str}

Explain, in a concise and conversational tone:
- What is happening with the stock(s)
- Any visible trends (uptrend, downtrend, sideways)
- Any interesting RSI, moving average, or MACD-style signals if they are visible
- Keep it understandable for a non-expert.
"""

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a clear, concise financial assistant."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
    )

    return resp.choices[0].message.content.strip()
