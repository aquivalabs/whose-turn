#!/usr/bin/env python3
# Whose Turn: a local monitor for your Jira tickets and GitHub PRs.
# Polls GitHub and Jira about once a minute, keeps state on disk, and pushes
# changes to the open window over server-sent events. Python 3.9, stdlib only.

import base64
import datetime as dt
import json
import os
import re
import subprocess
import shutil
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

APP_DIR = os.path.dirname(os.path.abspath(__file__))
HOST = "127.0.0.1"


def default_data_dir():
    if sys.platform == "darwin":
        return os.path.expanduser("~/Library/Application Support/whose-turn")
    if os.name == "nt":
        return os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "whose-turn")
    return os.path.join(os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config"), "whose-turn")


DATA_DIR = os.environ.get("WHOSE_TURN_DATA") or default_data_dir()
CONFIG_FILE = os.environ.get("WHOSE_TURN_CONFIG") or os.path.join(DATA_DIR, "config.json")
STATE_FILE = os.path.join(DATA_DIR, "state.json")
MARKS_FILE = os.path.join(DATA_DIR, "marks.json")
TODOS_FILE = os.path.join(DATA_DIR, "todos.json")
os.makedirs(DATA_DIR, exist_ok=True)

# ---------- workspace config. Everything that names an employer, an account or a team process lives in
# config.json next to the state, never in this file. See config.example.json for the keys.

DEFAULTS = {
    "port": 8765,
    "poll_seconds": 60,
    "history_days": 14,
    "github": {"repo": "", "org": "", "me": "", "bots": ["github-actions", "dependabot", "[bot]"]},
    "jira": {"base": "", "email": "", "keychain_service": "whose-turn-jira",
             "key_pattern": r"\b[A-Z][A-Z0-9_]+-\d+\b",
             "jql": "(assignee = currentUser() AND statusCategory != Done) "
                    "OR (assignee was currentUser() AND updated >= -30d) ORDER BY updated DESC"},
    "rules": {"release_branch_prefix": "release/", "approved_next": "Merge it", "approved_release_next": "Hand over to QA"},
}


def load_config():
    cfg = json.loads(json.dumps(DEFAULTS))
    try:
        with open(CONFIG_FILE) as f:
            user = json.load(f)
    except OSError:
        user = {}
    for k, v in user.items():
        if isinstance(v, dict) and isinstance(cfg.get(k), dict):
            cfg[k].update(v)
        else:
            cfg[k] = v
    if not user:
        cfg["problem"] = f"No workspace config at {CONFIG_FILE}. Copy config.example.json there and fill it in."
    if cfg["github"]["repo"] and not cfg["github"]["org"]:
        cfg["github"]["org"] = cfg["github"]["repo"].split("/")[0]
    return cfg


CONFIG = load_config()
PORT = int(os.environ.get("WHOSE_TURN_PORT") or CONFIG["port"])
REPO = CONFIG["github"]["repo"]
GH_ORG = CONFIG["github"]["org"]
GH_ME = CONFIG["github"]["me"]
JIRA_BASE = CONFIG["jira"]["base"].rstrip("/")
JIRA_EMAIL = CONFIG["jira"]["email"]
KEYCHAIN_SERVICE = CONFIG["jira"]["keychain_service"]
KEY_RE = re.compile(CONFIG["jira"]["key_pattern"])
JQL_TICKETS = CONFIG["jira"]["jql"]
RULES = CONFIG["rules"]
POLL_SECONDS = int(CONFIG["poll_seconds"])
HISTORY_DAYS = int(CONFIG["history_days"])
BOTS = re.compile("|".join(re.escape(b) for b in CONFIG["github"]["bots"]) or r"\[bot\]")

lock = threading.Lock()
changed = threading.Condition(lock)
wake = threading.Event()


def now_iso():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save_json(path, value):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(value, f)
    os.replace(tmp, path)


state = load_json(STATE_FILE, {})
state.setdefault("version", 0)
state.setdefault("errors", {})
for k in ("jira", "jira_comments", "prs", "activity", "events", "gh_asks"):
    state.setdefault(k, [])
marks = load_json(MARKS_FILE, {"seen": [], "base": None, "handled": {}, "notified": []})
marks.setdefault("notified", [])
todos = load_json(TODOS_FILE, [])


def bump():
    # Caller holds the lock.
    state["version"] += 1
    state["generated_at"] = now_iso()
    save_json(STATE_FILE, state)
    changed.notify_all()


# ---------- HTTP helpers with ETag caching (a 304 does not count against GitHub's limit)

etags = {}


class RateLimited(Exception):
    pass


def http_json(url, headers=None, method="GET", body=None, use_etag=True):
    headers = dict(headers or {})
    cached = etags.get(url) if (use_etag and method == "GET") else None
    if cached:
        headers["If-None-Match"] = cached[0]
    data = json.dumps(body).encode() if body is not None else None
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read() or b"null")
            etag = resp.headers.get("ETag")
            if etag and use_etag and method == "GET":
                etags[url] = (etag, payload)
            return payload
    except urllib.error.HTTPError as e:
        if e.code == 304 and cached:
            return cached[1]
        if e.code in (403, 429) and ("rate limit" in (e.read() or b"").decode("utf-8", "replace").lower() or e.code == 429):
            raise RateLimited(f"{e.code} from {urllib.parse.urlparse(url).netloc}")
        raise


