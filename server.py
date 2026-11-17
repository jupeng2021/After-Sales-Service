#!/usr/bin/env python3
"""Small, dependency-free local web server for After-Sales-Service."""
from __future__ import annotations

import hashlib
import http.cookies
import json
import os
import re
import secrets
import sqlite3
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "ass.db"
COOKIE = "ass_session"
SESSION_SECONDS = 60 * 60 * 24 * 14
FIELDS = ("date", "type", "person", "customer", "project", "sales", "location", "channel", "equipment", "quantity", "hours", "status", "description", "result")


def connect():
    DATA_DIR.mkdir(exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK (id=1), username TEXT UNIQUE NOT NULL, password_hash BLOB NOT NULL, salt BLOB NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS sessions (token_hash BLOB PRIMARY KEY, expires_at INTEGER NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)")
    db.commit()
    return db


def password_hash(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)


def clean_record(data):
    if not isinstance(data, dict):
        raise ValueError("记录格式无效")
    out = {k: str(data.get(k, "")).strip() for k in FIELDS}
    if not out["date"] or not out["type"] or not out["person"] or not out["customer"] or not out["description"]:
        raise ValueError("日期、类型、处理人员、用户/单位和服务内容为必填项")
    try:
        if out["hours"] and float(out["hours"]) < 0:
            raise ValueError
        if out["quantity"] and int(out["quantity"]) < 0:
            raise ValueError
    except ValueError:
        raise ValueError("用时和数量必须是有效的非负数字")
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
        self.save_record(update=True)

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
