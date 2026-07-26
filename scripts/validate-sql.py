#!/usr/bin/env python3
"""Validate every migration against the real PostgreSQL parser."""
import glob, sys
try:
    import pglast
except ImportError:
    print("pglast not installed: pip install pglast"); sys.exit(0)

ok = True
for f in sorted(glob.glob("supabase/migrations/*.sql")):
    try:
        src = open(f).read()
        # psql client commands are not valid server-side SQL and are
        # rejected by the Supabase SQL Editor, so flag them.
        if any(l.strip().startswith("\\") for l in src.split("\n")):
            print(f"  FAIL {f}\n       contains a psql client command; "
                  f"the Supabase SQL Editor cannot run it")
            ok = False
            continue
        n = len(pglast.parse_sql(src))
        print(f"  ok   {f}  ({n} statements)")
    except pglast.parser.ParseError as e:
        ok = False
        print(f"  FAIL {f}\n       {e}")
sys.exit(0 if ok else 1)