_gh_token = None


def gh_token():
    global _gh_token
    if not _gh_token:
        _gh_token = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, check=True).stdout.strip()
    return _gh_token


def gh_me():
    # Your GitHub login: from the config, or asked once from the API.
    global GH_ME
    if not GH_ME:
        GH_ME = gh("/user")["login"]
    return GH_ME


def gh(path):
    url = path if path.startswith("http") else "https://api.github.com" + path
    return http_json(url, {"Authorization": "Bearer " + gh_token(), "Accept": "application/vnd.github+json",
                           "X-GitHub-Api-Version": "2022-11-28"})


TOKEN_FILE = os.path.join(DATA_DIR, "jira-token")
_token_problem = ""


def jira_token():
    # Keychain first (macOS); a launch agent may be refused access, so a 600-mode file next to the state also works.
    global _token_problem
    if sys.platform == "darwin":
        r = subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"], capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
        _token_problem = (r.stderr or "").strip()[:200]
    try:
        with open(TOKEN_FILE) as f:
            t = f.read().strip()
            return t or None
    except OSError:
        return None


def jira(path, body=None):
    token = jira_token()
    if not token:
        raise RuntimeError("No Jira API token in Keychain (service %s): %s" % (KEYCHAIN_SERVICE, _token_problem or "not found"))
    auth = base64.b64encode(f"{JIRA_EMAIL}:{token}".encode()).decode()
    return http_json(JIRA_BASE + path, {"Authorization": "Basic " + auth, "Accept": "application/json"},
                     method="POST" if body is not None else "GET", body=body, use_etag=False)


# ---------- GitHub

pr_cache = {}  # number -> {"updated_at", "row", "acts"}


def oneline(text, n=140):
    t = re.sub(r"\s+", " ", text or "").strip()
    return t if len(t) <= n else t[: n - 1] + "…"


def key_of(title):
    m = KEY_RE.search(title or "")
    return m.group(0) if m else ""


def pr_details(number):
    pr = gh(f"/repos/{REPO}/pulls/{number}")
    issue_comments = gh(f"/repos/{REPO}/issues/{number}/comments?per_page=100")
    inline = gh(f"/repos/{REPO}/pulls/{number}/comments?per_page=100")
    reviews = gh(f"/repos/{REPO}/pulls/{number}/reviews?per_page=100")
    return pr, issue_comments, inline, reviews


def checks_for(sha):
    runs = gh(f"/repos/{REPO}/commits/{sha}/check-runs?per_page=100").get("check_runs", [])
    concl = [r.get("conclusion") or r.get("status") for r in runs]
    if any(c in ("failure", "timed_out", "cancelled", "action_required") for c in concl):
        state_ = "failing"
    elif any(c in ("queued", "in_progress", "pending", "waiting", None) for c in concl):
        state_ = "running"
    elif not runs:
        state_ = "none"
    else:
        state_ = "passing"
    failed = [r for r in runs if r.get("conclusion") in ("failure", "timed_out")]
    return state_, failed


def review_decision(reviews):
    latest = {}
    for r in reviews:
        if r.get("state") in ("APPROVED", "CHANGES_REQUESTED", "DISMISSED"):
            latest[r["user"]["login"]] = r["state"]
    vals = set(latest.values())
    if "CHANGES_REQUESTED" in vals:
        return "CHANGES_REQUESTED"
    if "APPROVED" in vals:
        return "APPROVED"
    return ""


