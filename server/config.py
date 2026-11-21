import os

DB_HOST = os.environ.get("BIRDBOX_DB_HOST", "localhost")
DB_PORT = int(os.environ.get("BIRDBOX_DB_PORT", "5432"))
DB_NAME = os.environ.get("BIRDBOX_DB_NAME", "birdbox")
DB_USER = os.environ.get("BIRDBOX_DB_USER", "postgres")
DB_PASSWORD = os.environ.get("BIRDBOX_DB_PASSWORD", "postgres")
SECRET_KEY = os.environ.get("BIRDBOX_SECRET_KEY", "birdbox-dev-secret")
