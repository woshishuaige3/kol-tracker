# -*- coding: utf-8 -*-
# 抓取 KOL 推文 + 配股价 + 生成 data.json
import os
import re
import json
import time
import datetime
import urllib.request
import urllib.parse

# ============== 配置区（你可以改这里） ==============
KOLS = [
    {"handle": "qinbafrank", "name": "qinbafrank"},
    {"handle": "aleabitoreddit", "name": "Serenity"},
]
TWEETS_PER_KOL = 50
TWITTER_API_KEY = os.environ.get("TWITTER_API_KEY", "")

# ============== 可替换层：抓推文（将来切 RSSHub 只改这个函数） ==============
def get_tweets(handle):
    if not TWITTER_API_KEY:
        print("  [警告] 没有 TWITTER_API_KEY，跳过抓取")
        return []
    base = "https://api.twitterapi.io/twitter/user/last_tweets"
    params = urllib.parse.urlencode({"userName": handle, "count": TWEETS_PER_KOL})
    url = base + "?" + params
    req = urllib.request.Request(url, headers={"X-API-Key": TWITTER_API_KEY})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"  [错误] 抓 {handle} 失败：{e}")
        return []
    tweets = []
    raw_list = data.get("tweets") or data.get("data") or []
    for t in raw_list:
        text = t.get("text", "")
        tid = str(t.get("id", ""))
        likes = t.get("likeCount", t.get("favorite_count", 0)) or 0
        created_raw = t.get("createdAt", t.get("created_at", ""))
        created = _parse_time(created_raw)
        tweets.append({
            "id": tid, "text": text, "created_at": created,
            "likes": likes, "url": f"https://x.com/{handle}/status/{tid}",
        })
    return tweets

def _parse_time(s):
    if not s:
        return datetime.datetime.utcnow()
    for fmt in ("%a %b %d %H:%M:%S %z %Y", "%Y-%m-%dT%H:%M:%S.%fZ",
                "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.datetime.strptime(s, fmt).replace(tzinfo=None)
        except Exception:
            continue
    return datetime.datetime.utcnow()

# ============== 提取股票代码 ==============
def extract_tickers(text):
    raw = re.findall(r"\$([A-Za-z]{1,6}|\d{4,6})", text)
    out = []
    for r in raw:
        r = r.upper()
        if r not in out:
            out.append(r)
    return out

# ============== 配股价（Yahoo Finance） ==============
def get_price_history(ticker):
    symbol = _yahoo_symbol(ticker)
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
           f"?range=1y&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        result = data["chart"]["result"][0]
        ts = result["timestamp"]
        closes = result["indicators"]["quote"][0]["close"]
        series = []
        for t, c in zip(ts, closes):
            if c is None:
                continue
            d = datetime.datetime.utcfromtimestamp(t).strftime("%Y-%m-%d")
            series.append((d, round(c, 2)))
        return series
    except Exception as e:
        print(f"  [价格] {ticker} 拿不到：{e}")
        return []

def _yahoo_symbol(ticker):
    if ticker.isdigit():
        return ticker + ".KS"
    return ticker

def price_on_or_after(series, date_str):
    for d, c in series:
        if d >= date_str:
            return c
    return series[-1][1] if series else None

# ============== 主流程 ==============
def main():
    tickers_seen = {}
    stocks = {}
    kol_pages = {}
    for kol in KOLS:
        handle = kol["handle"]
        name = kol["name"]
        print(f"抓取 {name} (@{handle}) ...")
        tweets = get_tweets(handle)
        print(f"  拿到 {len(tweets)} 条推文")
        kol_pages[handle] = {"name": name, "handle": handle, "tickers": {}}
        for tw in tweets:
            tickers = extract_tickers(tw["text"])
            if not tickers:
                continue
            date_str = tw["created_at"].strftime("%Y-%m-%d")
            for tk in tickers:
                if tk not in tickers_seen:
                    tickers_seen[tk] = get_price_history(tk)
                    time.sleep(0.5)
                series = tickers_seen[tk]
                cur_price = series[-1][1] if series else None
                mention_price = price_on_or_after(series, date_str) if series else None
                change = None
                if cur_price and mention_price:
                    change = round((cur_price - mention_price) / mention_price * 100, 1)
                s = stocks.setdefault(tk, {
                    "ticker": tk, "kols": {}, "mentions": 0,
                    "current_price": cur_price,
                    "history": [[d, c] for d, c in series][-260:],
                })
                s["current_price"] = cur_price
                s["mentions"] += 1
                s["kols"].setdefault(name, {"mentions": 0, "first_date": date_str,
                                            "change": change, "tweets": []})
                k = s["kols"][name]
                k["mentions"] += 1
                if date_str < k["first_date"]:
                    k["first_date"] = date_str
                    k["change"] = change
                k["tweets"].append({
                    "date": date_str, "text": tw["text"],
                    "likes": tw["likes"], "url": tw["url"],
                    "mention_price": mention_price,
                })
                p = kol_pages[handle]["tickers"].setdefault(tk, {
                    "ticker": tk, "history": [[d, c] for d, c in series][-260:],
                    "current_price": cur_price, "tweets": [],
                })
                p["tweets"].append({
                    "date": date_str, "text": tw["text"],
                    "likes": tw["likes"], "url": tw["url"],
                    "mention_price": mention_price, "change": change,
                })
    out = {
        "updated_at": datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "stocks": list(stocks.values()),
        "kols": list(kol_pages.values()),
    }
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"完成，写入 data.json：{len(stocks)} 只标的，{len(KOLS)} 位 KOL")

if __name__ == "__main__":
    main()