def build_pr(number, since_iso):
    pr, issue_comments, inline, reviews = pr_details(number)
    state_ = "MERGED" if pr.get("merged_at") else pr["state"].upper()
    checks, failed = checks_for(pr["head"]["sha"])
    human = []
    for c in issue_comments:
        human.append({"who": c["user"]["login"], "at": c["created_at"], "url": c["html_url"], "kind": "comment", "body": c.get("body") or "", "state": ""})
    for c in inline:
        human.append({"who": c["user"]["login"], "at": c["created_at"], "url": c["html_url"], "kind": "inline comment", "body": c.get("body") or "", "state": ""})
    for r in reviews:
        if r.get("state") == "COMMENTED" and not r.get("body"):
            continue
        human.append({"who": r["user"]["login"], "at": r.get("submitted_at") or "", "url": r["html_url"],
                      "kind": r["state"].lower().replace("_", " "), "body": r.get("body") or "", "state": r["state"]})
    human = [h for h in human if not BOTS.search(h["who"]) and h["at"]]
    human.sort(key=lambda h: h["at"])
    me = gh_me()
    others = [h for h in human if h["who"] != me]
    mine = [h for h in human if h["who"] == me]
    other = others[-1] if others else None
    my_last = mine[-1]["at"] if mine else ""
    key = key_of(pr["title"])
    row = {
        "pr": number, "key": key, "title": pr["title"], "base": pr["base"]["ref"], "state": state_,
        "review": review_decision(reviews), "checks": checks, "merged_at": pr.get("merged_at") or "",
        "updated_at": pr["updated_at"], "url": pr["html_url"],
        "last_comment_by": other["who"] if other else "", "last_comment_at": other["at"] if other else "",
        "last_comment_url": other["url"] if other else "", "last_comment": oneline(other["body"], 160) if other else "",
        "unanswered": bool(other and state_ == "OPEN" and other["state"] != "APPROVED" and other["at"] > my_last),
    }
    acts = []
    for h in human:
        if h["at"] >= since_iso:
            acts.append({"at": h["at"], "pr": f"#{number}", "key": key, "kind": h["kind"], "who": "you" if h["who"] == me else h["who"],
                         "url": h["url"], "text": oneline(h["body"]), "body": (h["body"] or "").replace("\r", "")[:6000]})
    for f in failed:
        if (f.get("completed_at") or "") >= since_iso:
            acts.append({"at": f["completed_at"], "pr": f"#{number}", "key": key, "kind": "check failed", "who": f["name"], "url": f["html_url"], "text": "", "body": ""})
    if pr.get("merged_at") and pr["merged_at"] >= since_iso:
        acts.append({"at": pr["merged_at"], "pr": f"#{number}", "key": key, "kind": "merged", "who": "", "url": pr["html_url"], "text": "", "body": ""})
    return row, acts


def poll_github():
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=HISTORY_DAYS))
    since_iso = since.strftime("%Y-%m-%dT%H:%M:%SZ")
    me = gh_me()
    q_open = urllib.parse.quote(f"repo:{REPO} is:pr author:{me} is:open")
    q_recent = urllib.parse.quote(f"repo:{REPO} is:pr author:{me} updated:>={since.strftime('%Y-%m-%d')}")
    found = {}
    for q in (q_open, q_recent):
        for it in gh(f"/search/issues?q={q}&per_page=50").get("items", []):
            found[it["number"]] = it["updated_at"]
    for number, updated in found.items():
        c = pr_cache.get(number)
        is_open = c and c["row"]["state"] == "OPEN"
        if c and c["updated_at"] == updated:
            if is_open:
                # A finished CI run does not bump the PR's updated_at, so re-check open PRs' checks (cheap with ETag).
                checks, failed = checks_for(gh(f"/repos/{REPO}/pulls/{number}")["head"]["sha"])
                if checks != c["row"]["checks"]:
                    c["row"]["checks"] = checks
                    for f in failed:
                        a = {"at": f.get("completed_at") or now_iso(), "pr": f"#{number}", "key": c["row"]["key"], "kind": "check failed",
                             "who": f["name"], "url": f["html_url"], "text": "", "body": ""}
                        if a not in c["acts"]:
                            c["acts"].append(a)
            continue
        row, acts = build_pr(number, since_iso)
        pr_cache[number] = {"updated_at": updated, "row": row, "acts": acts}
    for number in list(pr_cache):
        if number not in found:
            del pr_cache[number]
    prs = sorted((c["row"] for c in pr_cache.values()), key=lambda r: r["pr"])
    acts = sorted((a for c in pr_cache.values() for a in c["acts"] if a["at"] >= since_iso), key=lambda a: a["at"], reverse=True)
    return prs, acts


