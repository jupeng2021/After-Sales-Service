#!/usr/bin/env python3
"""Small, dependency-free local web server for After-Sales-Service."""
from __future__ import annotations

import hashlib
import http.cookies
import json
import math
import os
import re
import secrets
import sqlite3
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "ass.db"
COOKIE = "ass_session"
SESSION_SECONDS = 60 * 60 * 24 * 14
TEAM = ("陈巨鹏", "肖林", "洪凯")
FIELDS = ("date", "type", "person", "customer", "project", "sales", "location", "channel", "equipment", "quantity", "hours", "status", "description", "result", "contact_name", "contact_phone", "service_time", "problem", "parts", "follow_up", "source")
INSTITUTION_FIELDS = ("name", "aliases", "kind", "district", "address", "contact_name", "contact_phone", "website", "source", "notes", "status")


def connect():
    DATA_DIR.mkdir(exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK (id=1), username TEXT UNIQUE NOT NULL, password_hash BLOB NOT NULL, salt BLOB NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS sessions (token_hash BLOB PRIMARY KEY, expires_at INTEGER NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS institutions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, aliases TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, district TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', contact_name TEXT NOT NULL DEFAULT '', contact_phone TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '在用', updated_at INTEGER NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    if not db.execute("SELECT 1 FROM app_state WHERE key='institutions_seeded'").fetchone():
        seed_file = ROOT / "institution_seed.json"
        if seed_file.exists():
            for institution in json.loads(seed_file.read_text(encoding="utf-8")):
                db.execute("INSERT OR IGNORE INTO institutions(name,aliases,kind,source,updated_at) VALUES(?,?,?,?,?)", (institution["name"], institution.get("aliases", ""), institution["kind"], institution.get("source", ""), int(time.time())))
        db.execute("INSERT INTO app_state(key,value) VALUES('institutions_seeded','1')")
    db.commit()
    os.chmod(DATA_DIR, 0o700)
    os.chmod(DB_PATH, 0o600)
    return db


def password_hash(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)


def clean_record(data):
    if not isinstance(data, dict):
        raise ValueError("记录格式无效")
    out = {k: str(data.get(k, "")).strip() for k in FIELDS}
    if not out["date"] or not out["type"] or not out["person"] or not out["customer"] or not out["description"]:
        raise ValueError("日期、类型、处理人员、用户/单位和服务内容为必填项")
    if out["person"] not in TEAM:
        raise ValueError("主处理工程师不在成员名单中")
    try:
        if out["hours"] and (not math.isfinite(float(out["hours"])) or float(out["hours"]) < 0):
            raise ValueError
        if out["quantity"] and int(out["quantity"]) < 0:
            raise ValueError
    except ValueError:
        raise ValueError("用时和数量必须是有效的非负数字")
    assistants = data.get("assistants", [])
    if not isinstance(assistants, list):
        raise ValueError("协助工程师格式无效")
    cleaned_assistants, assistant_names = [], set()
    for assistant in assistants:
        if not isinstance(assistant, dict):
            raise ValueError("协助工程师格式无效")
        name = str(assistant.get("person", "")).strip()
        try:
            assistant_hours = float(assistant.get("hours", ""))
            if name not in TEAM or name == out["person"] or name in assistant_names or not math.isfinite(assistant_hours) or assistant_hours <= 0:
                raise ValueError
        except (TypeError, ValueError):
            raise ValueError("每位协助工程师需为其他成员，并填写大于 0 的独立工时")
        assistant_names.add(name)
        cleaned_assistants.append({"person": name, "hours": str(assistant_hours)})
    out["assistants"] = cleaned_assistants
    if out["type"] == "上门送货" and not all(out[key] for key in ("location", "service_time", "equipment", "quantity")):
        raise ValueError("上门送货单请填写送达地址、送达时间、设备型号和数量")
    if out["type"] == "上门维护" and not all(out[key] for key in ("location", "service_time", "problem")):
        raise ValueError("上门维护单请填写服务地点、到访时间和故障/用户需求")
    if out["status"] == "已完成" and (not out["hours"] or float(out["hours"]) <= 0):
        raise ValueError("完成服务时请填写工程师投入工时")
    return out


def clean_institution(data):
    if not isinstance(data, dict):
        raise ValueError("单位档案格式无效")
    out = {key: str(data.get(key, "")).strip() for key in INSTITUTION_FIELDS}
    if not out["name"] or out["kind"] not in ("高校", "科研院所", "科研平台/实验室", "其他"):
        raise ValueError("单位名称和有效的单位类型为必填项")
    if out["status"] not in ("在用", "停用"):
        out["status"] = "在用"
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "AfterSalesService/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.log_date_time_string(), fmt % args))

    def send_bytes(self, status, body, content_type="application/json; charset=utf-8", headers=None):
        raw = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(raw)

    def json(self, status, value, headers=None):
        self.send_bytes(status, json.dumps(value, ensure_ascii=False), headers=headers)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 1_000_000:
            raise ValueError("请求内容过大")
        return json.loads(self.rfile.read(length) or b"{}")

    def session(self, db):
        cookies = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
        if COOKIE not in cookies:
            return False
        token = cookies[COOKIE].value
        row = db.execute("SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?", (hashlib.sha256(token.encode()).digest(), int(time.time()))).fetchone()
        return bool(row)

    def issue_session(self, db):
        token = secrets.token_urlsafe(32)
        db.execute("INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)", (hashlib.sha256(token.encode()).digest(), int(time.time()) + SESSION_SECONDS))
        db.commit()
        return f"{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_SECONDS}"

    def clear_session(self, db):
        cookies = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
        if COOKIE in cookies:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(cookies[COOKIE].value.encode()).digest(),))
            db.commit()
        return f"{COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"

    def do_GET(self):
        path = urlparse(self.path).path
        with connect() as db:
            if path == "/api/status":
                exists = db.execute("SELECT 1 FROM admin WHERE id=1").fetchone() is not None
                self.json(200, {"setup_required": not exists, "authenticated": self.session(db)})
                return
            if path == "/api/records":
                if not self.session(db):
                    self.json(401, {"error": "请先登录"})
                    return
                records = [json.loads(r[0]) for r in db.execute("SELECT payload FROM records ORDER BY json_extract(payload,'$.date') DESC, updated_at DESC")]
                self.json(200, records)
                return
            if path == "/api/institutions":
                if not self.session(db):
                    self.json(401, {"error": "请先登录"})
                    return
                name_lookup = {}
                rows = db.execute("SELECT id,name,aliases,kind,district,address,contact_name,contact_phone,website,source,notes,status FROM institutions ORDER BY kind,name").fetchall()
                for row in rows:
                    for value in [row["name"], *re.split(r"[、；;,，]", row["aliases"])]:
                        if value.strip():
                            name_lookup[value.strip()] = row["name"]
                activity = {}
                for row in db.execute("SELECT payload FROM records"):
                    record = json.loads(row[0])
                    name = name_lookup.get(record.get("customer", ""), record.get("customer", ""))
                    if name:
                        summary = activity.setdefault(name, {"service_count": 0, "last_service_date": ""})
                        summary["service_count"] += 1
                        summary["last_service_date"] = max(summary["last_service_date"], record.get("date", ""))
                institutions = []
                for row in rows:
                    institution = dict(row)
                    institution.update(activity.get(institution["name"], {"service_count": 0, "last_service_date": ""}))
                    institutions.append(institution)
                self.json(200, institutions)
                return
            if path == "/login" or path == "/login.html":
                self.send_bytes(200, (ROOT / "login.html").read_bytes(), "text/html; charset=utf-8")
                return
            if path in ("/", "/index.html"):
                if self.session(db):
                    self.send_bytes(200, (ROOT / "index.html").read_bytes(), "text/html; charset=utf-8")
                else:
                    self.send_response(302)
                    self.send_header("Location", "/login")
                    self.end_headers()
                return
            if path == "/app.js":
                if not self.session(db):
                    self.send_bytes(404, "not found", "text/plain; charset=utf-8")
                    return
                self.send_bytes(200, (ROOT / "app.js").read_bytes(), "text/javascript; charset=utf-8")
                return
        self.send_bytes(404, "not found", "text/plain; charset=utf-8")

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            data = self.read_json()
        except (ValueError, json.JSONDecodeError):
            self.json(400, {"error": "请求内容无效"})
            return
        with connect() as db:
            if path == "/api/setup":
                if db.execute("SELECT 1 FROM admin WHERE id=1").fetchone():
                    self.json(409, {"error": "超管账号已创建，请登录"})
                    return
                username = str(data.get("username", "")).strip()
                password = str(data.get("password", ""))
                if not re.fullmatch(r"[A-Za-z0-9_.-]{3,40}", username) or len(password) < 12:
                    self.json(400, {"error": "账号需为 3–40 位字母、数字或 _.-；密码至少 12 位"})
                    return
                salt = secrets.token_bytes(16)
                db.execute("INSERT INTO admin(id,username,password_hash,salt) VALUES(1,?,?,?)", (username, password_hash(password, salt), salt))
                db.commit()
                self.json(200, {"ok": True}, {"Set-Cookie": self.issue_session(db)})
                return
            if path == "/api/login":
                row = db.execute("SELECT username,password_hash,salt FROM admin WHERE id=1").fetchone()
                if not row or not secrets.compare_digest(password_hash(str(data.get("password", "")), row["salt"]), row["password_hash"]) or str(data.get("username", "")).strip() != row["username"]:
                    self.json(401, {"error": "账号或密码错误"})
                    return
                self.json(200, {"ok": True}, {"Set-Cookie": self.issue_session(db)})
                return
            if path == "/api/logout":
                self.json(200, {"ok": True}, {"Set-Cookie": self.clear_session(db)})
                return
            if path == "/api/institutions":
                if not self.session(db):
                    self.json(401, {"error": "登录状态已失效"})
                    return
                try:
                    institution = clean_institution(data)
                    cur = db.execute("INSERT INTO institutions(name,aliases,kind,district,address,contact_name,contact_phone,website,source,notes,status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (*[institution[key] for key in INSTITUTION_FIELDS], int(time.time())))
                except sqlite3.IntegrityError:
                    self.json(409, {"error": "该单位名称已存在"})
                    return
                except ValueError as exc:
                    self.json(400, {"error": str(exc)})
                    return
                db.commit()
                institution["id"] = cur.lastrowid
                self.json(201, institution)
                return
            if path == "/api/records":
                if not self.session(db):
                    self.json(401, {"error": "登录状态已失效"})
                    return
                try:
                    record = clean_record(data)
                except ValueError as exc:
                    self.json(400, {"error": str(exc)})
                    return
                record["id"] = secrets.token_urlsafe(16)
                db.execute("INSERT INTO records(id,payload,updated_at) VALUES(?,?,?)", (record["id"], json.dumps(record, ensure_ascii=False), int(time.time())))
                db.commit()
                self.json(201, record)
                return
        self.json(404, {"error": "接口不存在"})

    def do_PUT(self):
        if urlparse(self.path).path.startswith("/api/institutions/"):
            self.save_institution()
        else:
            self.save_record(update=True)

    def save_institution(self):
        match = re.fullmatch(r"/api/institutions/(\d+)", urlparse(self.path).path)
        if not match:
            self.json(404, {"error": "单位档案不存在"})
            return
        with connect() as db:
            if not self.session(db):
                self.json(401, {"error": "登录状态已失效"})
                return
            try:
                institution = clean_institution(self.read_json())
            except (ValueError, json.JSONDecodeError) as exc:
                self.json(400, {"error": str(exc) or "请求内容无效"})
                return
            existing = db.execute("SELECT name,aliases FROM institutions WHERE id=?", (match.group(1),)).fetchone()
            if not existing:
                self.json(404, {"error": "单位档案不存在"})
                return
            try:
                db.execute("UPDATE institutions SET name=?,aliases=?,kind=?,district=?,address=?,contact_name=?,contact_phone=?,website=?,source=?,notes=?,status=?,updated_at=? WHERE id=?", (*[institution[key] for key in INSTITUTION_FIELDS], int(time.time()), match.group(1)))
            except sqlite3.IntegrityError:
                self.json(409, {"error": "该单位名称已存在"})
                return
            if existing["name"] != institution["name"]:
                old_names = {existing["name"], *[x.strip() for x in re.split(r"[、；;,，]", existing["aliases"]) if x.strip()]}
                for row in db.execute("SELECT id,payload FROM records").fetchall():
                    record = json.loads(row["payload"])
                    if record.get("customer") in old_names:
                        record["customer"] = institution["name"]
                        db.execute("UPDATE records SET payload=? WHERE id=?", (json.dumps(record, ensure_ascii=False), row["id"]))
            db.commit()
            institution["id"] = int(match.group(1))
            self.json(200, institution)

    def save_record(self, update=False):
        match = re.fullmatch(r"/api/records/([A-Za-z0-9_-]{10,64})", urlparse(self.path).path)
        if not match:
            self.json(404, {"error": "记录不存在"})
            return
        with connect() as db:
            if not self.session(db):
                self.json(401, {"error": "登录状态已失效"})
                return
            try:
                data = self.read_json()
                record = clean_record(data)
            except (ValueError, json.JSONDecodeError) as exc:
                self.json(400, {"error": str(exc) or "请求内容无效"})
                return
            record["id"] = match.group(1)
            cur = db.execute("UPDATE records SET payload=?,updated_at=? WHERE id=?", (json.dumps(record, ensure_ascii=False), int(time.time()), record["id"]))
            db.commit()
            if cur.rowcount == 0:
                self.json(404, {"error": "记录不存在"})
                return
            self.json(200, record)

    def do_DELETE(self):
        match = re.fullmatch(r"/api/records/([A-Za-z0-9_-]{10,64})", urlparse(self.path).path)
        if not match:
            self.json(404, {"error": "记录不存在"})
            return
        with connect() as db:
            if not self.session(db):
                self.json(401, {"error": "登录状态已失效"})
                return
            cur = db.execute("DELETE FROM records WHERE id=?", (match.group(1),))
            db.commit()
            if not cur.rowcount:
                self.json(404, {"error": "记录不存在"})
                return
            self.json(200, {"ok": True})


if __name__ == "__main__":
    host = os.environ.get("ASS_HOST", "127.0.0.1")
    port = int(os.environ.get("ASS_PORT", "8765"))
    print(f"After-Sales-Service running at http://{host}:{port}", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
