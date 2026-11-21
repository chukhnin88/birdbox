import psycopg
from psycopg import sql
from psycopg.rows import dict_row
import config


def params(dbname):
    return dict(host=config.DB_HOST, port=config.DB_PORT, dbname=dbname,
                user=config.DB_USER, password=config.DB_PASSWORD)


def connect():
    return psycopg.connect(**params(config.DB_NAME), row_factory=dict_row)


def rows(query, *args):
    with connect() as c:
        return c.execute(query, args).fetchall()


def one(query, *args):
    with connect() as c:
        return c.execute(query, args).fetchone()


def run(query, *args):
    with connect() as c:
        c.execute(query, args)


def insert(query, *args):
    with connect() as c:
        return c.execute(query + " returning id", args).fetchone()["id"]


def ensure_database():
    admin = psycopg.connect(**params("postgres"), autocommit=True)
    try:
        exists = admin.execute("select 1 from pg_database where datname=%s",
                               (config.DB_NAME,)).fetchone()
        if not exists:
            admin.execute(sql.SQL("create database {}").format(sql.Identifier(config.DB_NAME)))
    finally:
        admin.close()


def init_db():
    ensure_database()
    with connect() as c:
        c.execute("""create table if not exists users(
            id integer generated always as identity primary key,
            email text unique not null,
            pw text not null)""")
        c.execute("""create table if not exists devices(
            id integer generated always as identity primary key,
            user_id integer not null references users(id) on delete cascade,
            name text not null,
            token text unique not null,
            chip text not null,
            lat double precision,
            lon double precision,
            wifi_ssid text,
            wifi_pass text,
            server_url text,
            listen_sec integer not null,
            threshold integer not null,
            gain integer not null,
            cooldown_sec integer not null,
            created timestamptz not null default now())""")
        c.execute("""create table if not exists events(
            id integer generated always as identity primary key,
            device_id integer not null references devices(id) on delete cascade,
            ts timestamptz not null default now(),
            lat double precision,
            lon double precision,
            audio text not null,
            kind text,
            species text,
            confidence double precision,
            details text,
            status text not null default 'pending')""")
        c.execute("create index if not exists events_device_idx on events(device_id, id desc)")
        c.execute("alter table devices add column if not exists gps_mode integer not null default 0")
        c.execute("alter table devices add column if not exists last_seen timestamptz")
        c.execute("""create table if not exists gps_points(
            id integer generated always as identity primary key,
            device_id integer not null references devices(id) on delete cascade,
            ts timestamptz not null,
            lat double precision not null,
            lon double precision not null,
            accuracy double precision,
            speed_kmh double precision)""")
        c.execute("""create table if not exists findings(
            id integer generated always as identity primary key,
            device_id integer not null references devices(id) on delete cascade,
            ts timestamptz not null default now(),
            severity text not null,
            reason text not null,
            lat double precision,
            lon double precision)""")
        c.execute("create index if not exists gps_device_idx on gps_points(device_id, ts desc)")
        c.execute("alter table events add column if not exists dev_mini text")
        c.execute("alter table events add column if not exists dev_level integer")
        c.execute("alter table events add column if not exists dev_crest double precision")
        c.execute("alter table events add column if not exists level integer")
        c.execute("alter table events add column if not exists crest double precision")
        c.execute("alter table events add column if not exists mini_class text")
        c.execute("alter table events add column if not exists mini_conf double precision")
        c.execute("alter table events add column if not exists optical_depth double precision")