# ---------- GitHub notifications: review requests and mentions outside my own PRs

ask_cache = {}  # notification id -> (updated_at, row or None)


def gh_number(api_url):
    m = re.search(r"/(pulls|issues)/(\d+)$", api_url or "")
    return int(m.group(2)) if m else None


def gh_asks():
    notes = gh("/notifications?participating=true&all=false&per_page=50")
    rows = []
    seen_ids = set()
    for n in notes:
        repo = n["repository"]["full_name"]
        if not repo.startswith(GH_ORG + "/") or n.get("reason") not in ("review_requested", "mention", "team_mention", "assign"):
            continue
        seen_ids.add(n["id"])
        cached = ask_cache.get(n["id"])
        if cached and cached[0] == n["updated_at"]:
            row = cached[1]
        else:
            row = build_ask(n, repo)
            ask_cache[n["id"]] = (n["updated_at"], row)
        if row:
            rows.append(row)
    for k in list(ask_cache):
        if k not in seen_ids:
            del ask_cache[k]
    return rows


def build_ask(n, repo):
    subj = n["subject"]
    number = gh_number(subj.get("url"))
    if not number:
        return None
    title = subj.get("title", "")
    base = {"repo": repo, "number": number, "title": title, "key": key_of(title),
            "url": f"https://github.com/{repo}/{'pull' if subj.get('type') == 'PullRequest' else 'issues'}/{number}"}
    if n["reason"] == "review_requested" and subj.get("type") == "PullRequest":
        pr = gh(f"/repos/{repo}/pulls/{number}")
        if pr["state"] != "open":
            return None
        req = gh(f"/repos/{repo}/pulls/{number}/requested_reviewers")
        if gh_me() not in [u["login"] for u in req.get("users", [])]:
            return None  # already reviewed, or no longer asked
        return {**base, "id": "gha:" + n["id"], "kind": "review requested", "who": pr["user"]["login"], "at": n["updated_at"],
                "text": oneline(title), "body": (pr.get("body") or "")[:6000]}
    # A mention: the comment that mentions me, answered once I write there after it.
    me = gh_me()
    c = gh(subj["latest_comment_url"]) if subj.get("latest_comment_url") else None
    if not c or ("@" + me) not in (c.get("body") or ""):
        comments = gh(f"/repos/{repo}/issues/{number}/comments?per_page=100")
        hits = [x for x in comments if ("@" + me) in (x.get("body") or "")]
        c = hits[-1] if hits else c
    if not c:
        return None
    at = c.get("created_at") or n["updated_at"]
    mine_after = [x for x in gh(f"/repos/{repo}/issues/{number}/comments?per_page=100") if x["user"]["login"] == me and x["created_at"] > at]
    if mine_after:
        return None
    return {**base, "id": "gha:" + n["id"], "kind": "mentioned you", "who": c["user"]["login"], "at": at, "url": c.get("html_url") or base["url"],
            "text": oneline(c.get("body") or ""), "body": (c.get("body") or "").replace("\r", "")[:6000]}


# ---------- Jira

me_jira = {}


