from __future__ import annotations

import os
from contextlib import contextmanager
from typing import IO, Iterator

if os.name == 'nt':
    import msvcrt
else:
    import fcntl


@contextmanager
def exclusive_file_lock(file_obj: IO[object]) -> Iterator[None]:
    file_descriptor = file_obj.fileno()

    if os.name == 'nt':
        original_position = file_obj.tell()
        file_obj.seek(0)
        locked = False
        try:
            msvcrt.locking(file_descriptor, msvcrt.LK_LOCK, 1)
            locked = True
            yield
        finally:
            if locked:
                file_obj.seek(0)
                try:
                    msvcrt.locking(file_descriptor, msvcrt.LK_UNLCK, 1)
                finally:
                    file_obj.seek(original_position)
            else:
                file_obj.seek(original_position)
        return

    fcntl.flock(file_descriptor, fcntl.LOCK_EX)
    try:
        yield
    finally:
        fcntl.flock(file_descriptor, fcntl.LOCK_UN)
