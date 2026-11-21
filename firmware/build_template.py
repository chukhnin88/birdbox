import os
import shutil
import sys

envs = sys.argv[1:] or ["esp32", "esp32s3"]
for env in envs:
    src = os.path.join(".pio", "build", env)
    if not os.path.isdir(src):
        print("пропуск", env)
        continue
    dst = os.path.join("..", "server", "firmware_template", env)
    os.makedirs(dst, exist_ok=True)
    for f in ("bootloader.bin", "partitions.bin", "firmware.bin"):
        shutil.copy(os.path.join(src, f), os.path.join(dst, f))
    print("OK ->", dst)