def adf_text(node, me_id):
    # Jira's document format to Markdown-ish text: mentions as @Name (you as @<your display name>), images as [image].
    if node is None:
        return ""
    t = node.get("type")
    kids = node.get("content") or []
    inner = lambda sep="": sep.join(adf_text(k, me_id) for k in kids)
    if t == "text":
        s = node.get("text", "")
        for m in node.get("marks") or []:
            if m.get("type") == "code":
                s = "`" + s + "`"
            elif m.get("type") == "strong":
                s = "**" + s + "**"
            elif m.get("type") == "link":
                href = (m.get("attrs") or {}).get("href", "")
                if href and href != s:
                    s = f"[{s}]({href})"
        return s
    if t == "mention":
        a = node.get("attrs") or {}
        if a.get("id") == me_id:
            return "@" + me_jira.get("displayName", "me")
        return a.get("text") or "@someone"
    if t == "hardBreak":
        return "\n"
    if t in ("paragraph",):
        return inner() + "\n\n"
    if t == "heading":
        return "#" * int((node.get("attrs") or {}).get("level", 2)) + " " + inner() + "\n\n"
    if t == "codeBlock":
        return "```\n" + inner() + "\n```\n\n"
    if t == "blockquote":
        return "\n".join("> " + l for l in inner().strip().split("\n")) + "\n\n"
    if t in ("bulletList", "orderedList"):
        out = []
        for i, li in enumerate(kids):
            mark = f"{i + 1}." if t == "orderedList" else "-"
            out.append(mark + " " + adf_text(li, me_id).strip().replace("\n\n", "\n"))
        return "\n".join(out) + "\n\n"
    if t in ("mediaSingle", "mediaGroup", "media", "mediaInline"):
        return "[image]"
    if t in ("inlineCard", "blockCard"):
        return (node.get("attrs") or {}).get("url", "")
    if t == "emoji":
        return (node.get("attrs") or {}).get("text", "")
    return inner()


def poll_jira():
    if not me_jira:
        me_jira.update(jira("/rest/api/3/myself"))
    me_id = me_jira["accountId"]
    res = jira("/rest/api/3/search/jql", {"jql": JQL_TICKETS, "maxResults": 100,
                                           "fields": ["summary", "status", "assignee", "updated", "comment"]})
    tickets, comments = [], []
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=HISTORY_DAYS))
    for it in res.get("issues", []):
        f = it["fields"]
        key = it["key"]
        url = f"{JIRA_BASE}/browse/{key}"
        tickets.append({"key": key, "summary": f.get("summary", ""), "status": (f.get("status") or {}).get("name", ""),
                        "status_category": ((f.get("status") or {}).get("statusCategory") or {}).get("key", ""),
                        "assignee": (f.get("assignee") or {}).get("displayName", "Unassigned"),
                        "updated": f.get("updated", ""), "url": url})
        for c in ((f.get("comment") or {}).get("comments") or []):
            created = dt.datetime.strptime(c["created"], "%Y-%m-%dT%H:%M:%S.%f%z")
            body = c.get("body")
            text = adf_text(body, me_id).strip() if isinstance(body, dict) else str(body or "")
            author = (c.get("author") or {}).get("displayName", "")
            comments.append({"id": c["id"], "key": key, "at": created.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                             "author": author, "body": text, "url": f"{url}?focusedCommentId={c['id']}"})
    for t in tickets:
        if t["status_category"] == "done":
            continue
        try:
            t["status_change"] = hold_info(t["key"], t["updated"], t["status"])
        except Exception:
            t["status_change"] = None
        if "hold" in t["status"].lower():
            t["hold"] = t["status_change"]
    return tickets, comments


hold_cache = {}  # key -> (updated, info)


def hold_info(key, updated, status):
    # When and by whom the ticket entered its current status, from its changelog.
    cached = hold_cache.get(key)
    if cached and cached[0] == updated:
        return cached[1]
    info = None
    start = 0
    while True:
        page = jira(f"/rest/api/3/issue/{key}/changelog?startAt={start}&maxResults=100")
        for h in page.get("values", []):
            for it in h.get("items", []):
                if it.get("field") == "status" and (it.get("toString") or "").lower() == status.lower():
                    at = dt.datetime.strptime(h["created"], "%Y-%m-%dT%H:%M:%S.%f%z").astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                    if not info or at > info["since"]:
                        info = {"since": at, "by": (h.get("author") or {}).get("displayName", "")}
        if page.get("isLast", True) or not page.get("values"):
            break
        start += len(page["values"])
    hold_cache[key] = (updated, info)
    return info


def jira_events(old, new):
    # Status and assignee changes since the last poll become feed events.
    before = {t["key"]: t for t in old}
    out = []
    for t in new:
        b = before.get(t["key"])
        if not b:
            continue
        if b["status"] != t["status"]:
            out.append({"at": now_iso(), "key": t["key"], "kind": "status", "text": f"{b['status']} → {t['status']}", "url": t["url"]})
        if b["assignee"] != t["assignee"]:
            out.append({"at": now_iso(), "key": t["key"], "kind": "reassigned", "text": f"{b['assignee']} → {t['assignee']}", "url": t["url"]})
    return out


# ---------- whose turn, same rules as the window (app.js); used for notifications and /api/summary

ASK_RE = re.compile(r"\?|\b(please|pls|can you|could you|would you|let me know|need you|need your|thoughts|recommend|advise|confirm|clarify)\b", re.I)


def iso_utc(s):
    try:
        return dt.datetime.strptime(s, "%Y-%m-%dT%H:%M:%S.%f%z").astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (ValueError, TypeError):
        return s or ""


def my_moves():
    me = me_jira.get("displayName", "")
    jira_rows, prs, comments = state["jira"], state["prs"], state["jira_comments"]
    by_key = {}
    for p in prs:
        if p["key"]:
            by_key.setdefault(p["key"], []).append(p)

    def pick(lst):
        lst = sorted(lst or [], key=lambda p: p["updated_at"], reverse=True)
        lst.sort(key=lambda p: 0 if p["state"] == "OPEN" else 1)
        return lst[0] if lst else None

    asks = {}
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=HISTORY_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    for c in sorted((c for c in comments if c["at"] >= cutoff), key=lambda c: c["at"]):
        if c["author"] == me:
            # Your comment answers only the people it @-mentions; everyone else stays waiting.
            if c["key"] in asks:
                asks[c["key"]] = [(x, q) for (x, q) in asks[c["key"]] if ("@" + x["author"]) not in c["body"]]
            continue
        if re.search("automation", c["author"], re.I) or ("@" + me) not in c["body"]:
            continue
        asks.setdefault(c["key"], []).append((c, bool(ASK_RE.search(re.sub(r"https?://\S+", "", c["body"])))))
    rows = []
    for t in jira_rows:
        pr = pick(by_key.get(t["key"]))
        is_open = bool(pr and pr["state"] == "OPEN")
        done = t["status_category"] == "done"
        release = bool(pr and pr["base"].startswith(RULES["release_branch_prefix"]))
        nxt = None
        st = t["status"].lower()
        if is_open and pr["checks"] == "failing":
            nxt = "Look at the failing checks"
        elif is_open and pr["review"] == "CHANGES_REQUESTED":
            nxt = "Address the requested changes"
        elif is_open and pr["unanswered"]:
            nxt = "Read and answer the new comment"
        elif "passed" in st:
            nxt = "Merge with a merge commit, log time, move to Done"
        elif done and is_open:
            nxt = "Ticket is Done but the PR is open: merge it"
        elif not done and pr and pr["state"] == "MERGED" and t["assignee"] == me:
            nxt = "Log time and move to Done"
        elif "code review" in st and is_open and pr["review"] == "APPROVED":
            nxt = RULES["approved_release_next"] if release else RULES["approved_next"]
        elif "code review" in st or "qa" in st or "on hold" in st:
            nxt = None
        elif not done and me and t["assignee"] == me:
            nxt = "Pick it up"
        activity = max(x for x in [iso_utc(t["updated"]), pr["updated_at"] if pr else ""] if x) if (t["updated"] or pr) else ""
        if nxt:
            rows.append({"row_id": t["key"], "key": t["key"], "next": nxt, "activity_at": activity, "url": t["url"]})
        if not done:
            for c, question in asks.get(t["key"], []):
                rows.append({"row_id": f"{t['key']}:{c['id']}", "key": t["key"], "activity_at": c["at"], "url": c["url"],
                             "next": ("Answer " if question else "Read ") + c["author"] + (" in Jira" if question else "’s comment in Jira")})
    keys = {t["key"] for t in jira_rows}
    for key, lst in by_key.items():
        pr = pick(lst)
        if key not in keys and pr["state"] == "OPEN":
            rows.append({"row_id": key, "key": key, "next": "Check the ticket for this open PR", "activity_at": pr["updated_at"], "url": pr["url"]})
    for a in state.get("gh_asks", []):
        ref = f"#{a['number']}" if a["repo"] == REPO else f"{a['repo'].split('/')[1]}#{a['number']}"
        nxt = f"Review PR {ref}" if a["kind"] == "review requested" else f"Answer {a['who']} on {ref}"
        rows.append({"row_id": a["id"], "key": a["key"] or ref, "next": nxt, "activity_at": a["at"], "url": a["url"]})
    handled = marks.get("handled", {})
    return [r for r in rows if not (handled.get(r["row_id"]) and r["activity_at"] <= handled[r["row_id"]])]


def feed_ids():
    ids = []
    for a in state["activity"]:
        ids.append(("gh:" + a["url"] + ":" + a["at"], a["at"]))
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=HISTORY_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    for c in state["jira_comments"]:
        if c["at"] >= cutoff:
            ids.append(("jc:" + c["id"], c["at"]))
    for e in state["events"]:
        ids.append(("jira:" + e["key"] + ":" + e["at"] + ":" + e["kind"], e["at"]))
    return ids


def summary():
    moves = my_moves()
    base = marks.get("base") or 0
    seen = set(marks.get("seen", []))
    new = [i for i, at in feed_ids() if i not in seen and at and dt.datetime.strptime(at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc).timestamp() * 1000 > base]
    return {"moves": moves, "new_events": len(new), "todos": [t for t in todos if not t.get("done")], "polled_at": state.get("polled_at", ""), "errors": state.get("errors", {})}


def notify_new_moves():
    # Caller holds the lock. First run only records what exists, so you are not flooded.
    moves = my_moves()
    known = set(marks.get("notified", []))
    fresh = [m for m in moves if m["row_id"] not in known]
    if not fresh:
        return
    if known:
        title = "Your move: " + fresh[0]["key"] if len(fresh) == 1 else f"{len(fresh)} new items are your move"
        text = fresh[0]["next"] if len(fresh) == 1 else "; ".join(f"{m['key']} — {m['next']}" for m in fresh[:3])
        notify(title, text)
    marks["notified"] = list(dict.fromkeys(list(known) + [m["row_id"] for m in fresh]))[-5000:]
    save_json(MARKS_FILE, marks)


def notify(title, text):
    # Desktop notification: macOS via osascript, Linux via notify-send; silently nothing elsewhere (platform layer to come).
    title, text = title.replace('"', "'")[:120], text.replace('"', "'")[:240]
    if sys.platform == "darwin":
        subprocess.run(["osascript", "-e", 'display notification "%s" with title "%s" sound name "Glass"' % (text, title)], check=False)
    elif shutil.which("notify-send"):
        subprocess.run(["notify-send", title, text], check=False)


# ---------- poll loop with backoff

def poll_once():
    errors = {}
    gh_result = jira_result = None
    gh_ask_rows = None
    if CONFIG.get("problem"):
        errors["config"] = CONFIG["problem"]
    if REPO:
        try:
            gh_ask_rows = gh_asks()
        except RateLimited as e:
            errors["github"] = "rate limited: " + str(e)
        except Exception as e:
            errors["github_notifications"] = f"{type(e).__name__}: {e}"
        try:
            gh_result = poll_github()
        except RateLimited as e:
            errors["github"] = "rate limited: " + str(e)
        except Exception as e:  # keep the monitor alive whatever one source does
            errors["github"] = f"{type(e).__name__}: {e}"
    if JIRA_BASE:
        try:
            jira_result = poll_jira()
        except RateLimited as e:
            errors["jira"] = "rate limited: " + str(e)
        except Exception as e:
            errors["jira"] = f"{type(e).__name__}: {e}"
    with lock:
        before = json.dumps([state["prs"], state["activity"], state["jira"], state["jira_comments"], state.get("gh_asks"), state["errors"]], sort_keys=True)
        if gh_ask_rows is not None:
            state["gh_asks"] = gh_ask_rows
        if gh_result:
            state["prs"], state["activity"] = gh_result
        if jira_result:
            tickets, comments = jira_result
            if state["jira"]:
                state["events"] = (jira_events(state["jira"], tickets) + state["events"])[:500]
            state["jira"], state["jira_comments"] = tickets, comments
        state["errors"] = errors
        state["polled_at"] = now_iso()
        after = json.dumps([state["prs"], state["activity"], state["jira"], state["jira_comments"], state.get("gh_asks"), state["errors"]], sort_keys=True)
        if state["jira"] or state["prs"]:
            notify_new_moves()
        if after != before:
            bump()
        else:
            changed.notify_all()
    return errors


def poll_loop():
    delay = POLL_SECONDS
    while True:
        errors = poll_once()
        limited = any("rate limited" in v for v in errors.values())
        delay = min(delay * 2, 15 * 60) if limited else POLL_SECONDS
        wake.wait(delay)
        wake.clear()


# ---------- web server

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else (json.dumps(body) if ctype == "application/json" else body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        static = {"/": ("index.html", "text/html"), "/index.html": ("index.html", "text/html"),
                  "/style.css": ("style.css", "text/css"), "/app.js": ("app.js", "application/javascript"),
                  "/vendor/popper.min.js": ("vendor/popper.min.js", "application/javascript"),
                  "/vendor/tippy-bundle.umd.min.js": ("vendor/tippy-bundle.umd.min.js", "application/javascript")}
        if path in static:
            name, ctype = static[path]
            with open(os.path.join(APP_DIR, name), "rb") as f:
                return self.send(200, f.read(), ctype)
        if path == "/api/state":
            with lock:
                public = {"repo": REPO, "jira_base": JIRA_BASE, "jira_email": JIRA_EMAIL, "keychain_service": KEYCHAIN_SERVICE,
                          "key_pattern": CONFIG["jira"]["key_pattern"], "rules": RULES}
                return self.send(200, {**state, "marks": marks, "todos": todos, "config": public,
                                       "me": {"github": GH_ME, "jira": me_jira.get("displayName", "")}})
        if path == "/api/summary":
            with lock:
                return self.send(200, summary())
        if path == "/api/stream":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            sent = None
            try:
                while True:
                    with lock:
                        if (state["version"], state.get("polled_at", "")) == sent:
                            changed.wait(25)
                        v, polled = state["version"], state.get("polled_at", "")
                    # Every poll is an event, so the window's "last check" stays true even when nothing changed.
                    msg = f"data: {json.dumps({'version': v, 'polled_at': polled})}\n\n" if (v, polled) != sent else ": keep-alive\n\n"
                    sent = (v, polled)
                    self.wfile.write(msg.encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return
        return self.send(404, {"error": "not found"})

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/marks":
            b = self.body()
            with lock:
                if "seen" in b:
                    marks["seen"] = list(dict.fromkeys(marks["seen"] + list(b["seen"])))[-5000:]
                if "notified" in b:
                    marks["notified"] = list(dict.fromkeys(marks["notified"] + list(b["notified"])))[-5000:]
                if "base" in b:
                    marks["base"] = b["base"]
                for k, v in (b.get("handled") or {}).items():
                    if v is None:
                        marks["handled"].pop(k, None)
                    else:
                        marks["handled"][k] = v
                save_json(MARKS_FILE, marks)
            return self.send(200, marks)
        if path == "/api/todos":
            # add {text, key?}; done/undo/delete {id}; edit {id, text}
            b = self.body()
            act = b.get("action")
            with lock:
                if act == "add" and str(b.get("text", "")).strip():
                    text = str(b["text"]).strip()[:500]
                    key = b.get("key") or key_of(text)
                    todos.insert(0, {"id": "t" + str(int(time.time() * 1000)), "text": text, "key": key, "created": now_iso(),
                                     "by": str(b.get("by") or "you")[:20], "done": None})
                else:
                    t = next((x for x in todos if x["id"] == b.get("id")), None)
                    if t is None:
                        return self.send(404, {"error": "no such to-do"})
                    if act == "done":
                        t["done"] = now_iso()
                    elif act == "undo":
                        t["done"] = None
                    elif act == "edit" and str(b.get("text", "")).strip():
                        t["text"] = str(b["text"]).strip()[:500]
                        t["key"] = key_of(t["text"]) or t.get("key", "")
                    elif act == "delete":
                        todos.remove(t)
                    else:
                        return self.send(400, {"error": "unknown action"})
                save_json(TODOS_FILE, todos)
                bump()
            return self.send(200, todos)
        if path == "/api/refresh":
            wake.set()
            return self.send(200, {"ok": True})
        if path == "/api/notify":
            b = self.body()
            notify(str(b.get("title", "Whose Turn")), str(b.get("body", "")))
            return self.send(200, {"ok": True})
        return self.send(404, {"error": "not found"})


if __name__ == "__main__":
    threading.Thread(target=poll_loop, daemon=True).start()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
